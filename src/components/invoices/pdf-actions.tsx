'use client';
import {useState} from 'react';
import {Download,Printer,LoaderCircle} from 'lucide-react';
import type {Invoice} from '@/lib/db/schema';
import type {InvoiceDocumentDetails} from '@/lib/invoices/model';
import {downloadBlob} from '@/lib/remittances/csv';
export function InvoicePdfActions({invoice,details,compact=false,downloadOnly=false}:{downloadOnly?:boolean;invoice:Invoice;details:InvoiceDocumentDetails;compact?:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function generate(preview:boolean){
    if(busy)return;const tab=preview?window.open('about:blank','_blank'):null;
    if(preview&&!tab){setError('Allow a preview tab, or use Download PDF.');return;}
    if(tab){tab.opener=null;tab.document.title='Preparing invoice PDF…';tab.document.body.textContent='Preparing your invoice PDF…';}
    setBusy(true);setError('');
    try{const {buildInvoicePdf}=await import('./invoice-pdf');const blob=await buildInvoicePdf(invoice,details);if(tab){const url=URL.createObjectURL(blob);tab.location.replace(url);setTimeout(()=>URL.revokeObjectURL(url),120000);}else downloadBlob(blob,`${invoice.invoiceNumber.replace(/[^\p{L}\p{N}._-]/gu,'-')}.pdf`);}
    catch{tab?.close();setError('PDF generation failed. Check that the PDF renderer and local font are available, then retry.');}finally{setBusy(false);}
  }
  return <div className={`pdf-actions ${compact?'compact':''}`}>{!downloadOnly&&<button className="button secondary" type="button" title="Open print preview" aria-label={`Open print preview ${invoice.invoiceNumber}`} disabled={busy} onClick={()=>void generate(true)}>{busy?<LoaderCircle size={14} className="spin"/>:<Printer size={14}/>}Open Print Preview</button>}<button className="button secondary" type="button" title="Download PDF" aria-label={`Download PDF ${invoice.invoiceNumber}`} disabled={busy} onClick={()=>void generate(false)}><Download size={14}/>Download PDF</button>{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
