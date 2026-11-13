import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
try { await import('@react-pdf/renderer'); } catch { process.stderr.write('Install @react-pdf/renderer before running the PDF render check.\n'); process.exit(1); }
const out=fs.mkdtempSync(path.join(process.cwd(),'.pdf-test-'));
try {
  const program=ts.createProgram(['src/components/invoices/invoice-pdf.tsx','src/components/tax-pack/summary-pdf.tsx'],{rootDir:'src',outDir:out,target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,strict:true,skipLibCheck:true,esModuleInterop:true});
  const diagnostics=ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));program.emit();
  fs.writeFileSync(path.join(out,'package.json'),'{"type":"module"}');
  // Node ESM needs extensions; the browser bundler resolves these same relative imports.
  function rewrite(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())rewrite(p);else if(p.endsWith('.js'))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/from\s*(['"])(\.[^'"]+)\1/g,(_all,quote,specifier)=>`from ${quote}${specifier.endsWith('.js')?specifier:specifier+'.js'}${quote}`));}}
  rewrite(out);
  const {buildInvoicePdf}=await import(pathToFileURL(path.join(out,'components/invoices/invoice-pdf.js')).href);
  const {calculateInvoice,defaultDocument,wireInstructions}=await import(pathToFileURL(path.join(out,'lib/invoices/model.js')).href);
  const settings={id:'profile',businessName:'Himalayan Digital Studio',ownerName:'Sample Freelancer',panNumber:'123456789',address:'Lazimpat, Kathmandu, Nepal',taxMode:'freelancer_5pct_final',defaultBankAccounts:[{bankName:'Nabil Bank',accountName:'Himalayan Digital Studio',accountNumber:'000000000001',swiftCode:'NARBNPKA',branch:'Lazimpat',routingNotes:'Please include the invoice number in your payment reference.'}]};
  const client={name:'Acme Cloud Inc',email:'billing@example.com',country:'US',address:'123 Market Street, San Francisco, CA',defaultCurrency:'USD',clientType:'business',createdAt:new Date().toISOString()};
  const details=defaultDocument(settings,client,'export_zero');details.reference={kind:'quote',rate:134.2,date:'2024-08-15',publishedOn:'2024-08-15',source:'cache'};
  const invoice={invoiceNumber:'INV-2081/82-003',clientId:1,status:'sent',issueDateAD:'2024-08-15',issueDateBS:'2081-04-31',fiscalYearBS:'2081/82',dueDateAD:'2024-09-15',currency:'USD',...calculateInvoice([{description:'Product design and cloud platform development',quantity:25,unitPrice:100}],'export_zero'),document:details,paymentInstructions:wireInstructions(details.bank),createdAt:new Date().toISOString()};
  fs.mkdirSync('artifacts',{recursive:true});
  const manyItems=Array.from({length:80},(_,i)=>({description:`Service ${i+1}: Development and implementation of client deliverables.`,quantity:2,unitPrice:75}));
  const multipage={...invoice,...calculateInvoice(manyItems,'export_zero')};
  const fixtures=[['invoice-sample',invoice],['invoice-multipage',multipage]];
  for(const [name,record] of fixtures){
    const blob=await buildInvoicePdf(record,details,path.resolve('public/fonts/JetBrainsMono-Regular.ttf'));const bytes=Buffer.from(await blob.arrayBuffer());assert.ok(bytes.subarray(0,5).equals(Buffer.from('%PDF-')));assert.ok(bytes.length>1000);fs.writeFileSync(`artifacts/${name}.pdf`,bytes);process.stdout.write(`Rendered artifacts/${name}.pdf\n`);
  }
  const {buildTaxSummaryPdf}=await import(pathToFileURL(path.join(out,'components/tax-pack/summary-pdf.js')).href);
  const {taxPackSummary}=await import(pathToFileURL(path.join(out,'lib/tax-pack/model.js')).href);
  const remittance={id:1,invoiceId:null,settlementDateAD:'2024-08-15',settlementDateBS:'2081-04-31',fiscalYearBS:'2081/82',foreignCurrency:'USD',foreignAmount:2500,nrbBuyingRate:134.2,nrbGrossNPR:335500,actualCreditedNPR:318725,bankRealizedRate:127.49,intermediaryFeeNPR:0,tdsWithheldNPR:16775,realizedFxVarianceNPR:0,bankName:'Nabil Bank',createdAt:new Date().toISOString(),audit:{sourceName:'Acme Cloud Inc',narration:'Wire',swiftReference:'SAMPLE-WIRE',attachmentId:null,rateEvidence:{kind:'official',source:'cache',requestedDate:'2024-08-15',publishedOn:'2024-08-15'},updatedAt:new Date().toISOString()}};
  const taxData={profile:settings,remittances:[remittance],expenses:[],invoices:[],clients:[],bankTransactions:[],documentIds:[]},summary=taxPackSummary(taxData,'2081/82','individual');
  const taxPdf=await buildTaxSummaryPdf(taxData,summary,path.resolve('public/fonts/JetBrainsMono-Regular.ttf')),taxBytes=Buffer.from(await taxPdf.arrayBuffer());assert.ok(taxBytes.subarray(0,5).equals(Buffer.from('%PDF-')));fs.writeFileSync('artifacts/tax-summary-sample.pdf',taxBytes);process.stdout.write('Rendered artifacts/tax-summary-sample.pdf\n');

} finally { fs.rmSync(out,{recursive:true,force:true}); }
