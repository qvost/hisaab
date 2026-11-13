import { db, invoiceDates } from '../db';
import type { Client, Invoice } from '../db/schema';
import { addDays, calculateInvoice, nextInvoiceNumber, wireInstructions, type InvoiceDocumentDetails } from './model';
import { adToBs } from '../calendar/samayamiiti';
import { nstToday } from '../forex/types';
export interface InvoiceInput { invoiceNumber:string;autoNumber:boolean;clientId:number;issueDateAD:string;dueDateAD:string;currency:Invoice['currency'];items:{description:string;quantity:number;unitPrice:number}[];document:InvoiceDocumentDetails }
export async function saveInvoice(input:InvoiceInput,status:'draft'|'sent',id?:number):Promise<number>{
  const dates=invoiceDates(input.issueDateAD);adToBs(input.dueDateAD);
  if(input.dueDateAD<input.issueDateAD)throw new Error('Due date must be on or after the issue date.');
  if(input.issueDateAD>nstToday()&&status==='sent')throw new Error('Future invoices can be saved as drafts.');
  const totals=calculateInvoice(input.items,input.document.taxTreatment);
  const bank=input.document.bank;
  if(bank.beneficiaryName.length>150||bank.accountNumber.length>80||bank.bankName.length>150||bank.branch.length>120||bank.swiftCode.length>80||bank.routingNotes.length>1000)throw new Error('Shorten the bank instructions to fit the invoice.');
  if(status==='sent'&&(!bank.beneficiaryName.trim()||!bank.accountNumber.trim()||!bank.bankName.trim()||(totals.isExport&&!bank.swiftCode.trim())))throw new Error('Complete the beneficiary, account, bank and export SWIFT details before issuing.');
  if(!input.document.seller.name.trim()||!/^\d{9}$/.test(input.document.seller.pan))throw new Error('Enter a seller name and nine-digit PAN.');
  if(status==='sent'&&(!input.document.seller.address.trim()||!input.document.client.address.trim()))throw new Error('Add seller and billing addresses before issuing.');
  return db.transaction('rw',db.invoices,db.clients,async()=>{
    const existing=id===undefined?undefined:await db.invoices.get(id);
    if(id!==undefined&&(!existing||existing.status!=='draft'))throw new Error('Only an existing draft can be edited.');
    const client=await db.clients.get(input.clientId);if(!client)throw new Error('Select an existing client.');
    if(client.country.toUpperCase()==='NP'&&totals.isExport)throw new Error('Use domestic PAN or VAT treatment for a Nepali client.');
    if(totals.isExport&&input.currency==='NPR')throw new Error('IT export invoices require a convertible foreign currency.');
    if(!totals.isExport&&input.currency!=='NPR')throw new Error('Domestic invoices must be denominated in NPR.');
    if(input.document.client.country.toUpperCase()!==client.country.toUpperCase())throw new Error('Client country does not match the selected client.');
    const reference=input.document.reference;
    if(reference.kind==='quote'&&(reference.date!==input.issueDateAD||!Number.isFinite(reference.rate)||reference.rate<=0))throw new Error('Reference quote must match the issue date.');
    let invoiceNumber=input.invoiceNumber.trim();
    if(input.autoNumber)invoiceNumber=nextInvoiceNumber(dates.fiscalYearBS,(await db.invoices.toArray()).map(i=>i.invoiceNumber));
    if(!invoiceNumber||invoiceNumber.length>80)throw new Error('Invoice number must contain 1–80 characters.');
    if((await db.invoices.where('invoiceNumber').equals(invoiceNumber).toArray()).some(i=>i.id!==id))throw new Error('That invoice number is already in use.');
    return db.invoices.put({...(id===undefined?{}:{id}),invoiceNumber,clientId:input.clientId,status,...dates,dueDateAD:input.dueDateAD,currency:input.currency,...totals,paymentInstructions:wireInstructions(input.document.bank),document:{...input.document,updatedAt:new Date().toISOString()},createdAt:existing?.createdAt??new Date().toISOString()});
  });
}
export async function addClient(input:Omit<Client,'id'|'createdAt'>):Promise<number>{
  if(!input.name.trim()||!input.address.trim()||!input.email.trim()||!/^\S+@\S+\.\S+$/.test(input.email)||! /^[A-Z]{2}$/.test(input.country))throw new Error('Enter a name, valid email, billing address and two-letter country code.');
  if(input.panNumber&&!/^\d{9}$/.test(input.panNumber))throw new Error('PAN/VAT number must have nine digits.');
  if(input.country==='NP'&&!/^\d{9}$/.test(input.panNumber??''))throw new Error('Add the domestic client’s nine-digit PAN/VAT number.');
  if(input.country==='NP'&&input.defaultCurrency!=='NPR')throw new Error('Choose NPR for a domestic client.');
  return db.clients.add({...input,name:input.name.trim(),createdAt:new Date().toISOString()});
}
export async function setInvoiceStatus(id:number,status:'paid'|'cancelled'):Promise<void>{
  await db.transaction('rw',db.invoices,db.remittances,db.bank_transactions,async()=>{
    const invoice=await db.invoices.get(id);if(!invoice)throw new Error('Invoice no longer exists.');
    if(invoice.status==='draft'||invoice.status==='cancelled')throw new Error('Issue a draft before recording payment. Cancelled invoices cannot be paid.');
    if(status==='cancelled'&&((await db.remittances.where('invoiceId').equals(id).count())||(await db.bank_transactions.where('matchedInvoiceId').equals(id).count())))throw new Error('Unlink settlements before cancelling this invoice.');
    await db.invoices.update(id,{status,...(invoice.reconciliationBaselineStatus?{reconciliationBaselineStatus:status}:{})});
  });
}
export async function duplicateInvoice(id:number):Promise<number>{
  return db.transaction('rw',db.invoices,async()=>{
    const original=await db.invoices.get(id);if(!original)throw new Error('Invoice no longer exists.');
    const today=nstToday(),dates=invoiceDates(today),invoiceNumber=nextInvoiceNumber(dates.fiscalYearBS,(await db.invoices.toArray()).map(i=>i.invoiceNumber));
    const {id:oldId,reconciliationBaselineStatus:priorReconciliation,...copy}=original;
    return db.invoices.add({...copy,invoiceNumber,status:'draft',...dates,dueDateAD:addDays(today,30),...(copy.document?{document:{...copy.document,reference:copy.currency==='NPR'?{kind:'npr'}:{kind:'unavailable'},updatedAt:new Date().toISOString()}}:{}),createdAt:new Date().toISOString()});
  });
}
export async function deleteInvoice(id:number):Promise<void>{
  await db.transaction('rw',db.invoices,db.remittances,db.bank_transactions,async()=>{
    const row=await db.invoices.get(id);if(!row)throw new Error('Invoice no longer exists.');
    if((await db.remittances.where('invoiceId').equals(id).count())||(await db.bank_transactions.where('matchedInvoiceId').equals(id).count()))throw new Error('Remove linked remittances and reconciliation links before deleting.');
    await db.invoices.delete(id);
  });
}
