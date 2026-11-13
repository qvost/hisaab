'use client';
import {useEffect,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../db';
import type {BankTransaction} from '../db/schema';
import {useClients,useInvoices,useRemittances} from '../db/hooks';
import {getNrbForexRate} from '../forex/nrb-client';
import type {NrbRateResult} from '../forex/types';
import {quoteKey,suggestMatches} from '../parser/fuzzy-matcher';
export function useBankTransactions():BankTransaction[]|undefined{return useLiveQuery(()=>db.bank_transactions.orderBy('dateAD').reverse().toArray(),[]);}
export function useReconciliation(selected:BankTransaction|undefined,bankTransactions:BankTransaction[]){
 const invoices=useInvoices(),remittances=useRemittances(),clients=useClients();
 const [loaded,setLoaded]=useState<{date:string;quotes:Record<string,NrbRateResult>}|null>(null),[loading,setLoading]=useState(false);
 const date=selected?.dateAD;
 const currencies=[...new Set(invoices?.filter(i=>i.currency!=='NPR'&&['sent','overdue','partially_paid'].includes(i.status)&&date&&Math.abs((Date.parse(date)-Date.parse(i.issueDateAD))/86400000)<=5).map(i=>i.currency))].sort().join(',');
 useEffect(()=>{
  if(!date||!currencies||selected?.reconciliationStatus!=='unmatched'||selected.amountNPR<=0){setLoading(false);return;}
  let disposed=false;setLoading(true);
  void Promise.all(currencies.split(',').map(async currency=>{try{return {currency,quote:await getNrbForexRate(date,currency)};}catch{return null;}})).then(values=>{if(disposed)return;const quotes:Record<string,NrbRateResult>={};for(const value of values)if(value)quotes[quoteKey(date,value.currency)]=value.quote;setLoaded({date,quotes});setLoading(false);});
  return()=>{disposed=true;};
 },[date,currencies,selected?.reconciliationStatus,selected?.amountNPR]);
 return {invoices:invoices??[],remittances:remittances??[],clients:clients??[],loading,ready:!!invoices&&!!remittances&&!!clients,match:selected?suggestMatches(selected,{invoices:invoices??[],remittances:remittances??[],clients:clients??[],bankTransactions,quotes:loaded&&loaded.date===date?loaded.quotes:{}}):null};
}
