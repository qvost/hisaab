import type { Client, Currency, Invoice, InvoiceItem, Settings } from '../db/schema';
import { adToBs, normalizeAdDate } from '../calendar/samayamiiti';
import { getNepaliFiscalYear } from '../calendar/fiscal-year';
import { roundNpr } from '../forex/calculator';
export type TaxTreatment = 'export_zero' | 'domestic_pan' | 'domestic_vat';
export type InvoiceReference = {kind:'npr'} | {kind:'quote';rate:number;date:string;publishedOn:string;source:'api'|'cache'} | {kind:'benchmark';rate:number;period:string} | {kind:'unavailable'};
export interface InvoiceDocumentDetails {
  taxTreatment: TaxTreatment;
  seller: {name:string;pan:string;address:string};
  client: {name:string;email:string;country:string;address:string;pan:string};
  bank: {beneficiaryName:string;accountNumber:string;bankName:string;branch:string;swiftCode:string;routingNotes:string};
  reference: InvoiceReference;
  updatedAt:string;
}
export const EXPORT_NOTICE='Export of Information Technology Services outside Nepal — Zero-rated as per Section 7(2) of Value Added Tax Act, 2052. Payment received in convertible foreign currency via authorized banking rails.';
export function calculateInvoice(items: {description:string;quantity:number;unitPrice:number}[], treatment:TaxTreatment):Pick<Invoice,'items'|'subtotal'|'vatRate'|'vatAmount'|'totalAmount'|'isExport'> {
  if(!items.length||items.length>100)throw new Error('Add between 1 and 100 service items.');
  const lines:InvoiceItem[]=items.map(item=>{
    if(!item.description.trim()||item.description.length>2000||!Number.isFinite(item.quantity)||item.quantity<=0||!Number.isFinite(item.unitPrice)||item.unitPrice<0)throw new Error('Each item needs a description, a positive quantity and a non-negative rate.');
    return {...item,description:item.description.trim(),amount:roundNpr(item.quantity*item.unitPrice)};
  });
  const subtotal=roundNpr(lines.reduce((n,i)=>n+i.amount,0)),vatRate=treatment==='domestic_vat'?13:0,vatAmount=roundNpr(subtotal*vatRate/100);
  return {items:lines,subtotal,vatRate,vatAmount,totalAmount:roundNpr(subtotal+vatAmount),isExport:treatment==='export_zero'};
}
export function invoiceFiscalYear(issueDateAD:string){return getNepaliFiscalYear(adToBs(issueDateAD));}
export function nextInvoiceNumber(fiscalYear:string,existingNumbers:string[]):string {
  const prefix=`INV-${fiscalYear}-`;let max=0;
  for(const n of existingNumbers){if(n.startsWith(prefix)&&/^\d+$/.test(n.slice(prefix.length))){const value=Number(n.slice(prefix.length));if(Number.isSafeInteger(value))max=Math.max(max,value);}}
  if(max>=999999999)throw new Error('Invoice sequence exhausted.');
  return `${prefix}${String(max+1).padStart(3,'0')}`;
}
export function addDays(date:string,days:number):string{return new Date(Date.parse(`${normalizeAdDate(date)}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);}
export function defaultDocument(settings:Settings,client:Client|null,treatment:TaxTreatment):InvoiceDocumentDetails {
  const bank=settings.defaultBankAccounts[0];
  return {taxTreatment:treatment,seller:{name:settings.businessName||settings.ownerName,pan:settings.panNumber,address:settings.address??''},client:{name:client?.name??'',email:client?.email??'',country:client?.country??'',address:client?.address??'',pan:client?.panNumber??''},bank:{beneficiaryName:bank?.accountName??'',accountNumber:bank?.accountNumber??'',bankName:bank?.bankName??'',branch:bank?.branch??'',swiftCode:bank?.swiftCode??'',routingNotes:bank?.routingNotes??''},reference:client?.defaultCurrency==='NPR'?{kind:'npr'}:{kind:'unavailable'},updatedAt:new Date().toISOString()};
}
export function taxLabel(invoice:Invoice):string{return invoice.document?.taxTreatment==='domestic_pan'?'PAN invoice · no VAT':invoice.isExport?'0% VAT · IT export':'13% VAT';}
export function statusLabel(status:Invoice['status']):string{return status==='sent'?'Issued':status==='partially_paid'?'Partially paid':status.charAt(0).toUpperCase()+status.slice(1);}
export function summarizeInvoices(rows:Invoice[]) {
  const active=rows.filter(i=>i.status!=='draft'&&i.status!=='cancelled');
  const group=(values:Invoice[])=>{const map=new Map<Currency,number>();for(const row of values)map.set(row.currency,(map.get(row.currency)??0)+Math.round(row.totalAmount*100));return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([currency,cents])=>({currency,amount:cents/100}));};
  let equivalent=0,missing=0;
  for(const i of active){const ref=i.document?.reference;if(i.currency==='NPR')equivalent+=Math.round(i.totalAmount*100);else if(ref?.kind==='quote')equivalent+=Math.round(i.totalAmount*ref.rate*100);else missing++;}
  const pending=active.filter(i=>i.status!=='paid');
  return {billed:group(active),paid:group(active.filter(i=>i.status==='paid')),pending:group(pending),pendingCount:pending.length,nprEquivalent:equivalent/100,missingReferences:missing};
}
export function wireInstructions(bank:InvoiceDocumentDetails['bank']):string{return [`Beneficiary: ${bank.beneficiaryName}`,`Account: ${bank.accountNumber}`,`Bank: ${bank.bankName}${bank.branch?` · ${bank.branch}`:''}`,`SWIFT / BIC: ${bank.swiftCode}`,bank.routingNotes].filter(Boolean).join('\n');}
