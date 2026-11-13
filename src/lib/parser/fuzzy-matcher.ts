import type {BankTransaction,Client,Invoice,RemittanceTransaction} from '../db/schema';
import type {NrbRateResult} from '../forex/types';
import {roundNpr} from '../forex/calculator';
export type MatchTarget={kind:'remittance';id:number}|{kind:'invoice';id:number};
export interface MatchCandidate {target:MatchTarget;confidence:'high'|'medium';rule:'exact_net'|'tds_adjusted'|'narration';expectedNPR:number|null;amountDelta:number|null;dateDelta:number;keywords:string[]}
export interface MatchResult {confidence:'high'|'medium'|'none';recommended:MatchCandidate|null;candidates:MatchCandidate[];ambiguous:boolean;keywords:string[]}
export interface MatchContext {remittances:RemittanceTransaction[];invoices:Invoice[];clients:Client[];bankTransactions:BankTransaction[];quotes:Record<string,NrbRateResult>}
const platforms=['WISE','PAYONEER','DEEL','UPWORK','STRIPE','SWIFT'];
export const quoteKey=(date:string,currency:string)=>`${date}:${currency}`;
export function narrationTokens(text:string):string[]{return [...new Set(text.toUpperCase().normalize('NFKD').replace(/\p{M}/gu,'').split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>=3&&!['INC','LTD','LLC','GMBH','THE','BANK','PAYMENTS','TRANSFER','TRF'].includes(t)))];}
function oneEdit(a:string,b:string):boolean{
 if(Math.abs(a.length-b.length)>1||Math.min(a.length,b.length)<5||Math.max(a.length,b.length)>40)return false;
 let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;}else{if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}}return edits+(i<a.length||j<b.length?1:0)<=1;
}
function overlap(narration:string,name:string):string[]{const words=narrationTokens(narration),names=narrationTokens(name),compact=names.join('');if(compact.length>=6&&words.join('').includes(compact))return names;return names.filter(w=>words.includes(w)||words.some(token=>oneEdit(w,token)));}
const delta=(a:string,b:string)=>(Date.parse(`${a}T00:00:00Z`)-Date.parse(`${b}T00:00:00Z`))/86400000;
export function suggestMatches(transaction:BankTransaction,context:MatchContext):MatchResult{
 const keywords=platforms.filter(k=>narrationTokens(transaction.description).includes(k)),candidates:MatchCandidate[]=[];
 if(transaction.amountNPR<=0||transaction.reconciliationStatus!=='unmatched')return {confidence:'none',recommended:null,candidates:[],ambiguous:false,keywords};
 const occupiedRemittances=new Set(context.bankTransactions.filter(b=>b.id!==transaction.id&&b.reconciliationStatus==='matched').map(b=>b.matchedRemittanceId));
 const occupiedInvoices=new Set(context.bankTransactions.filter(b=>b.id!==transaction.id&&b.reconciliationStatus==='matched').map(b=>b.matchedInvoiceId));
 const clients=new Map(context.clients.map(c=>[c.id,c.name])),invoices=new Map(context.invoices.map(i=>[i.id,i]));
 for(const r of context.remittances){
  if(r.id===undefined||occupiedRemittances.has(r.id))continue;
  const days=delta(transaction.dateAD,r.settlementDateAD),difference=roundNpr(transaction.amountNPR-r.actualCreditedNPR),hits=overlap(transaction.description,`${r.audit?.sourceName??''} ${clients.get(invoices.get(r.invoiceId??undefined)?.clientId)??''}`);
  if(Math.abs(days)<=4&&Math.abs(difference)<=.01)candidates.push({target:{kind:'remittance',id:r.id},confidence:'high',rule:'exact_net',expectedNPR:r.actualCreditedNPR,amountDelta:difference,dateDelta:days,keywords:hits});
  else if(hits.length)candidates.push({target:{kind:'remittance',id:r.id},confidence:'medium',rule:'narration',expectedNPR:r.actualCreditedNPR,amountDelta:difference,dateDelta:days,keywords:hits});
 }
 const exactInvoiceIds=new Set(candidates.filter(c=>c.rule==='exact_net').map(c=>context.remittances.find(r=>r.id===c.target.id)?.invoiceId));
 for(const i of context.invoices){
  if(i.id===undefined||occupiedInvoices.has(i.id)||exactInvoiceIds.has(i.id)||!['sent','partially_paid','overdue'].includes(i.status))continue;
  const days=delta(transaction.dateAD,i.issueDateAD),hits=overlap(transaction.description,i.document?.client.name??clients.get(i.clientId)??''),quote=context.quotes[quoteKey(transaction.dateAD,i.currency)];
  const expected=i.currency==='NPR'?i.totalAmount:quote&&quote.source!=='bundled'?roundNpr(i.totalAmount*quote.rate*.95):null;
  const difference=expected===null?null:roundNpr(transaction.amountNPR-expected);
  if(i.currency!=='NPR'&&expected!==null&&Math.abs(days)<=5&&difference!==null&&Math.abs(difference)<=.01)candidates.push({target:{kind:'invoice',id:i.id},confidence:'high',rule:'tds_adjusted',expectedNPR:expected,amountDelta:difference,dateDelta:days,keywords:hits});
  else if(i.currency==='NPR'&&Math.abs(days)<=5&&difference!==null&&Math.abs(difference)<=.01)candidates.push({target:{kind:'invoice',id:i.id},confidence:'high',rule:'exact_net',expectedNPR:expected,amountDelta:difference,dateDelta:days,keywords:hits});
  else if(hits.length)candidates.push({target:{kind:'invoice',id:i.id},confidence:'medium',rule:'narration',expectedNPR:expected,amountDelta:difference,dateDelta:days,keywords:hits});
 }
 const priority=(c:MatchCandidate)=>c.rule==='exact_net'&&c.target.kind==='remittance'?3:c.confidence==='high'?2:1;
 candidates.sort((a,b)=>priority(b)-priority(a)||Math.abs(a.dateDelta)-Math.abs(b.dateDelta)||b.keywords.length-a.keywords.length);
 const top=candidates[0],ties=top?candidates.filter(c=>priority(c)===priority(top)):[];
 return {confidence:top?.confidence??(keywords.length?'medium':'none'),recommended:ties.length===1?top:null,candidates,ambiguous:ties.length>1,keywords};
}
