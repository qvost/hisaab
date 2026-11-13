import type { Invoice, RemittanceTransaction } from './schema';
import { calculateRemittanceStatutoryFigures, roundNpr } from '../forex/calculator';
export const money = roundNpr;
export function calculateRemittance(input: Pick<RemittanceTransaction, 'foreignAmount' | 'nrbBuyingRate' | 'actualCreditedNPR' | 'intermediaryFeeNPR'> & { tdsWithheldNPR?: number }) {
  const figures = calculateRemittanceStatutoryFigures(input);
  return { nrbGrossNPR: figures.statutoryGrossNPR, tdsWithheldNPR: input.tdsWithheldNPR ?? figures.expectedTds5PctNPR, bankRealizedRate: figures.bankRealizedRate, realizedFxVarianceNPR: figures.fxVarianceNPR };
}
export function aggregateFiscalYearStats(invoices: Invoice[], remittances: RemittanceTransaction[]) {
  const active = invoices.filter(i => i.status !== 'draft' && i.status !== 'cancelled');
  const sum = <T>(rows: T[], value: (row: T) => number) => rows.reduce((total,row) => total + Math.round(value(row) * 100), 0) / 100;
  return {
    totalInvoicedUSD: sum(active.filter(i => i.currency === 'USD'), i => i.totalAmount),
    totalStatutoryGrossNPR: sum(remittances, r => r.nrbGrossNPR),
    totalTdsWithheldNPR: sum(remittances, r => r.tdsWithheldNPR),
    totalNetCreditedNPR: sum(remittances, r => r.actualCreditedNPR),
    netFxVarianceNPR: sum(remittances, r => r.realizedFxVarianceNPR),
    pendingInvoicesCount: active.filter(i => i.status !== 'paid').length,
  };
}
