// Runs the actual Dexie implementation against the IndexedDB emulator.
require('fake-indexeddb/auto');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
globalThis.crypto ??= require('node:crypto').webcrypto;
globalThis.File ??= require('node:buffer').File;
globalThis.CustomEvent ??= class CustomEvent extends Event { constructor(type,init){super(type,init);this.detail=init?.detail;} };
const out = fs.mkdtempSync(path.join(process.cwd(),'.db-test-'));
const program=ts.createProgram(['src/lib/db/seed.ts','src/lib/db/backup.ts','src/lib/db/queries.ts','src/lib/remittances/repository.ts','src/lib/invoices/repository.ts','src/lib/reconcile/repository.ts','src/lib/settings/repository.ts','src/lib/tax-pack/repository.ts'],{outDir:out,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,esModuleInterop:true,strict:true,skipLibCheck:true});
const diagnostics=ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
program.emit();
process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
const {db,invoiceDates}=require(path.join(out,'db/index.js'));
const {seedDemoData}=require(path.join(out,'db/seed.js'));
const {queryFiscalYearStats}=require(path.join(out,'db/queries.js'));
const {exportEncryptedBackup,importEncryptedBackup,exportRawBackup,createBackupPayload}=require(path.join(out,'db/backup.js'));
const {liveQuery,Dexie}=require('dexie');
const {saveRemittance,deleteRemittance}=require(path.join(out,'remittances/repository.js'));
const {HisaabDatabase}=require(path.join(out,'db/index.js'));
const {STORE_SCHEMA}=require(path.join(out,'db/schema.js'));
const {saveInvoice,duplicateInvoice,deleteInvoice,setInvoiceStatus}=require(path.join(out,'invoices/repository.js'));
const {defaultDocument}=require(path.join(out,'invoices/model.js'));
const {saveProfile,resetLocalDatabase}=require(path.join(out,'settings/repository.js'));
const {readTaxPackData,reviewExpense}=require(path.join(out,'tax-pack/repository.js'));
const {importStatement,confirmMatch,ignoreTransaction,resetTransaction}=require(path.join(out,'reconcile/repository.js'));
test('Dexie creation hooks, reactive updates, atomic seeding and encrypted restore',async()=>{
 await db.delete();
 await db.open();
 try {
  const seeded=await Promise.all([seedDemoData(),seedDemoData()]);
  assert.equal(seeded.filter(Boolean).length,1);
  assert.equal(await db.clients.count(),2); assert.equal(await db.invoices.count(),2);
  assert.equal(await db.remittances.count(),2); assert.equal(await db.expenses.count(),1);
  assert.equal(await seedDemoData(),false);
  const original=await queryFiscalYearStats('2081/82');
  assert.equal(original.totalInvoicedUSD,2500); assert.equal(original.totalStatutoryGrossNPR,513700);
  assert.equal(original.totalTdsWithheldNPR,25685); assert.equal(original.netFxVarianceNPR,900);
  const invoice=await db.invoices.where('currency').equals('USD').first();
  assert.ok(invoice?.id);
  let subscription;
  const observed=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('liveQuery did not react')),5000);
   subscription=liveQuery(()=>queryFiscalYearStats('2081/82')).subscribe({next:stats=>{if(stats.pendingInvoicesCount===1){clearTimeout(timer);resolve();}},error:err=>{clearTimeout(timer);reject(err);}});
  });
  await db.invoices.update(invoice.id,{status:'sent'}); await observed; subscription.unsubscribe();
  await db.invoices.update(invoice.id,{issueDateAD:'2024-07-15',fiscalYearBS:'wrong'});
  const moved=await db.invoices.get(invoice.id);
  assert.equal(moved.fiscalYearBS,'2080/81'); assert.equal(moved.issueDateBS,'2081-03-31');
  assert.equal((await queryFiscalYearStats('2081/82')).totalInvoicedUSD,0);
  await db.invoices.update(invoice.id,{...invoiceDates('2024-08-01'),status:'paid'});
  const backup=await exportEncryptedBackup('test backup password');
  assert.ok(backup.name.endsWith('.hisaab'));
  await db.documents.add({fileName:'new.bin',mimeType:'application/octet-stream',contentBase64:'AA==',createdAt:new Date().toISOString()});
  const wrong=await importEncryptedBackup(backup,'wrong'); assert.equal(wrong.success,false); assert.equal(await db.documents.count(),1);
  const restored=await importEncryptedBackup(backup,'test backup password'); assert.equal(restored.success,true); assert.equal(await db.documents.count(),0);
  assert.deepEqual(await queryFiscalYearStats('2081/82'),original);
  const before=await db.invoices.count();
  await assert.rejects(()=>db.transaction('rw',db.invoices,async()=>{await db.invoices.clear();await db.invoices.add({...invoice,id:undefined,issueDateAD:'invalid'});}));
  assert.equal(await db.invoices.count(),before);
 } finally { await db.delete(); }
});

test('v1 database migration preserves records, recomputes net bank rate and clears unitless cache',async()=>{
 const name='hisaab-migration-test'; const old=new Dexie(name);old.version(1).stores(STORE_SCHEMA);
 await old.remittances.add({id:1,foreignAmount:2500,actualCreditedNPR:319475,bankRealizedRate:134.8,settlementDateAD:'2024-08-15',settlementDateBS:'2081-04-31',fiscalYearBS:'2081/82'});
 await old.forex_cache.add({date:'2024-08-15',rates:[{currency:'USD',buy:134.2,sell:134.8}],fetchedAt:'2024-08-15T00:00:00Z'});
 old.close();const upgraded=new HisaabDatabase(name);
 try {assert.equal(await upgraded.remittances.count(),1);assert.equal((await upgraded.remittances.get(1)).bankRealizedRate,127.79);assert.equal(await upgraded.forex_cache.count(),0);}
 finally {await upgraded.delete();}
});

test('standalone ledger writes, attachment replacement, year moves and deletion preserve consistency',async()=>{
 await db.delete();
 await db.open();
 try {
  const input={settlementDateAD:'2024-08-15',foreignCurrency:'AUD',foreignAmount:1000,nrbBuyingRate:90,actualCreditedNPR:85000,tdsWithheldNPR:4500,intermediaryFeeNPR:500,bankName:'Nabil Bank',sourceName:'Deel',narration:'Incoming wire',swiftReference:'WIRE123',invoiceId:null,rateEvidence:{kind:'manual',reason:'Bank advice quote'}};
  const file=new File(['%PDF-1.4\nlocal'],'advice.pdf',{type:'application/pdf'});
  const saved=await saveRemittance(input,{file,removeAttachment:false});
  assert.equal(saved.fiscalYearBS,'2081/82');assert.equal(await db.documents.count(),1);
  assert.equal((await db.remittances.get(saved.id)).audit.sourceName,'Deel');
  await saveRemittance({...input,settlementDateAD:'2024-07-15'},{id:saved.id,file:null,removeAttachment:false});
  assert.equal((await db.remittances.get(saved.id)).fiscalYearBS,'2080/81');assert.equal(await db.documents.count(),1);
  const backup=await exportEncryptedBackup('ledger password');
  assert.equal((await importEncryptedBackup(backup,'ledger password')).success,true);
  assert.equal((await db.remittances.get(saved.id)).audit.swiftReference,'WIRE123');
  await saveRemittance(input,{id:saved.id,file,removeAttachment:false});assert.equal(await db.documents.count(),1);
  await assert.rejects(()=>saveRemittance({...input,invoiceId:999},{id:saved.id,file,removeAttachment:false}));assert.equal(await db.documents.count(),1);
  const bankId=await db.bank_transactions.add({source:'nabil',dateAD:'2024-08-15',dateBS:'2081-04-31',description:'Wire',amountNPR:85000,reconciliationStatus:'matched',matchedRemittanceId:saved.id,matchedInvoiceId:null,createdAt:new Date().toISOString()});
  await assert.rejects(()=>deleteRemittance(saved.id),/Unmatch/);await assert.rejects(()=>saveRemittance(input,{id:saved.id,file:null,removeAttachment:false}),/Unmatch/);
  await db.bank_transactions.delete(bankId);await deleteRemittance(saved.id);assert.equal(await db.remittances.count(),0);assert.equal(await db.documents.count(),0);
 } finally {await db.delete();}
});

test('invoice numbering is serialized, snapshots survive, PAN invoices validate and linked deletes are guarded',async()=>{
 await db.delete();
 await db.open();
 try {
  await seedDemoData();const client=await db.clients.where('country').equals('US').first(),settings=await db.settings.get('profile');
  settings.address='Kathmandu, Nepal';const document=defaultDocument(settings,client,'export_zero');
  const input={invoiceNumber:'',autoNumber:true,clientId:client.id,issueDateAD:'2024-08-15',dueDateAD:'2024-09-15',currency:'USD',items:[{description:'Development',quantity:2,unitPrice:100}],document};
  const ids=await Promise.all([saveInvoice(input,'sent'),saveInvoice(input,'draft')]);
  const first=await db.invoices.get(ids[0]),second=await db.invoices.get(ids[1]);assert.notEqual(first.invoiceNumber,second.invoiceNumber);
  assert.equal(first.document.seller.pan,'123456789');assert.equal(first.issueDateBS,'2081-04-31');
  await assert.rejects(()=>saveInvoice(input,'draft',first.id),/Only an existing draft/);
  await setInvoiceStatus(first.id,'paid');assert.equal((await db.invoices.get(first.id)).status,'paid');
  const duplicate=await duplicateInvoice(first.id);assert.equal((await db.invoices.get(duplicate)).status,'draft');await deleteInvoice(duplicate);
  const backup=await exportEncryptedBackup('invoice snapshot password');assert.equal((await importEncryptedBackup(backup,'invoice snapshot password')).success,true);assert.equal((await db.invoices.get(first.id)).document.bank.swiftCode,'NARBNPKA');
  const receipt=await saveRemittance({settlementDateAD:'2024-08-15',foreignCurrency:'USD',foreignAmount:200,nrbBuyingRate:134.2,actualCreditedNPR:25498,tdsWithheldNPR:1342,intermediaryFeeNPR:0,bankName:'Nabil Bank',sourceName:'Acme',narration:'',swiftReference:'INVOICE-PAYMENT',invoiceId:first.id,rateEvidence:{kind:'manual',reason:'Bank quote'}},{file:null,removeAttachment:false});
  await assert.rejects(()=>deleteInvoice(first.id),/linked remittances/);await deleteRemittance(receipt.id);await deleteInvoice(first.id);
 } finally {await db.delete();}
});

test('statement imports are repeat-safe, matches are atomic, and unmatching restores payment baseline',async()=>{
 await db.delete();
 await db.open();
 try {
  await seedDemoData();const invoice=await db.invoices.where('currency').equals('USD').first(),remit=await db.remittances.where('foreignCurrency').equals('USD').first();await db.invoices.update(invoice.id,{status:'sent'});
  const row={dateAD:'2024-08-15',dateBS:'2081-04-31',description:'WISE ACME CLOUD WIRE',amountNPR:remit.actualCreditedNPR,reference:'WIRE-UNIQUE',rowNumber:2};
  const options={source:'nabil',accountLabel:'Main',fileName:'statement.csv'};
  const imported=await Promise.all([importStatement([row],options),importStatement([row],options)]);assert.equal(imported.reduce((n,r)=>n+r.imported,0),1);assert.equal(await db.bank_transactions.count(),1);
  const bank=await db.bank_transactions.toCollection().first();await confirmMatch(bank.id,{kind:'remittance',id:remit.id},{completesInvoice:false,reason:'exact_net'});
  assert.equal((await db.bank_transactions.get(bank.id)).reconciliationStatus,'matched');assert.equal((await db.invoices.get(invoice.id)).status,'paid');
  await assert.rejects(()=>confirmMatch(bank.id,{kind:'remittance',id:remit.id},{completesInvoice:false,reason:'exact_net'}));
  const backup=await exportEncryptedBackup('reconcile password');assert.equal((await importEncryptedBackup(backup,'reconcile password')).success,true);assert.equal((await db.invoices.get(invoice.id)).reconciliationBaselineStatus,'sent');
  await resetTransaction(bank.id);assert.equal((await db.invoices.get(invoice.id)).status,'sent');assert.equal((await db.bank_transactions.get(bank.id)).matchedRemittanceId,null);
  await ignoreTransaction(bank.id);assert.equal((await db.bank_transactions.get(bank.id)).reconciliationStatus,'ignored');await resetTransaction(bank.id);
  await confirmMatch(bank.id,{kind:'invoice',id:invoice.id},{completesInvoice:false,reason:'manual partial'});assert.equal((await db.invoices.get(invoice.id)).status,'partially_paid');await resetTransaction(bank.id);assert.equal((await db.invoices.get(invoice.id)).status,'sent');
  const fresh={...row,reference:'WIRE-SECOND',description:'DEEL NEW WIRE',amountNPR:9500};await importStatement([fresh],options);const bank2=await db.bank_transactions.toCollection().filter(b=>b.description==='DEEL NEW WIRE').first();
  const before=await db.remittances.count();
  await saveRemittance({settlementDateAD:row.dateAD,foreignCurrency:'USD',foreignAmount:100,nrbBuyingRate:100,actualCreditedNPR:9500,tdsWithheldNPR:500,intermediaryFeeNPR:0,bankName:'Nabil Bank',sourceName:'Deel',narration:'Imported wire',swiftReference:'WIRE-SECOND',invoiceId:null,rateEvidence:{kind:'manual',reason:'Advice quote'}},{file:null,removeAttachment:false,bankTransactionId:bank2.id});
  assert.equal(await db.remittances.count(),before+1);assert.equal((await db.bank_transactions.get(bank2.id)).reconciliationStatus,'matched');
  await assert.rejects(()=>saveRemittance({settlementDateAD:row.dateAD,foreignCurrency:'USD',foreignAmount:100,nrbBuyingRate:100,actualCreditedNPR:9500,tdsWithheldNPR:500,intermediaryFeeNPR:0,bankName:'Nabil Bank',sourceName:'Deel',narration:'',swiftReference:'',invoiceId:null,rateEvidence:{kind:'manual',reason:'Advice quote'}},{file:null,removeAttachment:false,bankTransactionId:bank2.id}));assert.equal(await db.remittances.count(),before+1);
 } finally {await db.delete();}
});

test('vault profile/raw/encrypted/restore/reset flows preserve records and seed around cache-only databases',async()=>{
 await db.delete();
 await db.open();
 try {
  const profile={id:'profile',businessName:'Real Studio',ownerName:'Real Owner',panNumber:'987654321',address:'Kathmandu, Nepal',taxMode:'pvt_ltd',defaultBankAccounts:[{bankName:'Nabil Bank',accountName:'Real Owner',accountNumber:'000000000123',swiftCode:'NARBNPKA',accountType:'FCY',branch:'Lazimpat',routingNotes:'Reference required'}]};
  await saveProfile(profile);
  await db.forex_cache.put({date:'2024-08-15',publishedOn:'2024-08-15',rates:{USD:{buy:134.2,sell:134.8,unit:1,effectiveBuy:134.2}},fetchedAt:new Date().toISOString()});
  assert.equal(await seedDemoData(),true);assert.equal((await db.settings.get('profile')).panNumber,'987654321');assert.equal(await seedDemoData(),false);
  const expense=await db.expenses.toCollection().first();await reviewExpense(expense.id,6000,'Documented NPR basis');const taxData=await readTaxPackData('2081/82');assert.equal(taxData.expenses[0].assessment.deductibleNPR,6000);assert.equal(taxData.profile.defaultBankAccounts[0].accountType,'FCY');
  const snapshot=await createBackupPayload(),raw=await exportRawBackup();const rawPayload=JSON.parse(await raw.text());assert.deepEqual(rawPayload.data,snapshot.data);assert.equal(rawPayload.version,snapshot.version);
  const encrypted=await exportEncryptedBackup('strong vault password');await assert.rejects(()=>resetLocalDatabase('RESET'));assert.equal(await db.invoices.count(),2);
  await resetLocalDatabase('RESET ALL DATA');for(const table of db.tables)assert.equal(await table.count(),0);
  assert.equal((await importEncryptedBackup(encrypted,'wrong')).success,false);assert.equal(await db.invoices.count(),0);
  assert.equal((await importEncryptedBackup(encrypted,'strong vault password')).success,true);assert.equal(await db.invoices.count(),2);assert.equal((await db.settings.get('profile')).panNumber,'987654321');assert.equal((await db.expenses.get(expense.id)).assessment.deductibleNPR,6000);
 } finally {await db.delete();}
});
