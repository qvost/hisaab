const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
try{require.resolve('papaparse');require.resolve('xlsx');}catch{process.stderr.write('Install papaparse and the official SheetJS package before running statement file checks.\n');process.exit(1);}
const out=fs.mkdtempSync(path.join(process.cwd(),'.statement-test-'));process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
const program=ts.createProgram(['src/lib/parser/read-statement.ts'],{outDir:out,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,strict:true,skipLibCheck:true,esModuleInterop:true});
const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));program.emit();
const {readStatement}=require(path.join(out,'parser/read-statement.js')),XLSX=require('xlsx'),File=globalThis.File??require('node:buffer').File;
test('actual CSV parser preserves quoted commas and multiline narration',async()=>{
 const csv='Date,Reference,Remarks,Debit,Credit\r\n2024-08-15,REF1,"WISE, ACME\nWIRE",0,"1,98,450.00"';
 const [sheet]=await readStatement(new File([csv],'nabil.csv',{type:'text/csv'}));assert.equal(sheet.rows.length,2);assert.equal(sheet.rows[1][2],'WISE, ACME\nWIRE');assert.equal(sheet.rows[1][4],'1,98,450.00');
});
test('actual XLSX reader preserves Excel dates, numeric cells and worksheet choices',async()=>{
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['Date','Description','Debit','Credit'],[(Date.UTC(2024,7,15)-Date.UTC(1899,11,30))/86400000,'WISE',0,198450]]);sheet.A2.z='yyyy-mm-dd';XLSX.utils.book_append_sheet(book,sheet,'Nabil');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Date','Description','Type','Amount'],['2024-08-15','Deel','Credit',9500]]),'Wallet');
 const data=XLSX.write(book,{type:'array',bookType:'xlsx'}),sheets=await readStatement(new File([data],'bank.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));assert.equal(sheets.length,2);assert.equal(sheets[0].rows[1][0],'2024-08-15');assert.equal(sheets[0].rows[1][3],'198450');assert.equal(sheets[1].name,'Wallet');
});
