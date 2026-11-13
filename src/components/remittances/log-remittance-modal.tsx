'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, CheckCheck, LoaderCircle, Paperclip, UploadCloud, X, ArrowRight, AlertTriangle } from 'lucide-react';
import { DualDatePicker } from '@/components/calendar/dual-date-picker';
import { getNrbForexRate } from '@/lib/forex/nrb-client';
import { nstToday, type NrbRateResult } from '@/lib/forex/types';
import { calculateRemittanceStatutoryFigures, type RemittanceCalculation } from '@/lib/forex/calculator';
import { useInvoices } from '@/lib/db/hooks';
import type { Currency, RemittanceTransaction } from '@/lib/db/schema';
import { saveRemittance } from '@/lib/remittances/repository';
import { npr, signedNpr, type RateEvidence } from '@/lib/remittances/model';
import { validateAdviceFile } from '@/lib/remittances/attachments';
import { Drawer } from './drawer';
const banks=['Nabil Bank','NIC Asia','Global IME','Siddhartha','Sanima'];
interface FormValues {date:string;currency:Currency;amount:string;credited:string;tds:string;fee:string;manualRate:string;manualReason:string;bank:string;customBank:string;source:string;swift:string;narration:string;invoice:string}
export type RemittancePrefill = {kind:'invoice';invoiceId:number;sourceName:string;currency:Currency;amount:number}|{kind:'statement';bankTransactionId:number;dateAD:string;actualCreditedNPR:number;bankName:string;narration:string;swiftReference:string;sourceName:string};
function initialValues(row?:RemittanceTransaction,source?:string,prefill?:RemittancePrefill):FormValues {
  const invoicePrefill=prefill?.kind==='invoice'?prefill:null,statementPrefill=prefill?.kind==='statement'?prefill:null;
  const bank=row?.bankName ?? statementPrefill?.bankName ?? banks[0];
  return {date:row?.settlementDateAD??statementPrefill?.dateAD??nstToday(),currency:row?.foreignCurrency??invoicePrefill?.currency??'USD',amount:row?String(row.foreignAmount):invoicePrefill?String(invoicePrefill.amount):'',credited:row?String(row.actualCreditedNPR):statementPrefill?String(statementPrefill.actualCreditedNPR):'',tds:row?String(row.tdsWithheldNPR):'',fee:row?String(row.intermediaryFeeNPR):'0',manualRate:row?String(row.nrbBuyingRate):'',manualReason:row?.audit?.rateEvidence.kind==='manual'?row.audit.rateEvidence.reason:'',bank:banks.includes(bank)?bank:'Custom',customBank:banks.includes(bank)?'':bank,source:row?.audit?.sourceName??source??prefill?.sourceName??'',swift:row?.audit?.swiftReference??statementPrefill?.swiftReference??'',narration:row?.audit?.narration??statementPrefill?.narration??'',invoice:row?.invoiceId?String(row.invoiceId):invoicePrefill?String(invoicePrefill.invoiceId):''};
}
export function LogRemittanceModal({existing,sourceName,prefill,onClose,onSaved}:{prefill?:RemittancePrefill;existing?:RemittanceTransaction;sourceName?:string;onClose:()=>void;onSaved:(fiscalYear:string)=>void}) {
  const [form,setForm]=useState(()=>initialValues(existing,sourceName,prefill));
  const [manual,setManual]=useState(!!existing), [tdsEdited,setTdsEdited]=useState(!!existing);
  const [quote,setQuote]=useState<{key:string;value:NrbRateResult}|null>(null),[quoteError,setQuoteError]=useState('');
  const [file,setFile]=useState<File|null>(null),[removeAttachment,setRemoveAttachment]=useState(false),[dragging,setDragging]=useState(false);
  const [saving,setSaving]=useState(false),[saved,setSaved]=useState<string|null>(null),[error,setError]=useState('');
  const fileRef=useRef<HTMLInputElement>(null), id=useId();
  const invoices=useInvoices();
  const key=`${form.date}:${form.currency}`;
  const [preserveRate,setPreserveRate]=useState(!!existing),[retry,setRetry]=useState(0);
  function change<K extends keyof FormValues>(field:K,value:FormValues[K]){setForm(current=>({...current,[field]:value}));}
  useEffect(()=>{
    let disposed=false;setQuoteError('');
    void getNrbForexRate(form.date,form.currency).then(value=>{if(!disposed)setQuote({key,value});},()=>{if(!disposed){setQuote(null);setQuoteError('NRB is unavailable for this date. Retry, or enter a documented manual rate.');}});
    return()=>{disposed=true;};
  },[form.date,form.currency,key,retry]);
  const currentQuote=quote?.key===key?quote.value:null;
  const rate=manual?Number(form.manualRate):currentQuote?.source!=='bundled'?currentQuote?.rate:undefined;
  let figures:RemittanceCalculation|null=null;
  try {if(form.amount && rate && form.credited){figures=calculateRemittanceStatutoryFigures({foreignAmount:Number(form.amount),nrbBuyingRate:rate,actualCreditedNPR:Number(form.credited),intermediaryFeeNPR:Number(form.fee),...(tdsEdited&&form.tds!==''?{tdsWithheldNPR:Number(form.tds)}:{})});}} catch { /* Validation feedback appears on save; incomplete drafts are expected. */ }
  const expected=form.amount && rate && Number.isFinite(Number(form.amount)*rate)?Math.round(Math.round(Number(form.amount)*rate*100)/100*.05):0;
  const tds=tdsEdited?form.tds:String(expected);
  const matched=figures&&!figures.hasTdsDiscrepancy;
  function pickFile(selected?:File){if(!selected)return;try{validateAdviceFile(selected);setFile(selected);setRemoveAttachment(false);setError('');}catch(e){setError(e instanceof Error?e.message:'Invalid attachment.');}}
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(saving)return;setError('');
    try {
      if(!figures || !rate || tds==='')throw new Error('Enter a valid amount, rate, actual credit and withheld TDS.');
      let rateEvidence:RateEvidence;
      const unchanged=existing&&form.date===existing.settlementDateAD&&form.currency===existing.foreignCurrency&&rate===existing.nrbBuyingRate;
      if(preserveRate&&unchanged)rateEvidence=existing.audit?.rateEvidence??{kind:'unverified'};
      else if(manual){if(!form.manualReason.trim())throw new Error('Add a reason for the manual buying rate.');rateEvidence={kind:'manual',reason:form.manualReason.trim()};}
      else {if(!currentQuote||currentQuote.source==='bundled')throw new Error('A bundled benchmark needs a manual override and reason before it can be recorded.');rateEvidence={kind:'official',source:currentQuote.source,requestedDate:form.date,publishedOn:currentQuote.fallbackDate??form.date};}
      setSaving(true);
      const result=await saveRemittance({settlementDateAD:form.date,foreignCurrency:form.currency,foreignAmount:Number(form.amount),nrbBuyingRate:rate,actualCreditedNPR:Number(form.credited),tdsWithheldNPR:Number(tds),intermediaryFeeNPR:Number(form.fee),bankName:form.bank==='Custom'?form.customBank:form.bank,sourceName:form.source,narration:form.narration,swiftReference:form.swift,invoiceId:form.invoice?Number(form.invoice):null,rateEvidence},{id:existing?.id,file,removeAttachment,...(prefill?.kind==='statement'?{bankTransactionId:prefill.bankTransactionId}:{})});
      setSaved(result.fiscalYearBS);
    } catch(e){setError(e instanceof Error?e.message:'Could not save this remittance.');setSaving(false);}
  }
  return <Drawer title={existing?'Edit remittance':'Log new remittance'} description="One settlement. A clear trail from foreign income to your bank." busy={saving} closeRequested={saved!==null} onClose={()=>saved?onSaved(saved):onClose()}>
    <form className="remittance-form" onSubmit={submit}>
      <fieldset disabled={saving} className="remittance-fieldset"><div className="form-section-heading"><span className="form-step">01</span><h3>Settlement details</h3></div>
      <div className="field"><span id={`${id}-date`}>Bank settlement date</span><div aria-labelledby={`${id}-date`}><DualDatePicker valueAD={form.date} onChange={({ad})=>{change('date',ad);setPreserveRate(false);}}/></div></div>
      <div className="form-pair"><label className="field">Currency<select value={form.currency} onChange={e=>{const v=e.target.value;if(v==='USD'||v==='EUR'||v==='GBP'||v==='AUD'){setForm(f=>({...f,currency:v,invoice:''}));setPreserveRate(false);}}}>{['USD','EUR','GBP','AUD'].map(c=><option key={c}>{c}</option>)}</select></label><label className="field">Foreign amount<input autoFocus required type="number" min="0.01" step="0.01" placeholder="2,500.00" value={form.amount} onChange={e=>change('amount',e.target.value)}/></label></div>
      <label className="field">Client / payment source<input required maxLength={180} placeholder="Acme Cloud Inc · Wise" value={form.source} onChange={e=>change('source',e.target.value)}/></label>
      <label className="field">Link invoice <span className="field-optional">optional</span><select value={form.invoice} onChange={e=>change('invoice',e.target.value)}><option value="">Standalone remittance</option>{invoices?.filter(i=>i.currency===form.currency).map(i=><option key={i.id} value={i.id}>{i.invoiceNumber} · {i.totalAmount} {i.currency}</option>)}</select></label>
      <div className="rate-lookup"><div><span>NRB buying rate · per {form.currency}</span><strong className="mono">{rate?npr(rate):currentQuote?.source==='bundled'?npr(currentQuote.rate):'—'}</strong></div><span className={`audit-tag ${!manual&&currentQuote&&currentQuote.source!=='bundled'?'good':'warning'}`}>{manual?'Recorded / manual rate':currentQuote?.source==='bundled'?'Offline benchmark':currentQuote?<><Check size={12}/>NRB Verified</>:quoteError?'Rate unavailable':<><LoaderCircle size={12} className="spin"/>Fetching NRB</>}</span></div>
      {currentQuote?.fallbackDate&&!manual&&<p className="field-hint">Published {currentQuote.fallbackDate}; no newer quote was found for the settlement date.</p>}
      {currentQuote?.source==='bundled'&&!manual&&<p className="field-hint amber-text">{currentQuote.benchmarkPeriod} benchmark. Enable manual override and document the rate before saving.</p>}
      {quoteError&&!manual&&<p className="field-hint amber-text" role="status">{quoteError} <button type="button" className="text-link" onClick={()=>setRetry(n=>n+1)}>Retry NRB</button></p>}
      <label className="checkbox-field"><input type="checkbox" checked={manual} onChange={e=>{setManual(e.target.checked);setPreserveRate(false);if(e.target.checked&&!form.manualRate&&currentQuote)change('manualRate',String(currentQuote.rate));}}/>{existing?'Keep or override recorded rate':'Manual rate override'}</label>
      {manual&&<div className="manual-fields"><label className="field">Buying rate (NPR per 1 {form.currency})<input required min="0.000001" step="any" type="number" value={form.manualRate} onChange={e=>{change('manualRate',e.target.value);setPreserveRate(false);}}/></label>{preserveRate?<p className="field-hint">Keeping the recorded rate and its original provenance. Changing the date, currency or rate requires new evidence.</p>:<label className="field">Override reason<input required maxLength={500} placeholder="Reference the bank advice or verified NRB quote" value={form.manualReason} onChange={e=>change('manualReason',e.target.value)}/></label>}</div>}
      <div className="form-section-heading"><span className="form-step">02</span><h3>What reached your bank</h3></div>
      <label className="field">Receiving bank<select value={form.bank} onChange={e=>change('bank',e.target.value)}>{[...banks,'Custom'].map(b=><option key={b}>{b}</option>)}</select></label>
      {form.bank==='Custom'&&<label className="field">Bank name<input required maxLength={180} value={form.customBank} onChange={e=>change('customBank',e.target.value)}/></label>}
      <label className="field">Actual NPR credited<input required min="0" step="0.01" type="number" placeholder="Amount on your bank statement" value={form.credited} onChange={e=>change('credited',e.target.value)}/></label>
      <div className="form-pair"><label className="field">5% TDS withheld (NPR)<input required min="0" step="0.01" type="number" value={tds} onChange={e=>{change('tds',e.target.value);setTdsEdited(true);}}/><button type="button" className="text-link" onClick={()=>setTdsEdited(false)}>Use expected 5%</button></label><label className="field">Intermediary fee (NPR)<input required min="0" step="0.01" type="number" value={form.fee} onChange={e=>change('fee',e.target.value)}/></label></div>
      <div className="statutory-math" aria-live="polite"><div className="math-heading"><ShieldLabel/><span>Settlement math</span></div><dl><div><dt>Statutory gross</dt><dd>{figures?npr(figures.statutoryGrossNPR):'—'}</dd></div><div><dt>Expected Section 95क TDS</dt><dd>{figures?npr(figures.expectedTds5PctNPR):'—'}</dd></div><div><dt>Intermediary wire fee</dt><dd>{figures?npr(figures.intermediaryFeeNPR):'—'}</dd></div><div className="math-total"><dt>Realized FX variance</dt><dd className={figures&&figures.fxVarianceNPR<0?'amber-text':'green-text'}>{figures?signedNpr(figures.fxVarianceNPR):'—'}</dd></div></dl>{figures&&<p className={`math-status ${matched?'good':'warning'}`}>{matched?<><CheckCheck size={14}/>TDS matches expected 5%</>:<><AlertTriangle size={14}/>TDS Variance detected: Bank deducted {(Number(tds)/figures.statutoryGrossNPR*100).toFixed(2)}% instead of 5%</>}</p>}</div>
      <div className="form-section-heading"><span className="form-step">03</span><h3>Supporting evidence</h3></div>
      <label className="field">SWIFT / transfer reference<input maxLength={180} placeholder="Bank reference or transfer ID" value={form.swift} onChange={e=>change('swift',e.target.value)}/></label>
      <label className="field">Bank narration <span className="field-optional">optional</span><textarea rows={2} maxLength={1000} placeholder="Details from the credit entry" value={form.narration} onChange={e=>change('narration',e.target.value)}/></label>
      <div className={`advice-drop ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();if(!saving)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(!saving)pickFile(e.dataTransfer.files[0]);}}><UploadCloud size={23}/><p>Drop your SWIFT advice or FIRC here</p><span>PDF or image · up to 8 MB · stays on your device</span><button type="button" className="button secondary" onClick={()=>fileRef.current?.click()}>Choose file</button><input ref={fileRef} type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Credit advice attachment" onChange={e=>{pickFile(e.target.files?.[0]);e.target.value='';}}/></div>
      {(file||existing?.audit?.attachmentId&&!removeAttachment)&&<div className="advice-selection"><Paperclip size={13}/><span>{file?.name??'Saved credit advice'}</span><button type="button" className="icon-button" aria-label="Remove credit advice" onClick={()=>{setFile(null);setRemoveAttachment(true);}}><X size={14}/></button></div>}
      </fieldset>{error&&<p className="form-error" role="alert">{error}</p>}<footer className="drawer-footer"><span><Check size={12}/>Saved locally. No upload.</span><button type="submit" className="button primary" disabled={saving||(!manual&&currentQuote?.source==='bundled')}>{saved?<><Check size={15}/>Saved</>:saving?<><LoaderCircle size={15} className="spin"/>Saving…</>:<>{existing?'Save changes':'Log remittance'}<ArrowRight size={15}/></>}</button></footer>
    </form>
  </Drawer>;
}
function ShieldLabel(){return <span className="math-mark">रु</span>;}
