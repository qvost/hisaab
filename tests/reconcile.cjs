const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'hisaab-reconcile-'));process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
const program=ts.createProgram(['src/lib/parser/statement-model.ts','src/lib/parser/fuzzy-matcher.ts','src/lib/db/validation.ts'],{outDir:out,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,strict:true,skipLibCheck:true});
const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));program.emit();
const {detectColumns,normalizeStatementRows,parseStatementDate,parseStatementMoney,statementIdentity}=require(path.join(out,'parser/statement-model.js'));
const {suggestMatches,quoteKey}=require(path.join(out,'parser/fuzzy-matcher.js'));
const {parseBackupPayload}=require(path.join(out,'db/validation.js'));
const {adToBs}=require(path.join(out,'calendar/samayamiiti.js'));
const createdAt='2024-08-15T00:00:00Z';
function bank(overrides={}){return {id:1,source:'nabil',dateAD:'2024-08-15',dateBS:'2081-04-31',description:'WISE PAYMENTS LTD / ACME CLOUD / WIRE 9847129 / USD 2500',amountNPR:318725,reconciliationStatus:'unmatched',matchedInvoiceId:null,matchedRemittanceId:null,createdAt,...overrides};}
function remit(overrides={}){return {id:1,invoiceId:1,settlementDateAD:'2024-08-15',settlementDateBS:'2081-04-31',fiscalYearBS:'2081/82',foreignCurrency:'USD',foreignAmount:2500,nrbBuyingRate:134.2,nrbGrossNPR:335500,actualCreditedNPR:318725,bankRealizedRate:127.49,intermediaryFeeNPR:0,tdsWithheldNPR:16775,realizedFxVarianceNPR:0,bankName:'Nabil Bank',createdAt,...overrides};}
function invoice(overrides={}){return {id:1,invoiceNumber:'INV-2081/82-001',clientId:1,status:'sent',issueDateAD:'2024-08-12',issueDateBS:adToBs('2024-08-12').formatted,fiscalYearBS:'2081/82',dueDateAD:'2024-09-12',currency:'USD',items:[{description:'Development',quantity:1,unitPrice:2500,amount:2500}],subtotal:2500,isExport:true,vatRate:0,vatAmount:0,totalAmount:2500,paymentInstructions:'Bank wire',createdAt,...overrides};}
const client={id:1,name:'Acme Cloud Inc',clientType:'business',country:'US',defaultCurrency:'USD',email:'',address:'',createdAt};
function context(overrides={}){return {remittances:[],invoices:[invoice()],clients:[client],bankTransactions:[],quotes:{},...overrides};}
test('presets normalize bank and wallet layouts without guessing credit direction',()=>{
 assert.deepEqual(detectColumns(['Date','Reference','Remarks','Debit','Credit']),{kind:'columns',date:0,description:2,credit:4,debit:3,reference:1});
 assert.equal(detectColumns(['Txn Date','Description/Narration','Debit','Credit','Balance']).description,1);
 assert.equal(detectColumns(['Date','Particulars','Debit','Credit','Balance']).kind,'columns');
 const mapping=detectColumns(['Date','Description','Type','Amount']);assert.equal(mapping.kind,'wallet');
 const parsed=normalizeStatementRows([['2024-08-15','WISE','Received','1,98,450.00'],['2024-08-16','Personal payment','Debit','500.00'],['2024-08-17','Unknown','Refund??','100']],mapping,'ymd');
 assert.equal(parsed.valid[0].amountNPR,198450);assert.equal(parsed.valid[1].amountNPR,-500);assert.equal(parsed.errors.length,1);
});
test('civil date parsing makes AD date order explicit and supports BS',()=>{
 assert.equal(parseStatementDate('15/08/2024','dmy'),'2024-08-15');assert.equal(parseStatementDate('08/15/2024','mdy'),'2024-08-15');
 assert.notEqual(parseStatementDate('07/08/2024','dmy'),parseStatementDate('07/08/2024','mdy'));
 assert.equal(parseStatementDate('२०८१-०४-३१','bs'),'2024-08-15');assert.equal(parseStatementDate('2024-08-15 12:31:45','ymd'),'2024-08-15');
 for(const [date,format] of [['2024-02-30','ymd'],['31/02/2024','dmy'],['2081-04-33','bs'],['08/15/24','mdy']])assert.throws(()=>parseStatementDate(date,format));
});
test('currency parsing preserves paisa and rejects invalid or mixed credit/debit rows',()=>{
 assert.equal(parseStatementMoney('Rs. 1,98,450.50'),198450.5);assert.equal(parseStatementMoney('रु १२,३४५.६७'),12345.67);assert.equal(parseStatementMoney('-'),0);
 for(const value of ['19,84,50','2e5','100.999','(120)','Infinity'])assert.throws(()=>parseStatementMoney(value));
 const mapping=detectColumns(['Date','Narration','Debit','Credit']);
 const p=normalizeStatementRows([['2024-08-15','Wire','0','250'],['2024-08-15','Both','100','250'],['2024-08-15','Negative','0','-250'],['','','','']],mapping,'ymd');
 assert.equal(p.valid.length,1);assert.equal(p.errors.length,2);assert.equal(p.skipped,1);
});
test('import identity is stable across files and distinct by account/reference/occurrence',()=>{
 const row={dateAD:'2024-08-15',dateBS:'2081-04-31',description:'Wise  Wire',amountNPR:100,reference:'REF1',rowNumber:2};
 assert.equal(statementIdentity('nabil',' Main ',row,0),statementIdentity('nabil','main',{...row,rowNumber:12,description:'WISE WIRE'},1));
 assert.notEqual(statementIdentity('nabil','one',row,0),statementIdentity('nabil','two',row,0));
 assert.notEqual(statementIdentity('nabil','main',{...row,reference:''},0),statementIdentity('nabil','main',{...row,reference:''},1));
});
test('exact remittance match wins and observes date, cent tolerance and occupied-link bounds',()=>{
 const result=suggestMatches(bank(),context({remittances:[remit()]}));assert.equal(result.confidence,'high');assert.deepEqual(result.recommended.target,{kind:'remittance',id:1});
 assert.equal(suggestMatches(bank(),context({remittances:[remit({settlementDateAD:'2024-08-11'})]})).recommended.rule,'exact_net');
 assert.notEqual(suggestMatches(bank({description:'Wire'}),context({remittances:[remit({settlementDateAD:'2024-08-10'})]})).confidence,'high');
 const used=bank({id:2,reconciliationStatus:'matched',matchedRemittanceId:1,matchedInvoiceId:1});assert.equal(suggestMatches(bank(),context({remittances:[remit()],bankTransactions:[used]})).candidates.length,0);
 assert.equal(suggestMatches(bank({amountNPR:-100}),context({remittances:[remit()]})).confidence,'none');
});
test('TDS invoice matching requires an official settlement quote within five issue-date days',()=>{
 const quotes={[quoteKey('2024-08-15','USD')]:{rate:134.2,source:'api',isFallback:false}};
 const result=suggestMatches(bank(),context({quotes}));assert.equal(result.recommended.rule,'tds_adjusted');assert.equal(result.recommended.expectedNPR,318725);assert.equal(result.recommended.dateDelta,3);
 assert.notEqual(suggestMatches(bank(),context({quotes:{[quoteKey('2024-08-15','USD')]:{rate:134.2,source:'bundled',isFallback:true}}})).confidence,'high');
 assert.notEqual(suggestMatches(bank(),context({quotes,invoices:[invoice({issueDateAD:'2024-08-09'})]})).confidence,'high');
 assert.notEqual(suggestMatches(bank({amountNPR:318225}),context({quotes})).confidence,'high');
});
test('fuzzy client names are medium signals, generic platforms cannot invent an invoice match',()=>{
 const typo=suggestMatches(bank({description:'NCHL NORDIK LABS GMBH'}),context({clients:[{...client,name:'Nordic Labs GmbH'}]}));assert.equal(typo.confidence,'medium');assert.equal(typo.recommended.target.kind,'invoice');
 const compact=suggestMatches(bank({description:'IPS-ACMECLOUDINC-123'}),context());assert.equal(compact.confidence,'medium');
 const generic=suggestMatches(bank({description:'FT-PAYONEER INC PAYOUT 381923'}),context());assert.equal(generic.confidence,'medium');assert.equal(generic.recommended,null);
});
test('ambiguous equal deposits require explicit choice rather than selecting an arbitrary receipt',()=>{
 const result=suggestMatches(bank(),context({remittances:[remit(),remit({id:2})]}));assert.equal(result.ambiguous,true);assert.equal(result.recommended,null);assert.equal(result.candidates.length,2);
});
test('statement metadata, baseline statuses and confirmation audit survive backup validation',()=>{
 const transaction=bank({reconciliationStatus:'matched',matchedInvoiceId:1,matchedRemittanceId:1,importFingerprint:'a'.repeat(64),statement:{accountLabel:'Main',bankName:'Nabil Bank',reference:'REF1',fileName:'statement.csv',batchId:'batch1',rowNumber:2},reconciliation:{confirmedAt:createdAt,previousInvoiceStatus:'sent',method:'remittance',reason:'exact_net',completesInvoice:false}});
 const payload={format:'hisaab',version:2,exportedAt:createdAt,data:{clients:[client],invoices:[invoice({status:'paid',reconciliationBaselineStatus:'sent'})],remittances:[remit()],bank_transactions:[transaction],expenses:[],settings:[],forex_cache:[],documents:[]}};
 assert.deepEqual(parseBackupPayload(payload),payload);
 const duplicate=structuredClone(payload);duplicate.data.bank_transactions.push({...transaction,id:2});assert.throws(()=>parseBackupPayload(duplicate));
 const invalid=structuredClone(payload);invalid.data.bank_transactions[0].reconciliation.completesInvoice='yes';assert.throws(()=>parseBackupPayload(invalid));
});
