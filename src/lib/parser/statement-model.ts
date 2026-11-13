import type {BankTransaction} from '../db/schema';
import {adToBs,bsToAd,parseBsDate} from '../calendar/samayamiiti';
import {roundNpr} from '../forex/calculator';
export type StatementSource='connectips'|'nabil'|'nic_asia'|'global_ime'|'esewa'|'khalti'|'other';
export interface StatementMetadata {accountLabel:string;bankName:string;reference:string;fileName:string;batchId:string;rowNumber:number}
export interface ReconciliationAudit {confirmedAt:string;previousInvoiceStatus:'draft'|'sent'|'partially_paid'|'paid'|'overdue'|'cancelled'|null;method:'remittance'|'invoice';reason:string;completesInvoice:boolean}
export type DateFormat='ymd'|'dmy'|'mdy'|'bs';
export type ColumnMapping={date:number;description:number;reference:number|null}&({kind:'columns';credit:number;debit:number|null}|{kind:'wallet';amount:number;direction:number});
export interface StatementSheet {name:string;rows:string[][]}
export interface NormalizedStatementRow {dateAD:string;dateBS:string;description:string;amountNPR:number;reference:string;rowNumber:number}
export function normalizeHeader(value:string):string{return value.toLowerCase().replace(/[^a-z0-9]/g,'');}
const labels:Record<StatementSource,string>={connectips:'ConnectIPS',nabil:'Nabil Bank',nic_asia:'NIC Asia',global_ime:'Global IME',esewa:'eSewa',khalti:'Khalti',other:'Other bank'};
export function bankLabel(source:StatementSource):string{return labels[source];}
export function detectColumns(headers:string[]):ColumnMapping|null{
 const normalized=headers.map(normalizeHeader),find=(names:string[])=>normalized.findIndex(h=>names.includes(h));
 const date=find(['date','txndate','transactiondate','valuedate']),description=find(['remarks','description','narration','descriptionnarration','particulars']),reference=find(['reference','referenceno','transactionid','ref','refno']);
 if(date<0||description<0)return null;
 const credit=find(['credit','creditamount','cr','deposit','deposits']),debit=find(['debit','debitamount','dr','withdrawal','withdrawals']);
 if(credit>=0)return {kind:'columns',date,description,credit,debit:debit<0?null:debit,reference:reference<0?null:reference};
 const amount=find(['amount','transactionamount']),direction=find(['type','transactiontype','direction']);
 return amount>=0&&direction>=0?{kind:'wallet',date,description,amount,direction,reference:reference<0?null:reference}:null;
}
export function parseStatementDate(value:string,format:DateFormat):string{
 const input=value.trim().replace(/[०-९]/g,d=>String('०१२३४५६७८९'.indexOf(d)));
 if(format==='bs'){const match=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(input);if(!match)throw new Error('BS dates must be YYYY-MM-DD.');const bs=parseBsDate(`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`);return bsToAd(bs.year,bs.month,bs.day).toISOString().slice(0,10);}
 let year:number,month:number,day:number;
 if(format==='ymd'){const match=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(input);if(!match)throw new Error('Expected YYYY-MM-DD.');year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);}
 else{const match=/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?: \d{2}:\d{2}(?::\d{2})?)?$/.exec(input);if(!match)throw new Error(`Expected ${format==='dmy'?'DD/MM/YYYY':'MM/DD/YYYY'}.`);year=Number(match[3]);month=Number(match[format==='dmy'?2:1]);day=Number(match[format==='dmy'?1:2]);}
 const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 if(!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw new Error('Invalid statement date.');
 adToBs(date);return date;
}
export function parseStatementMoney(value:string):number{
 let text=value.trim();if(!text||text==='-'||/^n\/?a$/i.test(text))return 0;
 text=text.replace(/^(?:NPR|Rs\.?|रु\.?)\s*/i,'').replace(/[०-९]/g,d=>String('०१२३४५६७८९'.indexOf(d)));
 if(text.includes(',')){if(!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(text))throw new Error('Invalid grouping in amount.');text=text.replace(/,/g,'');}
 if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Amounts must be NPR numbers with at most two decimals.');
 return roundNpr(Number(text));
}
export function normalizeStatementRows(rows:string[][],mapping:ColumnMapping,format:DateFormat,startRow=2):{valid:NormalizedStatementRow[];errors:{row:number;message:string}[];skipped:number}{
 const valid:NormalizedStatementRow[]=[],errors:{row:number;message:string}[]=[];let skipped=0;
 rows.forEach((row,index)=>{
  if(row.every(v=>!v.trim())){skipped++;return;}
  try{
   const required=[mapping.date,mapping.description,...(mapping.kind==='columns'?[mapping.credit,...(mapping.debit===null?[]:[mapping.debit])]:[mapping.amount,mapping.direction])];
   if(new Set(required).size!==required.length||required.some(n=>!Number.isInteger(n)||n<0||n>=row.length))throw new Error('Choose distinct, valid date, description and amount columns.');
   const dateAD=parseStatementDate(row[mapping.date],format),description=row[mapping.description].trim();if(!description)throw new Error('Narration is empty.');
   let amountNPR:number;
   if(mapping.kind==='columns'){const credit=parseStatementMoney(row[mapping.credit]),debit=mapping.debit===null?0:parseStatementMoney(row[mapping.debit]);if(credit<0||debit<0||credit>0&&debit>0)throw new Error('Separate credit/debit columns must be non-negative and have only one side populated.');amountNPR=credit-debit;}
   else{const amount=parseStatementMoney(row[mapping.amount]),direction=row[mapping.direction].trim().toLowerCase();if(amount<0)throw new Error('Wallet amounts must be positive with a direction.');if(['credit','cr','received','receive','incoming','deposit','cash in'].includes(direction))amountNPR=amount;else if(['debit','dr','sent','send','outgoing','withdrawal','payment','cash out'].includes(direction))amountNPR=-amount;else throw new Error(`Unknown wallet direction: ${direction}.`);}
   if(amountNPR===0){skipped++;return;}
   valid.push({dateAD,dateBS:adToBs(dateAD).formatted,description,amountNPR,reference:mapping.reference===null?'':(row[mapping.reference]??'').trim(),rowNumber:startRow+index});
  }catch(e){errors.push({row:startRow+index,message:e instanceof Error?e.message:'Invalid statement row.'});}
 });
 return {valid,errors,skipped};
}
/** Occurrence suffixes preserve distinct identical rows when a bank supplies no transaction reference. */
export function statementIdentity(source:StatementSource,account:string,row:NormalizedStatementRow,occurrence:number):string{return JSON.stringify([source,account.trim().toLowerCase(),row.dateAD,Math.round(row.amountNPR*100),row.reference.trim().toUpperCase(),row.description.replace(/\s+/g,' ').trim().toUpperCase(),row.reference?0:occurrence]);}
