import type {StatementSheet} from './statement-model';
export const MAX_STATEMENT_BYTES=5*1024*1024;
export async function readStatement(file:File):Promise<StatementSheet[]>{
 if(!file.size||file.size>MAX_STATEMENT_BYTES)throw new Error('Choose a CSV or XLSX statement between 1 byte and 5 MB.');
 if(/\.csv$/i.test(file.name)){
  const Papa=(await import('papaparse')).default;
  const result=Papa.parse<string[]>(await file.text(),{header:false,skipEmptyLines:'greedy',dynamicTyping:false});
  if(result.errors.length)throw new Error(`CSV could not be parsed: ${result.errors[0].message}`);
  if(result.data.length>10001)throw new Error('Import at most 10,000 statement rows at once.');
  return [{name:'CSV',rows:result.data.map(row=>row.map(cell=>String(cell??'')))}];
 }
 if(!/\.xlsx$/i.test(file.name))throw new Error('Choose a .csv or .xlsx file.');
 const XLSX=await import('xlsx'),book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,cellNF:true,cellFormula:false,bookVBA:false,sheetRows:10002});
 return book.SheetNames.map(name=>{
  const sheet=book.Sheets[name],range=sheet['!ref'];if(range){const bounds=XLSX.utils.decode_range(range);if(bounds.e.r-bounds.s.r>10000||bounds.e.c-bounds.s.c>=100)throw new Error('Worksheet exceeds 10,000 rows or 100 columns.');}
  const start={r:0,c:range?XLSX.utils.decode_range(range).s.c:0};
  const date1904=book.Workbook?.WBProps?.date1904===true;
  const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:'',blankrows:true,range:0}).map((row,ri)=>row.map((value,ci)=>{
   const cell=sheet[XLSX.utils.encode_cell({r:start.r+ri,c:start.c+ci})];
   if(typeof value==='number'&&cell&&XLSX.SSF.is_date(typeof cell.z==='string'?cell.z:'')){const parts=XLSX.SSF.parse_date_code(value,{date1904});if(parts)return `${parts.y}-${String(parts.m).padStart(2,'0')}-${String(parts.d).padStart(2,'0')}`;}
   return typeof value==='string'||typeof value==='number'?String(value):'';
  }));
  return {name,rows};
 });
}
