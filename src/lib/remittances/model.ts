import type { RemittanceTransaction } from '../db/schema';
import { calculateRemittanceStatutoryFigures } from '../forex/calculator';
import { getFiscalYearDateRange } from '../calendar/fiscal-year';
import { MAX_BS_YEAR, MIN_BS_YEAR } from '../calendar/calendar-data';
export type RateEvidence =
  | { kind: 'official'; source: 'api' | 'cache'; requestedDate: string; publishedOn: string }
  | { kind: 'manual'; reason: string }
  | { kind: 'unverified' };
export interface RemittanceAudit { sourceName: string; narration: string; swiftReference: string; attachmentId: number | null; rateEvidence: RateEvidence; updatedAt: string }
export const npr = (n: number): string => `Rs. ${n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const foreign = (n: number, currency: string): string => `${new Intl.NumberFormat('en-US',{style:'currency',currency}).format(n)} ${currency}`;
export const signedNpr = (n: number): string => `${n < 0 ? '−' : '+'}${npr(Math.abs(n))}`;
export function fiscalYearOptions(): string[] {
  return Array.from({length: MAX_BS_YEAR - MIN_BS_YEAR},(_,i) => { const year = MAX_BS_YEAR - 1 - i; const fy = `${year}/${String(year+1).slice(-2)}`; getFiscalYearDateRange(fy); return fy; });
}
export function remittanceMath(row: RemittanceTransaction) { return calculateRemittanceStatutoryFigures({foreignAmount:row.foreignAmount,nrbBuyingRate:row.nrbBuyingRate,actualCreditedNPR:row.actualCreditedNPR,tdsWithheldNPR:row.tdsWithheldNPR,intermediaryFeeNPR:row.intermediaryFeeNPR}); }
export function summarizeRemittances(rows: RemittanceTransaction[]) {
  const inflows = new Map<string,number>();
  let gross=0,tds=0,net=0,variance=0,discrepancies=0,unverified=0;
  for (const row of rows) {
    inflows.set(row.foreignCurrency,(inflows.get(row.foreignCurrency) ?? 0) + Math.round(row.foreignAmount*100));
    gross+=Math.round(row.nrbGrossNPR*100);tds+=Math.round(row.tdsWithheldNPR*100);net+=Math.round(row.actualCreditedNPR*100);variance+=Math.round(row.realizedFxVarianceNPR*100);
    if (remittanceMath(row).hasTdsDiscrepancy) discrepancies++;
    if (row.audit?.rateEvidence.kind !== 'official') unverified++;
  }
  return {inflows:[...inflows].sort(([a],[b])=>a.localeCompare(b)).map(([currency,cents])=>({currency,amount:cents/100})),gross:gross/100,tds:tds/100,net:net/100,variance:variance/100,discrepancies,unverified};
}
