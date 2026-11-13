const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'hisaab-invoices-'));
process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
const program=ts.createProgram(['src/lib/invoices/model.ts','src/lib/db/validation.ts'],{outDir:out,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,strict:true,skipLibCheck:true});
const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));program.emit();
const {calculateInvoice,nextInvoiceNumber,invoiceFiscalYear,defaultDocument,summarizeInvoices,EXPORT_NOTICE,wireInstructions}=require(path.join(out,'invoices/model.js'));
const {parseBackupPayload}=require(path.join(out,'db/validation.js'));
function invoice(treatment='export_zero'){
 const client={id:1,name:'Acme Cloud Inc',clientType:'business',country:treatment==='export_zero'?'US':'NP',defaultCurrency:treatment==='export_zero'?'USD':'NPR',email:'billing@example.com',address:'Billing address',createdAt:'2024-08-15T00:00:00Z'};
 const settings={id:'profile',businessName:'Himalayan Studio',ownerName:'Sample',panNumber:'123456789',address:'Kathmandu, Nepal',taxMode:'freelancer_5pct_final',defaultBankAccounts:[{bankName:'Nabil Bank',accountName:'Himalayan Studio',accountNumber:'123456',swiftCode:'NARBNPKA',branch:'Lazimpat',routingNotes:'Include invoice reference'}]};
 const document=defaultDocument(settings,client,treatment);document.updatedAt='2024-08-15T00:00:00Z';document.reference=treatment==='export_zero'?{kind:'quote',rate:134.2,date:'2024-08-15',publishedOn:'2024-08-15',source:'cache'}:{kind:'npr'};
 return {id:1,invoiceNumber:'INV-2081/82-001',clientId:1,status:'sent',issueDateAD:'2024-08-15',issueDateBS:'2081-04-31',fiscalYearBS:'2081/82',dueDateAD:'2024-09-15',currency:client.defaultCurrency,...calculateInvoice([{description:'Development',quantity:25,unitPrice:100}],treatment),paymentInstructions:wireInstructions(document.bank),document,createdAt:'2024-08-15T00:00:00Z'};
}
test('all three tax modes preserve correct totals and statutory notice',()=>{
 const items=[{description:'Consulting',quantity:2,unitPrice:1500}];
 const exp=calculateInvoice(items,'export_zero'),pan=calculateInvoice(items,'domestic_pan'),vat=calculateInvoice(items,'domestic_vat');
 assert.equal(exp.totalAmount,3000);assert.equal(exp.isExport,true);assert.equal(exp.vatRate,0);
 assert.equal(pan.totalAmount,3000);assert.equal(pan.isExport,false);assert.equal(pan.vatRate,0);
 assert.equal(vat.vatAmount,390);assert.equal(vat.totalAmount,3390);
 assert.ok(EXPORT_NOTICE.includes('Section 7(2)'));assert.ok(EXPORT_NOTICE.includes('convertible foreign currency'));
 for(const item of [{description:'',quantity:1,unitPrice:10},{description:'x',quantity:0,unitPrice:10},{description:'x',quantity:1,unitPrice:-1},{description:'x',quantity:NaN,unitPrice:10}])assert.throws(()=>calculateInvoice([item],'export_zero'));
 assert.throws(()=>calculateInvoice([],'domestic_pan'));
});
test('fiscal numbering advances maximum sequence, respects custom numbers and year changes',()=>{
 assert.equal(invoiceFiscalYear('2024-07-15'),'2080/81');assert.equal(invoiceFiscalYear('2024-07-16'),'2081/82');
 assert.equal(nextInvoiceNumber('2081/82',['INV-2081/82-001','INV-2081/82-003','CUSTOM-099','INV-2080/81-999']),'INV-2081/82-004');
 assert.equal(nextInvoiceNumber('2080/81',[]),'INV-2080/81-001');
});
test('invoice metrics separate currencies, draft/cancelled records and missing references',()=>{
 const a=invoice(),b={...a,id:2,status:'paid'},c={...a,id:3,status:'draft'},d={...a,id:4,status:'cancelled'},e={...a,id:5,currency:'EUR',document:{...a.document,reference:{kind:'benchmark',rate:140,period:'mid-July'}}};
 const result=summarizeInvoices([a,b,c,d,e]);
 assert.deepEqual(result.billed,[{currency:'EUR',amount:2500},{currency:'USD',amount:5000}]);assert.deepEqual(result.paid,[{currency:'USD',amount:2500}]);assert.equal(result.pendingCount,2);assert.equal(result.nprEquivalent,671000);assert.equal(result.missingReferences,1);
});
test('invoice snapshots and PAN/VAT tax treatment survive encrypted-backup boundary validation',()=>{
 for(const treatment of ['export_zero','domestic_pan','domestic_vat']){
  const row=invoice(treatment),client={id:1,name:row.document.client.name,clientType:'business',country:row.document.client.country,defaultCurrency:row.currency,email:'billing@example.com',address:'Billing address',panNumber:'123456789',createdAt:row.createdAt};
  const payload={format:'hisaab',version:2,exportedAt:row.createdAt,data:{clients:[client],invoices:[row],remittances:[],bank_transactions:[],expenses:[],settings:[],forex_cache:[],documents:[]}};
  assert.deepEqual(parseBackupPayload(payload),payload);
  const bad=structuredClone(payload);bad.data.invoices[0].document.taxTreatment=treatment==='domestic_vat'?'domestic_pan':'domestic_vat';assert.throws(()=>parseBackupPayload(bad));
 }
 const row=invoice();assert.equal(row.document.bank.branch,'Lazimpat');assert.ok(row.paymentInstructions.includes('NARBNPKA'));assert.equal(row.document.seller.pan,'123456789');
});
