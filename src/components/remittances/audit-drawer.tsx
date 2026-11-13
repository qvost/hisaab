'use client';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Paperclip, Pencil, Trash2, CheckCheck, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import type { DocumentRecord, RemittanceTransaction } from '@/lib/db/schema';
import { npr, foreign, signedNpr, remittanceMath } from '@/lib/remittances/model';
import { adviceBlob } from '@/lib/remittances/attachments';
import { downloadBlob } from '@/lib/remittances/csv';
import { deleteRemittance } from '@/lib/remittances/repository';
import { Drawer } from './drawer';
export function AuditDrawer({row,sourceName,onClose,onEdit,onDeleted,startDelete=false}:{startDelete?:boolean;row:RemittanceTransaction;sourceName:string;onClose:()=>void;onEdit:()=>void;onDeleted:()=>void}) {
  const math=remittanceMath(row), evidence=row.audit?.rateEvidence;
  const attachmentId=row.audit?.attachmentId;
  const document=useLiveQuery(()=>attachmentId==null?undefined:db.documents.get(attachmentId),[attachmentId]);
  const [deleting,setDeleting]=useState(false),[confirmDelete,setConfirmDelete]=useState(startDelete),[error,setError]=useState('');
  async function remove(){if(row.id===undefined)return;setDeleting(true);setError('');try{await deleteRemittance(row.id);onDeleted();}catch(e){setError(e instanceof Error?e.message:'Could not delete remittance.');setDeleting(false);}}
  return <Drawer title="Remittance audit trail" description={`${row.settlementDateBS} BS · ${row.settlementDateAD} AD · FY ${row.fiscalYearBS}`} onClose={onClose} busy={deleting} wide>
    <div className="audit-body"><div className="audit-source"><span className="source-avatar">{sourceName.slice(0,2).toUpperCase()}</span><div><h3>{sourceName}</h3><p>{row.bankName} · {row.audit?.swiftReference||'No SWIFT reference recorded'}</p></div><strong>{foreign(row.foreignAmount,row.foreignCurrency)}</strong></div>
    <section className="audit-section"><h3>The statutory calculation</h3><p className="field-hint">{row.foreignAmount.toLocaleString('en-US')} {row.foreignCurrency} × {row.nrbBuyingRate} NPR per unit</p><dl className="audit-math"><div><dt>Statutory gross at recorded NRB rate</dt><dd>{npr(row.nrbGrossNPR)}</dd></div><div><dt>Expected 5% Section 95क TDS</dt><dd>{npr(math.expectedTds5PctNPR)}</dd></div><div><dt>Bank TDS withheld</dt><dd>{npr(row.tdsWithheldNPR)}</dd></div><div><dt>Intermediary wire fees</dt><dd>{npr(row.intermediaryFeeNPR)}</dd></div><div><dt>Actual credit to {row.bankName}</dt><dd>{npr(row.actualCreditedNPR)}</dd></div><div><dt>Net bank realized rate</dt><dd>{row.bankRealizedRate.toFixed(6)} NPR</dd></div><div className="math-total"><dt>Realized FX variance</dt><dd className={row.realizedFxVarianceNPR<0?'amber-text':'green-text'}>{signedNpr(row.realizedFxVarianceNPR)}</dd></div></dl><p className="field-hint">FX variance = actual credit + withheld TDS + fees − statutory gross.</p><p className={`math-status ${math.hasTdsDiscrepancy?'warning':'good'}`}>{math.hasTdsDiscrepancy?<><AlertTriangle size={14}/>TDS Variance detected: Bank deducted {(row.tdsWithheldNPR/row.nrbGrossNPR*100).toFixed(2)}% instead of 5%</>:<><CheckCheck size={14}/>TDS matches expected 5%</>}</p><p className="field-hint">This compares recorded amounts. It does not independently verify an IRD tax deposit.</p></section>
    <section className="audit-section"><h3>Rate provenance</h3><p className={evidence?.kind==='official'?'green-text':'amber-text'}>{evidence?.kind==='official'?`NRB quote · ${evidence.publishedOn} · ${evidence.source}`:evidence?.kind==='manual'?'Manual override':'Unverified historical rate'}</p>{evidence?.kind==='manual'&&<p className="audit-narration">{evidence.reason}</p>}{evidence?.kind==='official'&&evidence.publishedOn!==row.settlementDateAD&&<p className="field-hint">Earlier publication used for settlement on {row.settlementDateAD}.</p>}<dl className="audit-metadata"><div><dt>Bank narration</dt><dd>{row.audit?.narration||'Not recorded'}</dd></div><div><dt>SWIFT reference</dt><dd className="mono">{row.audit?.swiftReference||'Not recorded'}</dd></div><div><dt>Recorded</dt><dd className="mono">{row.createdAt}</dd></div></dl></section>
    <section className="audit-section"><h3><Paperclip size={14}/>Credit advice</h3>{attachmentId==null?<div className="attachment-empty">No SWIFT advice attached. Add one when editing this record.</div>:document===undefined?<p className="field-hint">Loading local document…</p>:document?<AdvicePreview document={document}/>:<p className="field-hint amber-text">The attached document could not be found.</p>}</section>
    {error&&<p className="form-error" role="alert">{error}</p>}{confirmDelete&&<div className="delete-confirm" role="alert"><strong>Delete this remittance?</strong><p>The record and its unshared credit advice will be removed from this device.</p><div><button type="button" className="button secondary" disabled={deleting} onClick={()=>setConfirmDelete(false)}>Keep record</button><button type="button" className="button danger" disabled={deleting} onClick={remove}>{deleting?'Deleting…':'Delete remittance'}</button></div></div>}
    </div><footer className="drawer-footer"><button type="button" className="button danger-quiet" disabled={deleting} onClick={()=>setConfirmDelete(true)}><Trash2 size={14}/>Delete</button><button type="button" className="button primary" disabled={deleting} onClick={onEdit}><Pencil size={14}/>Edit remittance</button></footer>
  </Drawer>;
}
function AdvicePreview({document}:{document:DocumentRecord}) {
  const [preview,setPreview]=useState<{url:string;blob:Blob}|null>(null),[error,setError]=useState('');
  useEffect(()=>{try{const blob=adviceBlob(document),url=URL.createObjectURL(blob);setPreview({url,blob});return()=>URL.revokeObjectURL(url);}catch{setError('The credit advice cannot be displayed.');}},[document]);
  if(error)return <p className="form-error">{error}</p>;
  if(!preview)return <p className="field-hint">Preparing preview…</p>;
  return <div className="advice-preview"><div><span>{document.fileName}</span><button className="text-link" type="button" onClick={()=>downloadBlob(preview.blob,document.fileName)}><Download size={13}/>Download</button></div>{document.mimeType==='application/pdf'?<><iframe title={`Credit advice: ${document.fileName}`} src={preview.url} sandbox=""/><p className="field-hint">If your browser blocks PDF previews, download the saved advice.</p></>:<img src={preview.url} alt={`Bank credit advice: ${document.fileName}`}/>}</div>;
}
