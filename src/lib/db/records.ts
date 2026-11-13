import { calculateInvoice } from '../invoices/model';
import { db, invoiceDates, remittanceDates, expenseDates } from './index';
import type { Invoice, RemittanceTransaction, Expense } from './schema';
import { calculateRemittance, money } from './finance';
export type NewInvoice = Omit<Invoice, 'id' | 'createdAt' | 'issueDateBS' | 'fiscalYearBS' | 'subtotal' | 'vatRate' | 'vatAmount' | 'totalAmount' | 'items'> & { items: { description: string; quantity: number; unitPrice: number }[] };
export function createInvoice(input: NewInvoice) {
  const treatment=input.document?.taxTreatment??(input.isExport?'export_zero':'domestic_vat');
  const calculated=calculateInvoice(input.items,treatment);
  return db.invoices.add({...input,...invoiceDates(input.issueDateAD),...calculated,createdAt:new Date().toISOString()});
}
export type NewRemittance = Omit<RemittanceTransaction, 'id' | 'createdAt' | 'settlementDateBS' | 'fiscalYearBS' | 'nrbGrossNPR' | 'tdsWithheldNPR' | 'bankRealizedRate' | 'realizedFxVarianceNPR'> & { tdsWithheldNPR?: number };
export function createRemittance(input: NewRemittance) { return db.remittances.add({ ...input, ...remittanceDates(input.settlementDateAD), ...calculateRemittance(input), createdAt: new Date().toISOString() }); }
export type NewExpense = Omit<Expense, 'id' | 'createdAt' | 'dateBS' | 'fiscalYearBS'>;
export function createExpense(input: NewExpense) {
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new RangeError('Expense amount must be non-negative.');
  return db.expenses.add({ ...input, ...expenseDates(input.dateAD), createdAt: new Date().toISOString() });
}
