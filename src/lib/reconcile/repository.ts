import {db} from '../db';
import type {BankTransaction,InvoiceStatus} from '../db/schema';
import type {MatchTarget} from '../parser/fuzzy-matcher';
import {bankLabel,statementIdentity,type NormalizedStatementRow,type StatementSource} from '../parser/statement-model';
import {roundNpr} from '../forex/calculator';
export async function importStatement(rows:NormalizedStatementRow[],options:{source:StatementSource;accountLabel:string;fileName:string}):Promise<{imported:number;duplicates:number;batchId:string}>{
 if(!options.accountLabel.trim()||!rows.length||rows.length>10000)throw new Error('Choose an account label and between 1 and 10,000 valid rows.');
 const batchId=crypto.randomUUID(),occurrences=new Map<string,number>();
 const prepared=await Promise.all(rows.map(async row=>{
  const base=statementIdentity(options.source,options.accountLabel,row,0),occurrence=occurrences.get(base)??0;occurrences.set(base,occurrence+1);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(statementIdentity(options.source,options.accountLabel,row,occurrence)));
  const importFingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const record:BankTransaction & {importFingerprint:string}={source:options.source,dateAD:row.dateAD,dateBS:row.dateBS,description:row.description,amountNPR:row.amountNPR,reconciliationStatus:'unmatched',matchedRemittanceId:null,matchedInvoiceId:null,createdAt:new Date().toISOString(),importFingerprint,statement:{accountLabel:options.accountLabel.trim(),bankName:bankLabel(options.source),reference:row.reference,fileName:options.fileName,batchId,rowNumber:row.rowNumber}};
  return record;
 }));
 return db.transaction('rw',db.bank_transactions,async()=>{
  let imported=0,duplicates=0;
  for(const record of prepared){if(await db.bank_transactions.where('importFingerprint').equals(record.importFingerprint).count()){duplicates++;continue;}await db.bank_transactions.add(record);imported++;}
  return {imported,duplicates,batchId};
 });
}
export async function confirmMatch(transactionId:number,target:MatchTarget,options:{completesInvoice:boolean;reason:string}):Promise<void>{
 await db.transaction('rw',[db.bank_transactions,db.remittances,db.invoices],async()=>{
  const transaction=await db.bank_transactions.get(transactionId);
  if(!transaction||transaction.amountNPR<=0)throw new Error('Select an incoming bank credit.');
  if(transaction.reconciliationStatus!=='unmatched')throw new Error('This transaction was already reviewed.');
  let invoiceId:number|null=null,remittanceId:number|null=null;
  if(target.kind==='remittance'){
   const remittance=await db.remittances.get(target.id);if(!remittance)throw new Error('Remittance no longer exists.');
   if(await db.bank_transactions.where('matchedRemittanceId').equals(target.id).filter(b=>b.reconciliationStatus==='matched').count())throw new Error('This remittance is already linked to another bank credit.');
   if(Math.abs(roundNpr(transaction.amountNPR-remittance.actualCreditedNPR))>.01)throw new Error('Bank credit differs from the remittance net amount. Edit or split the remittance before linking.');
   remittanceId=target.id;invoiceId=remittance.invoiceId;
  }else{invoiceId=target.id;}
  let previousInvoiceStatus:InvoiceStatus|null=null;
  if(invoiceId!==null){
   const invoice=await db.invoices.get(invoiceId);if(!invoice||['draft','cancelled'].includes(invoice.status))throw new Error('Choose an issued, open or paid invoice.');
   previousInvoiceStatus=invoice.status;
   let complete=options.completesInvoice;
   if(remittanceId!==null){
    const linked=await db.bank_transactions.where('matchedInvoiceId').equals(invoiceId).filter(b=>b.reconciliationStatus==='matched').toArray();
    const ids=[...new Set([...linked.flatMap(b=>b.matchedRemittanceId===null?[]:[b.matchedRemittanceId]),remittanceId])];
    const remittances=await db.remittances.bulkGet(ids);
    const foreignTotal=remittances.reduce((sum,r)=>sum+(r?.foreignCurrency===invoice.currency?r.foreignAmount:0),0);
    complete=foreignTotal+.005>=invoice.totalAmount;
   }else if(complete&&(await db.bank_transactions.where('matchedInvoiceId').equals(invoiceId).filter(b=>b.reconciliationStatus==='matched').count()))throw new Error('Invoice already has a matched payment. Review it or link this as a partial payment.');
   await db.invoices.update(invoiceId,{status:invoice.status==='paid'||complete?'paid':'partially_paid',reconciliationBaselineStatus:invoice.reconciliationBaselineStatus??invoice.status});
  }
  await db.bank_transactions.update(transactionId,{reconciliationStatus:'matched',matchedInvoiceId:invoiceId,matchedRemittanceId:remittanceId,reconciliation:{confirmedAt:new Date().toISOString(),previousInvoiceStatus,method:target.kind,reason:options.reason,completesInvoice:options.completesInvoice}});
 });
}
export async function ignoreTransaction(id:number):Promise<void>{
 await db.transaction('rw',db.bank_transactions,async()=>{const row=await db.bank_transactions.get(id);if(!row||row.reconciliationStatus!=='unmatched')throw new Error('Only unmatched transactions can be ignored.');await db.bank_transactions.update(id,{reconciliationStatus:'ignored',matchedInvoiceId:null,matchedRemittanceId:null});});
}
export async function resetTransaction(id:number):Promise<void>{
 await db.transaction('rw',[db.bank_transactions,db.invoices,db.remittances],async()=>{
  const row=await db.bank_transactions.get(id);if(!row)throw new Error('Transaction no longer exists.');
  if(row.matchedInvoiceId!==null){
   const invoice=await db.invoices.get(row.matchedInvoiceId),others=await db.bank_transactions.where('matchedInvoiceId').equals(row.matchedInvoiceId).filter(b=>b.id!==id&&b.reconciliationStatus==='matched').toArray();
   if(invoice&&invoice.reconciliationBaselineStatus){
    const baseline=invoice.reconciliationBaselineStatus;
    if(!others.length)await db.invoices.update(row.matchedInvoiceId,{status:baseline,reconciliationBaselineStatus:undefined});
    else{const receipts=await db.remittances.bulkGet(others.flatMap(b=>b.matchedRemittanceId===null?[]:[b.matchedRemittanceId]));const total=receipts.reduce((sum,r)=>sum+(r?.foreignCurrency===invoice.currency?r.foreignAmount:0),0);const complete=baseline==='paid'||others.some(b=>b.matchedRemittanceId===null&&b.reconciliation?.completesInvoice)||total+.005>=invoice.totalAmount;await db.invoices.update(row.matchedInvoiceId,{status:complete?'paid':'partially_paid'});}
   }
  }
  await db.bank_transactions.update(id,{reconciliationStatus:'unmatched',matchedInvoiceId:null,matchedRemittanceId:null,reconciliation:undefined});
 });
}
