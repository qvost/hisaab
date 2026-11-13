import { db } from './index';
import { aggregateFiscalYearStats } from './finance';
export function queryFiscalYearStats(fiscalYearBS: string) {
  return db.transaction('r', db.invoices, db.remittances, async () => {
    const [invoices, remittances] = await Promise.all([
      db.invoices.where('fiscalYearBS').equals(fiscalYearBS).toArray(),
      db.remittances.where('fiscalYearBS').equals(fiscalYearBS).toArray(),
    ]);
    return aggregateFiscalYearStats(invoices, remittances);
  });
}
