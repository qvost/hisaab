import type { RemittanceTransaction } from '../db/schema';
export function csvCell(value: string | number): string {
  const text = String(value);
  // Spreadsheet formula neutralization applies to text; signed numeric columns stay numeric.
  const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g,'""')}"`;
}
export function remittanceScheduleCsv(rows: RemittanceTransaction[]): string {
  const header = ['SN','Date_BS','Date_AD','Foreign_Currency','Foreign_Amount','NRB_Rate','Statutory_Gross_NPR','Bank_Name','Actual_Credited_NPR','TDS_5Pct_NPR','FX_Variance_NPR','SWIFT_Reference','Rate_Provenance','NRB_Published_On','Override_Reason'];
  const sorted = [...rows].sort((a,b)=>a.settlementDateAD.localeCompare(b.settlementDateAD) || (a.id ?? 0)-(b.id ?? 0));
  return '\uFEFF'+[header.map(csvCell).join(','),...sorted.map((r,i)=>{
    const evidence = r.audit?.rateEvidence;
    return [i+1,r.settlementDateBS,r.settlementDateAD,r.foreignCurrency,r.foreignAmount,r.nrbBuyingRate,r.nrbGrossNPR,r.bankName,r.actualCreditedNPR,r.tdsWithheldNPR,r.realizedFxVarianceNPR,r.audit?.swiftReference ?? '',evidence?.kind ?? 'unverified',evidence?.kind === 'official' ? evidence.publishedOn : '',evidence?.kind === 'manual' ? evidence.reason : ''].map(csvCell).join(',');
  })].join('\r\n');
}
export function downloadBlob(blob: Blob, fileName: string) {
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url;link.download=fileName;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
