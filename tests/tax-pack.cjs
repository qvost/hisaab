const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'hisaab-tax-pack-'));process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
const program=ts.createProgram(['src/lib/tax-pack/model.ts','src/lib/tax-pack/csv.ts','src/lib/tax-pack/zip.ts','src/lib/settings/profile.ts','src/lib/db/validation.ts'],{outDir:out,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,strict:true,skipLibCheck:true});
const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));program.emit();
const {taxPackSummary,validateExpenseAssessment}=require(path.join(out,'tax-pack/model.js'));
const {taxRemittanceCsv,taxExpenseCsv}=require(path.join(out,'tax-pack/csv.js'));
const {crc32,zipFiles}=require(path.join(out,'tax-pack/zip.js'));
const {validateProfile,validateResetConfirmation}=require(path.join(out,'settings/profile.js'));
const {parseBackupPayload}=require(path.join(out,'db/validation.js'));
const stamp='2024-08-15T00:00:00Z';
function profile(){return {id:'profile',businessName:'Himalayan Studio',ownerName:'Sample Owner',panNumber:'123456789',address:'Kathmandu, Nepal',taxMode:'freelancer_5pct_final',defaultBankAccounts:[{bankName:'Nabil Bank',accountName:'Sample Owner',accountNumber:'000000000001',swiftCode:'NARBNPKA',accountType:'FCY',branch:'Lazimpat',routingNotes:'Wire reference required'}]};}
function data(){
 const row={id:1,invoiceId:null,settlementDateAD:'2024-08-15',settlementDateBS:'2081-04-31',fiscalYearBS:'2081/82',foreignCurrency:'USD',foreignAmount:2500,nrbBuyingRate:134.2,nrbGrossNPR:335500,actualCreditedNPR:319475,bankRealizedRate:127.79,intermediaryFeeNPR:750,tdsWithheldNPR:16775,realizedFxVarianceNPR:1500,bankName:'Nabil Bank',createdAt:stamp,audit:{sourceName:'Wise Inc',narration:'Wire',swiftReference:'WIRE-001',attachmentId:1,rateEvidence:{kind:'official',source:'cache',requestedDate:'2024-08-15',publishedOn:'2024-08-15'},updatedAt:stamp}};
 return {profile:profile(),remittances:[row],expenses:[{id:1,dateAD:'2024-08-15',dateBS:'2081-04-31',fiscalYearBS:'2081/82',category:'Hosting',vendorName:'AWS',description:'Cloud hosting',currency:'USD',amount:45,createdAt:stamp,assessment:{deductibleNPR:6000,note:'Documented NPR cost basis',reviewedAt:stamp}}],invoices:[],clients:[],bankTransactions:[{id:1,source:'nabil',dateAD:'2024-08-15',dateBS:'2081-04-31',description:'Wire',amountNPR:319475,reconciliationStatus:'matched',matchedRemittanceId:1,matchedInvoiceId:null,createdAt:stamp}],documentIds:[1]};
}
test('annual totals use settlement fiscal years, maintain currency separation and evidence status',()=>{
 const d=data();d.remittances.push({...d.remittances[0],id:2,fiscalYearBS:'2080/81',foreignAmount:9999});
 const s=taxPackSummary(d,'2081/82','individual');assert.equal(s.remittances.length,1);assert.equal(s.totals.gross,335500);assert.equal(s.totals.net,319475);assert.equal(s.totals.variance,1500);assert.equal(s.expectedTds,16775);assert.equal(s.issues.length,0);assert.equal(s.profileComplete,true);
 assert.equal(s.range.startBS,'2081-04-01');assert.equal(s.range.endBS,'2082-03-32');assert.equal(s.deadlineBS,'2082-06-31');assert.equal(s.deadlineAD,'2025-10-17');
 const prior=taxPackSummary(data(),'2080/81','individual');assert.equal(prior.deadlineBS,'2081-06-30');assert.equal(prior.deadlineAD,'2024-10-16');
});
test('normal assessment uses only reviewed NPR deductions and preserves losses without assuming relief',()=>{
 const d=data();d.expenses.push({...d.expenses[0],id:2,assessment:undefined,amount:999});
 const s=taxPackSummary(d,'2081/82','business');assert.equal(s.deductions,6000);assert.equal(s.unreviewedExpenses,1);assert.equal(s.netTaxableIncomeEstimate,331000);assert.ok(s.issues.some(i=>i.includes('deductible NPR')));
 d.expenses[0].assessment.deductibleNPR=500000;assert.equal(taxPackSummary(d,'2081/82','business').netTaxableIncomeEstimate,-163000);
 assert.throws(()=>validateExpenseAssessment(-1,'receipt'));assert.throws(()=>validateExpenseAssessment(10,''));assert.equal(validateExpenseAssessment(6000,' receipt ').note,'receipt');
});
test('missing provenance, advice, bank links and withholding discrepancies are visible review items',()=>{
 const d=data();d.remittances[0].audit.rateEvidence={kind:'unverified'};d.documentIds=[];d.bankTransactions=[];d.remittances[0].tdsWithheldNPR=16000;
 const s=taxPackSummary(d,'2081/82','individual');assert.equal(s.missingAdvice,1);assert.equal(s.unreconciled,1);assert.equal(s.totals.unverified,1);assert.equal(s.tdsDifference,-775);assert.equal(s.issues.length,4);
 d.profile.panNumber='';assert.equal(taxPackSummary(d,'2081/82','individual').profileComplete,false);
});
test('tax CSV links invoices across issue fiscal years and includes evidence without unsafe formulas',()=>{
 const d=data();d.remittances[0].invoiceId=7;d.remittances[0].audit.sourceName='=HYPERLINK("bad")';d.invoices=[{id:7,invoiceNumber:'INV-2080/81-007',clientId:2}];
 const s=taxPackSummary(d,'2081/82','business'),csv=taxRemittanceCsv(d,s);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('INV-2080/81-007'));assert.ok(csv.includes('"WIRE-001"'));assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(csv.includes('"2024-08-15","1"'));
 assert.ok(taxExpenseCsv(s).includes('"6000","Documented NPR cost basis"'));
});
test('profile validation preserves leading zeros, FCY/NPR types, PAN digits and strict reset confirmation',()=>{
 const p=profile();p.panNumber='१२३४५६७८९';const saved=validateProfile(p);assert.equal(saved.panNumber,'123456789');assert.equal(saved.defaultBankAccounts[0].accountNumber,'000000000001');assert.equal(saved.defaultBankAccounts[0].accountType,'FCY');
 for(const mutate of [p=>p.panNumber='123',p=>p.address='',p=>p.defaultBankAccounts[0].swiftCode='',p=>p.defaultBankAccounts[0].accountNumber='1']){const bad=profile();mutate(bad);assert.throws(()=>validateProfile(bad));}
 assert.doesNotThrow(()=>validateResetConfirmation('RESET ALL DATA'));for(const text of ['reset all data','RESET',' RESET ALL DATA'])assert.throws(()=>validateResetConfirmation(text));
});
test('profile account types and deduction assessments survive backup schema validation',()=>{
 const d=data(),payload={format:'hisaab',version:2,exportedAt:stamp,data:{clients:[],invoices:[],remittances:d.remittances,expenses:d.expenses,settings:[d.profile],bank_transactions:d.bankTransactions,forex_cache:[],documents:[{id:1,fileName:'advice.pdf',mimeType:'application/pdf',contentBase64:'JVBERg==',createdAt:stamp}]}};
 assert.deepEqual(parseBackupPayload(payload),payload);const bad=structuredClone(payload);bad.data.settings[0].defaultBankAccounts[0].accountType='USD';assert.throws(()=>parseBackupPayload(bad));
});
test('ZIP32 emits correct CRC, UTF-8 names, local offsets and central directory',()=>{
 const enc=new TextEncoder(),content=enc.encode('123456789');assert.equal(crc32(content),0xcbf43926);
 const files=[{name:'Remittance-Schedule.csv',bytes:content},{name:'असोज-notes.txt',bytes:enc.encode('Local audit pack')}],zip=zipFiles(files,new Date('2025-10-17T08:30:00Z')),v=new DataView(zip.buffer);
 assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(14,true),0xcbf43926);assert.equal(v.getUint16(6,true),0x0800);
 const end=zip.length-22;assert.equal(v.getUint32(end,true),0x06054b50);assert.equal(v.getUint16(end+10,true),2);const central=v.getUint32(end+16,true);assert.equal(v.getUint32(central,true),0x02014b50);assert.equal(v.getUint32(central+42,true),0);
 assert.throws(()=>zipFiles([{name:'../escape',bytes:content}]));assert.throws(()=>zipFiles([files[0],files[0]]));
 if(process.env.HISAAB_ZIP_FIXTURE_PATH)fs.writeFileSync(process.env.HISAAB_ZIP_FIXTURE_PATH,zip);
});
test('all six dock destinations resolve to concrete App Router pages',()=>{
 const source=ts.createSourceFile('navigation.ts',fs.readFileSync('src/lib/navigation.ts','utf8'),ts.ScriptTarget.Latest,true);const hrefs=[];
 function visit(node){if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='href'&&ts.isStringLiteral(node.initializer))hrefs.push(node.initializer.text);ts.forEachChild(node,visit);}visit(source);
 assert.equal(hrefs.length,6);assert.equal(new Set(hrefs).size,6);for(const href of hrefs)assert.ok(fs.existsSync(path.join('src/app',href.slice(1),'page.tsx')),`Missing page for ${href}`);assert.ok(hrefs.includes('/settings'));assert.ok(hrefs.includes('/tax-pack'));
});
