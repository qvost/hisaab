import {readTaxPackData} from './repository';
import {taxPackSummary,type FilingMode} from './model';
import {taxRemittanceCsv,taxExpenseCsv} from './csv';
import {zipFiles} from './zip';
export async function exportAnnualTaxPack(fiscalYear:string,mode:FilingMode):Promise<Blob>{
 const data=await readTaxPackData(fiscalYear),summary=taxPackSummary(data,fiscalYear,mode);
 if(!summary.profileComplete)throw new Error('Complete your taxpayer name, nine-digit PAN and registered address in Settings before exporting.');
 if(!summary.remittances.length)throw new Error('No foreign remittances exist in this fiscal year.');
 const {buildTaxSummaryPdf}=await import('../../components/tax-pack/summary-pdf');
 const pdf=await buildTaxSummaryPdf(data,summary),encoder=new TextEncoder();
 const manifest={format:'hisaab-tax-pack',version:1,createdAt:new Date().toISOString(),fiscalYear,mode,pan:data.profile.panNumber,period:summary.range,reviewItems:summary.issues,notice:'Preparation package. Confirm return eligibility and e-TDS credit. Not a filing or tax-clearance certificate.'};
 const bytes=zipFiles([{name:'Executive-Tax-Summary.pdf',bytes:new Uint8Array(await pdf.arrayBuffer())},{name:'Remittance-Schedule.csv',bytes:encoder.encode(taxRemittanceCsv(data,summary))},...(mode==='business'?[{name:'Expense-Review-Schedule.csv',bytes:encoder.encode(taxExpenseCsv(summary))}]:[]),{name:'Preparation-Notes.json',bytes:encoder.encode(JSON.stringify(manifest,null,2))}]);
 return new Blob([bytes],{type:'application/zip'});
}
