const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'hisaab-ledger-'));
process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
const program=ts.createProgram(['src/lib/remittances/model.ts','src/lib/remittances/csv.ts','src/lib/remittances/attachments.ts','src/lib/db/validation.ts'],{outDir:out,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,strict:true,skipLibCheck:true});
const diagnostics=ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));program.emit();
const {summarizeRemittances,remittanceMath,fiscalYearOptions}=require(path.join(out,'remittances/model.js'));
const {remittanceScheduleCsv}=require(path.join(out,'remittances/csv.js'));
const {validateAdviceFile,encodeAdvice,adviceBlob}=require(path.join(out,'remittances/attachments.js'));
const {parseBackupPayload}=require(path.join(out,'db/validation.js'));
const File=globalThis.File??require('node:buffer').File;
function row(overrides={}){return {id:1,invoiceId:null,settlementDateAD:'2024-08-15',settlementDateBS:'2081-04-31',fiscalYearBS:'2081/82',foreignCurrency:'USD',foreignAmount:2500,nrbBuyingRate:134.2,nrbGrossNPR:335500,actualCreditedNPR:319475,bankRealizedRate:127.79,intermediaryFeeNPR:750,tdsWithheldNPR:16775,realizedFxVarianceNPR:1500,bankName:'Nabil Bank',createdAt:'2024-08-15T00:00:00Z',audit:{sourceName:'Wise Inc',narration:'Incoming wire',swiftReference:'ABC123',attachmentId:null,rateEvidence:{kind:'official',source:'cache',requestedDate:'2024-08-15',publishedOn:'2024-08-15'},updatedAt:'2024-08-15T00:00:00Z'},...overrides};}
test('inflows are grouped by original currency; gross, net, TDS and FX sum independently',()=>{
 const a=row(),b=row({id:2,foreignCurrency:'EUR',foreignAmount:1200,nrbBuyingRate:148.5,nrbGrossNPR:178200,actualCreditedNPR:168190,bankRealizedRate:168190/1200,intermediaryFeeNPR:500,tdsWithheldNPR:8910,realizedFxVarianceNPR:-600,audit:undefined});
 assert.deepEqual(summarizeRemittances([a,b]),{inflows:[{currency:'EUR',amount:1200},{currency:'USD',amount:2500}],gross:513700,tds:25685,net:487665,variance:900,discrepancies:0,unverified:1});
 assert.equal(remittanceMath(row({tdsWithheldNPR:16000})).hasTdsDiscrepancy,true);
 assert.equal(summarizeRemittances([]).inflows.length,0);
 assert.ok(fiscalYearOptions().includes('2081/82'));assert.ok(fiscalYearOptions().includes('2080/81'));
});
test('CSV preserves required fields, provenance, CRLF, Unicode BOM, quotes and numeric signs',()=>{
 const csv=remittanceScheduleCsv([row({id:2,bankName:'=HYPERLINK("evil")',realizedFxVarianceNPR:-1200,audit:{...row().audit,swiftReference:'AB,"12\n34',rateEvidence:{kind:'manual',reason:'Bank advice dated 15 August'}}})]);
 assert.ok(csv.startsWith('\uFEFF"SN","Date_BS","Date_AD"'));
 assert.ok(csv.includes('"SWIFT_Reference","Rate_Provenance","NRB_Published_On","Override_Reason"'));
 assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));assert.ok(csv.includes('"AB,""12\n34"'));assert.ok(csv.includes('"-1200"'));assert.ok(csv.includes('\r\n'));
 const input=[row({id:2,settlementDateAD:'2024-08-16'}),row()];assert.ok(remittanceScheduleCsv(input).indexOf('2024-08-15')<remittanceScheduleCsv(input).indexOf('2024-08-16'));assert.equal(input[0].id,2);
});
test('attachments enforce type, size and signature, and round-trip actual binary bytes',async()=>{
 const bytes=Buffer.from('%PDF-1.4\nlocal advice');const file=new File([bytes],'advice.pdf',{type:'application/pdf'});
 const stored=await encodeAdvice(file);assert.equal(stored.fileName,'advice.pdf');assert.deepEqual(Buffer.from(await adviceBlob(stored).arrayBuffer()),bytes);
 assert.throws(()=>validateAdviceFile({type:'image/svg+xml',size:12}));assert.throws(()=>validateAdviceFile({type:'application/pdf',size:9*1024*1024}));assert.throws(()=>validateAdviceFile({type:'application/pdf',size:0}));
 await assert.rejects(()=>encodeAdvice(new File(['<script>'],'fake.pdf',{type:'application/pdf'})),/contents/);
});
test('standalone remittances and audit metadata survive backup validation',()=>{
 const payload={format:'hisaab',version:2,exportedAt:'2024-08-15T00:00:00Z',data:{clients:[],invoices:[],remittances:[row()],bank_transactions:[],expenses:[],settings:[],forex_cache:[],documents:[]}};
 assert.deepEqual(parseBackupPayload(payload),payload);
 for(const corrupt of [p=>p.data.remittances[0].audit.attachmentId=42,p=>p.data.remittances[0].audit.rateEvidence.publishedOn='2024-08-16',p=>p.data.remittances[0].audit.rateEvidence.requestedDate='2024-08-14',p=>p.data.remittances[0].audit.rateEvidence={kind:'manual',reason:''},p=>p.data.remittances[0].invoiceId=999]){const p=structuredClone(payload);corrupt(p);assert.throws(()=>parseBackupPayload(p));}
 const aud=structuredClone(payload);aud.data.remittances[0].foreignCurrency='AUD';assert.equal(parseBackupPayload(aud).data.remittances[0].foreignCurrency,'AUD');
});
