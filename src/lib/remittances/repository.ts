import {confirmMatch} from '../reconcile/repository';
import { db, remittanceDates } from '../db';
import type { Currency, RemittanceTransaction } from '../db/schema';
import { calculateRemittance } from '../db/finance';
import { encodeAdvice } from './attachments';
import type { RemittanceAudit, RateEvidence } from './model';
import { nstToday } from '../forex/types';
export interface RemittanceInput {
  settlementDateAD: string; foreignCurrency: Currency; foreignAmount: number; nrbBuyingRate: number;
  actualCreditedNPR: number; tdsWithheldNPR: number; intermediaryFeeNPR: number;
  bankName: string; sourceName: string; narration: string; swiftReference: string;
  invoiceId: number | null; rateEvidence: RateEvidence;
}
export async function saveRemittance(input: RemittanceInput, options: { id?: number; file: File | null; removeAttachment: boolean; bankTransactionId?:number }): Promise<{ id: number; fiscalYearBS: string }> {
  if (!input.sourceName.trim() || !input.bankName.trim()) throw new Error('Enter a source and receiving bank.');
  if (!['USD','EUR','GBP','AUD'].includes(input.foreignCurrency)) throw new Error('Select a foreign currency.');
  const dates=remittanceDates(input.settlementDateAD);
  if (dates.settlementDateAD > nstToday()) throw new Error('Settlement date cannot be in the future.');
  const figures=calculateRemittance(input), evidence=input.rateEvidence;
  if (evidence.kind === 'manual' && !evidence.reason.trim()) throw new Error('Explain the manual rate override.');
  if (evidence.kind === 'official') {
    const gap=(Date.parse(dates.settlementDateAD)-Date.parse(evidence.publishedOn))/86400000;
    if (evidence.requestedDate !== dates.settlementDateAD || !Number.isInteger(gap) || gap < 0 || gap > 5) throw new Error('Rate provenance does not match the settlement date.');
  }
  // File work finishes before opening a transaction, so IndexedDB cannot auto-commit during encoding.
  const document=options.file ? await encodeAdvice(options.file) : null;
  return db.transaction('rw',[db.remittances,db.documents,db.bank_transactions,db.invoices],async()=>{
    const existing=options.id === undefined ? undefined : await db.remittances.get(options.id);
    if (options.id !== undefined && !existing) throw new Error('This remittance was deleted. Reload the ledger.');
    if (options.id !== undefined && await db.bank_transactions.where('matchedRemittanceId').equals(options.id).count()) throw new Error('Unmatch the linked bank transaction before editing this remittance.');
    if (input.invoiceId !== null) {
      const invoice=await db.invoices.get(input.invoiceId);
      if (!invoice || invoice.currency !== input.foreignCurrency) throw new Error('Linked invoice must exist and use the same currency.');
    }
    if(options.bankTransactionId!==undefined){const bank=await db.bank_transactions.get(options.bankTransactionId);if(!bank||bank.reconciliationStatus!=='unmatched'||Math.abs((Date.parse(bank.dateAD)-Date.parse(dates.settlementDateAD))/86400000)>4||Math.abs(bank.amountNPR-input.actualCreditedNPR)>.005)throw new Error('The imported deposit changed, or its settlement date/amount no longer matches.');}
    const oldAttachment=existing?.audit?.attachmentId ?? null;
    const attachmentId=document ? await db.documents.add(document) : options.removeAttachment ? null : oldAttachment;
    const audit: RemittanceAudit={sourceName:input.sourceName.trim(),narration:input.narration.trim(),swiftReference:input.swiftReference.trim(),attachmentId,rateEvidence:evidence,updatedAt:new Date().toISOString()};
    const record: RemittanceTransaction={...(existing?.id === undefined ? {} : {id:existing.id}),invoiceId:input.invoiceId,...dates,foreignCurrency:input.foreignCurrency,foreignAmount:input.foreignAmount,nrbBuyingRate:input.nrbBuyingRate,...figures,actualCreditedNPR:input.actualCreditedNPR,intermediaryFeeNPR:input.intermediaryFeeNPR,bankName:input.bankName.trim(),createdAt:existing?.createdAt ?? new Date().toISOString(),audit};
    const id=await db.remittances.put(record);
    if (oldAttachment !== null && oldAttachment !== attachmentId && !(await db.remittances.toCollection().filter(r=>r.audit?.attachmentId===oldAttachment).count())) await db.documents.delete(oldAttachment);
    if(options.bankTransactionId!==undefined)await confirmMatch(options.bankTransactionId,{kind:'remittance',id},{completesInvoice:false,reason:'created_from_statement'});
    return {id,fiscalYearBS:dates.fiscalYearBS};
  });
}
export async function deleteRemittance(id: number): Promise<void> {
  await db.transaction('rw',db.remittances,db.documents,db.bank_transactions,async()=>{
    if (await db.bank_transactions.where('matchedRemittanceId').equals(id).count()) throw new Error('Unmatch the linked bank transaction before deleting this remittance.');
    const row=await db.remittances.get(id);if (!row) throw new Error('Remittance no longer exists.');
    await db.remittances.delete(id);
    const attachmentId=row.audit?.attachmentId;
    if (attachmentId != null && !(await db.remittances.toCollection().filter(r=>r.audit?.attachmentId===attachmentId).count())) await db.documents.delete(attachmentId);
  });
}
