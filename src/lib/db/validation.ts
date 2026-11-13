import type { InvoiceDocumentDetails, InvoiceReference } from '../invoices/model';
import type { RemittanceAudit, RateEvidence } from '../remittances/model';
import { parsePublication } from '../forex/types';
import type { Client, Invoice, InvoiceItem, RemittanceTransaction, BankTransaction, Expense, Settings, ForexCache, DocumentRecord, Currency, BankAccount } from './schema';
import { adToBs, normalizeAdDate } from '../calendar/samayamiiti';
import { getNepaliFiscalYear } from '../calendar/fiscal-year';
import { money } from './finance';
export interface BackupData { clients: Client[]; invoices: Invoice[]; remittances: RemittanceTransaction[]; bank_transactions: BankTransaction[]; expenses: Expense[]; settings: Settings[]; forex_cache: ForexCache[]; documents: DocumentRecord[] }
export interface BackupPayload { format: 'hisaab'; version: 2; exportedAt: string; data: BackupData }
function fail(message: string): never { throw new Error(`Invalid backup: ${message}`); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function object(value: unknown): Record<string, unknown> { if (!isRecord(value)) fail('expected a record'); return value; }
function text(value: unknown): string { if (typeof value !== 'string') fail('expected text'); return value; }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) fail('expected finite number'); return value; }
function positive(value: unknown): number { const n = number(value); if (n <= 0) fail('expected positive number'); return n; }
function nonnegative(value: unknown): number { const n = number(value); if (n < 0) fail('expected non-negative amount'); return n; }
function id(value: unknown): number { const n = positive(value); if (!Number.isSafeInteger(n)) fail('expected integer ID'); return n; }
function nullableId(value: unknown): number | null { return value === null ? null : id(value); }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail('expected boolean'); return value; }
function choice<T extends string>(value: unknown, values: readonly T[]): T { const found = values.find(v => v === value); if (!found) fail('unrecognized enum value'); return found; }
const currency = (v: unknown): Currency => choice(v, ['USD','EUR','GBP','AUD','NPR']);
function array<T>(value: unknown, parse: (v: unknown) => T): T[] { if (!Array.isArray(value) || value.length > 100000) fail('expected bounded array'); return value.map(parse); }
function timestamp(value: unknown): string { const s = text(value); if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || !Number.isFinite(Date.parse(s))) fail('invalid timestamp'); return s; }
function date(value: unknown): string { const s = text(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || normalizeAdDate(s) !== s) fail('invalid AD civil date'); adToBs(s); return s; }
function calendar(ad: string, bs: unknown, fy?: unknown): void { const expected = adToBs(ad); if (bs !== expected.formatted || (fy !== undefined && fy !== getNepaliFiscalYear(expected))) fail('AD, BS and fiscal year disagree'); }
function equalMoney(actual: number, expected: number): void { if (Math.abs(actual - money(expected)) > 0.001) fail('inconsistent financial totals'); }
function parseClient(v: unknown): Client { const r = object(v); return { id: id(r.id), name: text(r.name), clientType: choice(r.clientType,['individual','business']), country: text(r.country), defaultCurrency: currency(r.defaultCurrency), ...(r.panNumber!==undefined?{panNumber:text(r.panNumber)}:{}), email: text(r.email), address: text(r.address), createdAt: timestamp(r.createdAt) }; }
function parseItem(v: unknown): InvoiceItem { const r = object(v); const item = { description: text(r.description), quantity: positive(r.quantity), unitPrice: nonnegative(r.unitPrice), amount: nonnegative(r.amount) }; equalMoney(item.amount,item.quantity * item.unitPrice); return item; }
function parseInvoice(v: unknown): Invoice {
  const r = object(v);
  const row: Invoice = { id: id(r.id), invoiceNumber: text(r.invoiceNumber), clientId: id(r.clientId), status: choice(r.status,['draft','sent','partially_paid','paid','overdue','cancelled']), issueDateAD: date(r.issueDateAD), issueDateBS: text(r.issueDateBS), fiscalYearBS: text(r.fiscalYearBS), dueDateAD: date(r.dueDateAD), currency: currency(r.currency), items: array(r.items,parseItem), subtotal: nonnegative(r.subtotal), isExport: bool(r.isExport), vatRate: r.vatRate === 0 ? 0 : r.vatRate === 13 ? 13 : fail('invalid VAT rate'), vatAmount: nonnegative(r.vatAmount), totalAmount: nonnegative(r.totalAmount), paymentInstructions: text(r.paymentInstructions), createdAt: timestamp(r.createdAt) };
  if(r.reconciliationBaselineStatus!==undefined)row.reconciliationBaselineStatus=choice<Invoice['status']>(r.reconciliationBaselineStatus,['sent','partially_paid','paid','overdue']);
  if(r.document!==undefined)row.document=parseInvoiceDocument(r.document,row.issueDateAD,row.currency);
  calendar(row.issueDateAD,row.issueDateBS,row.fiscalYearBS);
  const treatment=row.document?.taxTreatment??(row.isExport?'export_zero':'domestic_vat');
  if(row.isExport!==(treatment==='export_zero')||row.vatRate!==(treatment==='domestic_vat'?13:0))fail('VAT treatment disagrees with export flag');
  if (!row.items.length) fail('invoice has no items');
  equalMoney(row.subtotal,row.items.reduce((sum,i) => sum + i.amount,0)); equalMoney(row.vatAmount,row.subtotal * row.vatRate / 100); equalMoney(row.totalAmount,row.subtotal + row.vatAmount);
  return row;
}
function parseInvoiceDocument(v:unknown,issueDateAD:string,currencyCode:Currency):InvoiceDocumentDetails {
  const r=object(v),seller=object(r.seller),client=object(r.client),bank=object(r.bank),ref=object(r.reference);
  let reference:InvoiceReference;
  if(ref.kind==='npr'){if(currencyCode!=='NPR')fail('NPR reference on foreign invoice');reference={kind:'npr'};}
  else if(ref.kind==='unavailable')reference={kind:'unavailable'};
  else if(ref.kind==='benchmark')reference={kind:'benchmark',rate:positive(ref.rate),period:text(ref.period)};
  else if(ref.kind==='quote'){
    const requested=date(ref.date),publishedOn=date(ref.publishedOn),gap=(Date.parse(requested)-Date.parse(publishedOn))/86400000;
    if(requested!==issueDateAD||gap<0||gap>5)fail('invoice reference date mismatch');
    reference={kind:'quote',rate:positive(ref.rate),date:requested,publishedOn,source:choice(ref.source,['api','cache'])};
  } else fail('invalid invoice reference');
  return {taxTreatment:choice(r.taxTreatment,['export_zero','domestic_pan','domestic_vat']),seller:{name:text(seller.name),pan:text(seller.pan),address:text(seller.address)},client:{name:text(client.name),email:text(client.email),country:text(client.country),address:text(client.address),pan:text(client.pan)},bank:{beneficiaryName:text(bank.beneficiaryName),accountNumber:text(bank.accountNumber),bankName:text(bank.bankName),branch:text(bank.branch),swiftCode:text(bank.swiftCode),routingNotes:text(bank.routingNotes)},reference,updatedAt:timestamp(r.updatedAt)};
}
function parseRemittance(v: unknown, legacy = false): RemittanceTransaction {
  const r = object(v);
  const row: RemittanceTransaction = { id: id(r.id), invoiceId: nullableId(r.invoiceId), settlementDateAD: date(r.settlementDateAD), settlementDateBS: text(r.settlementDateBS), fiscalYearBS: text(r.fiscalYearBS), foreignCurrency: currency(r.foreignCurrency), foreignAmount: positive(r.foreignAmount), nrbBuyingRate: positive(r.nrbBuyingRate), nrbGrossNPR: nonnegative(r.nrbGrossNPR), actualCreditedNPR: nonnegative(r.actualCreditedNPR), bankRealizedRate: nonnegative(r.bankRealizedRate), intermediaryFeeNPR: nonnegative(r.intermediaryFeeNPR), tdsWithheldNPR: nonnegative(r.tdsWithheldNPR), realizedFxVarianceNPR: number(r.realizedFxVarianceNPR), bankName: text(r.bankName), createdAt: timestamp(r.createdAt) };
  if (r.audit !== undefined) row.audit = parseAudit(r.audit,row.settlementDateAD);
  calendar(row.settlementDateAD,row.settlementDateBS,row.fiscalYearBS);
  equalMoney(row.nrbGrossNPR,row.foreignAmount * row.nrbBuyingRate);
  const gross = row.actualCreditedNPR + row.tdsWithheldNPR + row.intermediaryFeeNPR;
  equalMoney(row.realizedFxVarianceNPR,gross - row.nrbGrossNPR);
  if (Math.abs(row.bankRealizedRate - (legacy ? gross : row.actualCreditedNPR) / row.foreignAmount) > 0.000001) fail('inconsistent bank rate');
  row.bankRealizedRate = row.actualCreditedNPR / row.foreignAmount;
  return row;
}
function parseAudit(v: unknown, settlementDateAD: string): RemittanceAudit {
  const r = object(v), evidence = object(r.rateEvidence);
  let rateEvidence: RateEvidence;
  if (evidence.kind === 'official') {
    const requestedDate = date(evidence.requestedDate), publishedOn = date(evidence.publishedOn);
    const gap = (Date.parse(requestedDate)-Date.parse(publishedOn))/86400000;
    if (requestedDate !== settlementDateAD || gap < 0 || gap > 5) fail('rate provenance date mismatch');
    rateEvidence = {kind:'official',source:choice(evidence.source,['api','cache']),requestedDate,publishedOn};
  } else if (evidence.kind === 'manual') {
    const reason=text(evidence.reason);if (!reason.trim()) fail('manual rate needs a reason');
    rateEvidence={kind:'manual',reason};
  } else if (evidence.kind === 'unverified') rateEvidence={kind:'unverified'};
  else fail('invalid rate provenance');
  return {sourceName:text(r.sourceName),narration:text(r.narration),swiftReference:text(r.swiftReference),attachmentId:nullableId(r.attachmentId),rateEvidence,updatedAt:timestamp(r.updatedAt)};
}
function parseBank(v: unknown): BankTransaction {
  const r = object(v); const row: BankTransaction = { id: id(r.id), source: choice(r.source,['connectips','nabil','nic_asia','global_ime','esewa','khalti','other']), dateAD: date(r.dateAD), dateBS: text(r.dateBS), description: text(r.description), amountNPR: number(r.amountNPR), reconciliationStatus: choice(r.reconciliationStatus,['unmatched','matched','ignored']), matchedRemittanceId: nullableId(r.matchedRemittanceId), matchedInvoiceId: nullableId(r.matchedInvoiceId), createdAt: timestamp(r.createdAt) };
  if(r.importFingerprint!==undefined){const fingerprint=text(r.importFingerprint);if(!/^[a-f0-9]{64}$/.test(fingerprint))fail('invalid statement fingerprint');row.importFingerprint=fingerprint;}
  if(r.statement!==undefined){const metadata=object(r.statement);row.statement={accountLabel:text(metadata.accountLabel),bankName:text(metadata.bankName),reference:text(metadata.reference),fileName:text(metadata.fileName),batchId:text(metadata.batchId),rowNumber:id(metadata.rowNumber)};}
  if(r.reconciliation!==undefined){const audit=object(r.reconciliation);row.reconciliation={confirmedAt:timestamp(audit.confirmedAt),previousInvoiceStatus:audit.previousInvoiceStatus===null?null:choice<Invoice['status']>(audit.previousInvoiceStatus,['draft','sent','partially_paid','paid','overdue','cancelled']),method:choice(audit.method,['invoice','remittance']),reason:text(audit.reason),completesInvoice:bool(audit.completesInvoice)};if(row.reconciliationStatus!=='matched')fail('unmatched bank transaction has confirmation metadata');}
  calendar(row.dateAD,row.dateBS);
  if (row.reconciliationStatus !== 'matched' && (row.matchedInvoiceId !== null || row.matchedRemittanceId !== null)) fail('unmatched bank transaction has links');
  if (row.reconciliationStatus === 'matched' && row.matchedInvoiceId === null && row.matchedRemittanceId === null) fail('matched bank transaction has no links');
  return row;
}
function parseExpense(v: unknown): Expense {
  const r = object(v); const row: Expense = { id: id(r.id), dateAD: date(r.dateAD), dateBS: text(r.dateBS), fiscalYearBS: text(r.fiscalYearBS), category: text(r.category), vendorName: text(r.vendorName), description: text(r.description), currency: currency(r.currency), amount: nonnegative(r.amount), createdAt: timestamp(r.createdAt) };
  if(r.assessment!==undefined){const assessment=object(r.assessment);row.assessment={deductibleNPR:nonnegative(assessment.deductibleNPR),note:text(assessment.note),reviewedAt:timestamp(assessment.reviewedAt)};}
  calendar(row.dateAD,row.dateBS,row.fiscalYearBS); return row;
}
function parseAccount(v: unknown): BankAccount { const r = object(v); return { bankName: text(r.bankName), accountName: text(r.accountName), accountNumber: text(r.accountNumber), swiftCode: text(r.swiftCode),...(r.accountType!==undefined?{accountType:choice<'NPR'|'FCY'>(r.accountType,['NPR','FCY'])}:{}),...(r.branch!==undefined?{branch:text(r.branch)}:{}),...(r.routingNotes!==undefined?{routingNotes:text(r.routingNotes)}:{}) }; }
function parseSettings(v: unknown): Settings {
  const r = object(v); if (r.id !== 'profile') fail('settings ID must be profile');
  return { id: 'profile', ...(r.address!==undefined?{address:text(r.address)}:{}), businessName: text(r.businessName), ownerName: text(r.ownerName), panNumber: text(r.panNumber), taxMode: choice(r.taxMode,['freelancer_5pct_final','sole_proprietor','pvt_ltd']), defaultBankAccounts: array(r.defaultBankAccounts,parseAccount) };
}
function parseForex(v: unknown): ForexCache {
  const r = object(v), publication = parsePublication(r,date(r.date));
  if (!Object.keys(publication.rates).length) fail('cannot cache an empty publication');
  return { ...publication,fetchedAt:timestamp(r.fetchedAt) };
}
function parseDocument(v: unknown): DocumentRecord { const r = object(v); const contentBase64 = text(r.contentBase64); if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64)) fail('invalid document encoding'); return { id: id(r.id), fileName: text(r.fileName), mimeType: text(r.mimeType), contentBase64, createdAt: timestamp(r.createdAt) }; }
function unique<T>(rows: T[], key: (r: T) => unknown): void { if (new Set(rows.map(key)).size !== rows.length) fail('duplicate primary keys'); }
export function parseBackupPayload(value: unknown): BackupPayload {
  const r = object(value); if (r.format !== 'hisaab' || (r.version !== 1 && r.version !== 2)) fail('unsupported backup format or version');
  const d = object(r.data);
  const data: BackupData = { clients: array(d.clients,parseClient), invoices: array(d.invoices,parseInvoice), remittances: array(d.remittances,v => parseRemittance(v,r.version === 1)), bank_transactions: array(d.bank_transactions,parseBank), expenses: array(d.expenses,parseExpense), settings: array(d.settings,parseSettings), forex_cache: r.version === 1 ? (array(d.forex_cache,object), []) : array(d.forex_cache,parseForex), documents: array(d.documents,parseDocument) };
  const numberedTables: { id?: number }[][] = [data.clients,data.invoices,data.remittances,data.bank_transactions,data.expenses,data.documents];
  for (const rows of numberedTables) unique(rows, row => row.id);
  unique(data.bank_transactions.filter(r=>r.importFingerprint!==undefined),r=>r.importFingerprint);
  unique(data.forex_cache,row => row.date); if (data.settings.length > 1) fail('multiple profiles');
  const clients = new Set(data.clients.map(c => c.id)); const invoices = new Map(data.invoices.map(i => [i.id,i])); const remittances = new Map(data.remittances.map(r => [r.id,r]));
  for (const i of data.invoices) if (!clients.has(i.clientId)) fail('invoice references missing client');
  for (const r of data.remittances) if (r.invoiceId !== null && invoices.get(r.invoiceId)?.currency !== r.foreignCurrency) fail('remittance has missing invoice or inconsistent currency');
  const documents = new Set(data.documents.map(d => d.id));
  for (const r of data.remittances) if (r.audit?.attachmentId != null && !documents.has(r.audit.attachmentId)) fail('remittance references missing credit advice');
  for (const b of data.bank_transactions) {
    if (b.matchedInvoiceId !== null && !invoices.has(b.matchedInvoiceId)) fail('bank transaction references missing invoice');
    if (b.matchedRemittanceId !== null && !remittances.has(b.matchedRemittanceId)) fail('bank transaction references missing remittance');
    if (b.matchedInvoiceId !== null && b.matchedRemittanceId !== null && remittances.get(b.matchedRemittanceId)?.invoiceId !== b.matchedInvoiceId) fail('bank transaction links disagree');
  }
  return { format: 'hisaab', version: 2, exportedAt: timestamp(r.exportedAt), data };
}
