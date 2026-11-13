const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'hisaab-db-'));
const program = ts.createProgram(['src/lib/db/backup-codec.ts','src/lib/db/finance.ts'], { outDir: out, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, strict: true, skipLibCheck: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
program.emit();
process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
globalThis.crypto ??= require('node:crypto').webcrypto;
const { calculateRemittance, aggregateFiscalYearStats } = require(path.join(out,'db/finance.js'));
const { parseBackupPayload } = require(path.join(out,'db/validation.js'));
const { encryptBackupPayload, decryptBackupPayload } = require(path.join(out,'db/backup-codec.js'));
const { adToBs } = require(path.join(out,'calendar/samayamiiti.js'));
const createdAt='2024-09-16T00:00:00.000Z';
function fixture() {
  const invoices=[['USD',2500,'2024-08-01'],['EUR',1200,'2024-09-01']].map(([currency,amount,issueDateAD],i)=>({id:i+1,invoiceNumber:`INV-${i+1}`,clientId:i+1,status:'paid',issueDateAD,issueDateBS:adToBs(issueDateAD).formatted,fiscalYearBS:'2081/82',dueDateAD:'2024-09-30',currency,items:[{description:'Services',quantity:1,unitPrice:amount,amount}],subtotal:amount,isExport:true,vatRate:0,vatAmount:0,totalAmount:amount,paymentInstructions:'Bank wire',createdAt}));
  const remittances=[{foreignCurrency:'USD',foreignAmount:2500,nrbBuyingRate:134.2,actualCreditedNPR:319475,intermediaryFeeNPR:750},{foreignCurrency:'EUR',foreignAmount:1200,nrbBuyingRate:148.5,actualCreditedNPR:168190,intermediaryFeeNPR:500}].map((r,i)=>({...r,...calculateRemittance(r),id:i+1,invoiceId:i+1,settlementDateAD:'2024-09-16',settlementDateBS:adToBs('2024-09-16').formatted,fiscalYearBS:'2081/82',bankName:'Sample bank',createdAt}));
  return {format:'hisaab',version:2,exportedAt:createdAt,data:{clients:['USD','EUR'].map((defaultCurrency,i)=>({id:i+1,name:'Client',clientType:'business',country:'US',defaultCurrency,email:'',address:'',createdAt})),invoices,remittances,bank_transactions:[{id:1,source:'nabil',dateAD:'2024-09-16',dateBS:adToBs('2024-09-16').formatted,description:'Wire',amountNPR:319475,reconciliationStatus:'matched',matchedRemittanceId:1,matchedInvoiceId:1,createdAt}],expenses:[{id:1,dateAD:'2024-09-16',dateBS:adToBs('2024-09-16').formatted,fiscalYearBS:'2081/82',category:'Cloud',vendorName:'AWS',description:'Hosting',currency:'USD',amount:45,createdAt}],settings:[{id:'profile',businessName:'Studio',ownerName:'Sample',panNumber:'123456789',taxMode:'freelancer_5pct_final',defaultBankAccounts:[{bankName:'Nabil Bank',accountName:'Sample',accountNumber:'000000000001',swiftCode:'NARBNPKA'}]}],forex_cache:[{date:'2024-09-16',publishedOn:'2024-09-16',rates:{USD:{buy:134.2,sell:134.8,unit:1,effectiveBuy:134.2}},fetchedAt:createdAt}],documents:[{id:1,fileName:'wire.bin',mimeType:'application/octet-stream',contentBase64:'AAECA//+',createdAt}]}};
}
test('financial aggregation uses currency, statuses, fees and actual credit correctly',()=>{
 const {invoices,remittances}=fixture().data;
 assert.deepEqual(aggregateFiscalYearStats(invoices,remittances),{totalInvoicedUSD:2500,totalStatutoryGrossNPR:513700,totalTdsWithheldNPR:25685,totalNetCreditedNPR:487665,netFxVarianceNPR:900,pendingInvoicesCount:0});
 invoices.push({...invoices[0],status:'draft'},{...invoices[0],status:'cancelled'},{...invoices[0],status:'partially_paid'});
 assert.equal(aggregateFiscalYearStats(invoices,remittances).totalInvoicedUSD,5000);
 assert.equal(aggregateFiscalYearStats(invoices,remittances).pendingInvoicesCount,1);
 assert.equal(remittances[1].realizedFxVarianceNPR,-600);
 assert.throws(()=>calculateRemittance({...remittances[0],foreignAmount:0}),RangeError);
});
test('backup validates every store, date alignment, links, totals and duplicate IDs',()=>{
 assert.deepEqual(parseBackupPayload(fixture()),fixture());
 const corruptions=[p=>p.version=3,p=>delete p.data.expenses,p=>p.data.invoices[0].fiscalYearBS='2080/81',p=>p.data.invoices[0].totalAmount=1,p=>p.data.invoices[0].clientId=999,p=>p.data.remittances[0].foreignCurrency='EUR',p=>p.data.remittances[0].tdsWithheldNPR='16775',p=>p.data.bank_transactions[0].matchedRemittanceId=999,p=>p.data.settings[0].taxMode='unknown',p=>p.data.documents[0].contentBase64='invalid!',p=>p.data.clients.push(p.data.clients[0]),p=>p.data.forex_cache[0].rates.USD.buy=-1];
 for(const corrupt of corruptions){const p=fixture();corrupt(p);assert.throws(()=>parseBackupPayload(p));}
});
test('v1 backups migrate net bank rate and discard unitless forex cache',()=>{
 const legacy=fixture();legacy.version=1;
 legacy.data.forex_cache=[{date:'2024-09-16',rates:[{currency:'USD',buy:134.2,sell:134.8}],fetchedAt:createdAt}];
 for(const row of legacy.data.remittances) row.bankRealizedRate=(row.actualCreditedNPR+row.tdsWithheldNPR+row.intermediaryFeeNPR)/row.foreignAmount;
 const migrated=parseBackupPayload(legacy);
 assert.equal(migrated.version,2);assert.deepEqual(migrated.data.forex_cache,[]);
 assert.equal(migrated.data.remittances[0].bankRealizedRate,127.79);
 assert.deepEqual(migrated.data.invoices,legacy.data.invoices);
 assert.equal(migrated.data.remittances[0].tdsWithheldNPR,legacy.data.remittances[0].tdsWithheldNPR);
});
test('real Web Crypto round-trip preserves all stores and uses randomized encryption',async()=>{
 const payload=fixture(); const a=await encryptBackupPayload(payload,'a long sample password'); const b=await encryptBackupPayload(payload,'a long sample password');
 assert.notDeepEqual(Buffer.from(a),Buffer.from(b));
 assert.deepEqual(await decryptBackupPayload(a,'a long sample password'),payload);
 assert.equal(Buffer.from(a).includes(Buffer.from('123456789')),false);
 await assert.rejects(()=>decryptBackupPayload(a,'wrong password'),/Incorrect password/);
 for(const index of [10,28,a.byteLength-1]){const altered=a.slice(0);new Uint8Array(altered)[index]^=1;await assert.rejects(()=>decryptBackupPayload(altered,'a long sample password'));}
 await assert.rejects(()=>decryptBackupPayload(new ArrayBuffer(5),'password'),/size/);
 await assert.rejects(()=>encryptBackupPayload(payload,''),/non-empty/);
});
