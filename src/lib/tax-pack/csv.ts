import type {TaxPackData,TaxPackSummary} from './model';
import {csvCell} from '../remittances/csv';
export function taxRemittanceCsv(data:TaxPackData,summary:TaxPackSummary):string{
 const invoices=new Map(data.invoices.map(i=>[i.id,i])),clients=new Map(data.clients.map(c=>[c.id,c.name]));
 const header=['SN','Invoice_Number','Client_Source','Date_BS','Date_AD','Foreign_Currency','Foreign_Amount','NRB_Rate','Statutory_Gross_NPR','Bank_Name','Actual_Credited_NPR','TDS_5Pct_NPR','FX_Variance_NPR','SWIFT_Reference','NRB_Published_On','Rate_Provenance','Manual_Reason','Statement_Credit_Date_AD','Credit_Advice_Document_ID'];
 const rows=[...summary.remittances].sort((a,b)=>a.settlementDateAD.localeCompare(b.settlementDateAD)||(a.id??0)-(b.id??0)).map((r,index)=>{
  const invoice=r.invoiceId===null?undefined:invoices.get(r.invoiceId),evidence=r.audit?.rateEvidence,bank=data.bankTransactions.find(b=>b.reconciliationStatus==='matched'&&b.matchedRemittanceId===r.id);
  return [index+1,invoice?.invoiceNumber??'',r.audit?.sourceName??invoice?.document?.client.name??clients.get(invoice?.clientId)??'',r.settlementDateBS,r.settlementDateAD,r.foreignCurrency,r.foreignAmount,r.nrbBuyingRate,r.nrbGrossNPR,r.bankName,r.actualCreditedNPR,r.tdsWithheldNPR,r.realizedFxVarianceNPR,r.audit?.swiftReference??'',evidence?.kind==='official'?evidence.publishedOn:'',evidence?.kind??'unverified',evidence?.kind==='manual'?evidence.reason:'',bank?.dateAD??'',r.audit?.attachmentId??''].map(csvCell).join(',');
 });
 return '\uFEFF'+[header.map(csvCell).join(','),...rows].join('\r\n');
}
export function taxExpenseCsv(summary:TaxPackSummary):string{
 const header=['Date_BS','Date_AD','Vendor','Category','Original_Currency','Original_Amount','Reviewed_Deductible_NPR','Review_Note'];
 return '\uFEFF'+[header.map(csvCell).join(','),...summary.expenses.map(e=>[e.dateBS,e.dateAD,e.vendorName,e.category,e.currency,e.amount,e.assessment?.deductibleNPR??'',e.assessment?.note??'Not reviewed'].map(csvCell).join(','))].join('\r\n');
}
