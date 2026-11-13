import Dexie, { type Table } from 'dexie';
import { adToBs, normalizeAdDate } from '../calendar/samayamiiti';
import { getNepaliFiscalYear } from '../calendar/fiscal-year';
import { STORE_SCHEMA, type Client, type Invoice, type RemittanceTransaction, type BankTransaction, type Expense, type Settings, type ForexCache, type DocumentRecord } from './schema';
export function calendarFields(date: string) {
  const ad = normalizeAdDate(date), bs = adToBs(ad);
  return { ad, bs: bs.formatted, fiscalYearBS: getNepaliFiscalYear(bs) };
}
export class HisaabDatabase extends Dexie {
  clients!: Table<Client, number>;
  invoices!: Table<Invoice, number>;
  remittances!: Table<RemittanceTransaction, number>;
  bank_transactions!: Table<BankTransaction, number>;
  expenses!: Table<Expense, number>;
  settings!: Table<Settings, string>;
  forex_cache!: Table<ForexCache, string>;
  documents!: Table<DocumentRecord, number>;
  constructor(name = 'hisaab_db') {
    super(name);
    this.version(1).stores(STORE_SCHEMA);
    this.version(2).stores(STORE_SCHEMA).upgrade(async transaction => {
      // Legacy quotes lack units/publication provenance; never guess units for money.
      await transaction.table('forex_cache').clear();
      await transaction.table<RemittanceTransaction, number>('remittances').toCollection().modify(row => {
        row.bankRealizedRate = row.actualCreditedNPR / row.foreignAmount;
      });
    });
    this.version(3).stores({...STORE_SCHEMA,bank_transactions:STORE_SCHEMA.bank_transactions+', &importFingerprint'});
    this.invoices.hook('creating', (_key, row) => { Object.assign(row, invoiceDates(row.issueDateAD)); });
    this.invoices.hook('updating', (changes, _key, row) => invoiceDates('issueDateAD' in changes && typeof changes.issueDateAD === 'string' ? changes.issueDateAD : row.issueDateAD));
    this.remittances.hook('creating', (_key, row) => { Object.assign(row, remittanceDates(row.settlementDateAD)); });
    this.remittances.hook('updating', (changes, _key, row) => remittanceDates('settlementDateAD' in changes && typeof changes.settlementDateAD === 'string' ? changes.settlementDateAD : row.settlementDateAD));
    this.expenses.hook('creating', (_key, row) => { Object.assign(row, expenseDates(row.dateAD)); });
    this.expenses.hook('updating', (changes, _key, row) => expenseDates('dateAD' in changes && typeof changes.dateAD === 'string' ? changes.dateAD : row.dateAD));
    this.bank_transactions.hook('creating', (_key, row) => { const d = calendarFields(row.dateAD); Object.assign(row, { dateAD: d.ad, dateBS: d.bs }); });
    this.bank_transactions.hook('updating', (changes, _key, row) => { const d = calendarFields('dateAD' in changes && typeof changes.dateAD === 'string' ? changes.dateAD : row.dateAD); return { dateAD: d.ad, dateBS: d.bs }; });
  }
}
export function invoiceDates(date: string) { const d = calendarFields(date); return { issueDateAD: d.ad, issueDateBS: d.bs, fiscalYearBS: d.fiscalYearBS }; }
export function remittanceDates(date: string) { const d = calendarFields(date); return { settlementDateAD: d.ad, settlementDateBS: d.bs, fiscalYearBS: d.fiscalYearBS }; }
export function expenseDates(date: string) { const d = calendarFields(date); return { dateAD: d.ad, dateBS: d.bs, fiscalYearBS: d.fiscalYearBS }; }
// Construction is SSR-safe: IndexedDB opens lazily on the first client query.
export const db = new HisaabDatabase();
