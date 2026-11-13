'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './index';
import { defaultSettings, type Invoice, type RemittanceTransaction, type Client, type Settings } from './schema';
import type { aggregateFiscalYearStats } from './finance';
import { queryFiscalYearStats } from './queries';
export function useFiscalYearStats(fiscalYearBS: string): ReturnType<typeof aggregateFiscalYearStats> | undefined {
  return useLiveQuery(() => queryFiscalYearStats(fiscalYearBS), [fiscalYearBS]);
}
export function useInvoices(filter?: { fiscalYearBS?: string; status?: string }): Invoice[] | undefined {
  const fiscalYearBS = filter?.fiscalYearBS, status = filter?.status;
  return useLiveQuery(async () => {
    const rows = await (fiscalYearBS ? db.invoices.where('fiscalYearBS').equals(fiscalYearBS).toArray() : status ? db.invoices.where('status').equals(status).toArray() : db.invoices.toArray());
    return rows.filter(i => !status || i.status === status).sort((a,b) => b.issueDateAD.localeCompare(a.issueDateAD) || b.createdAt.localeCompare(a.createdAt));
  }, [fiscalYearBS,status]);
}
export function useRemittances(filter?: { fiscalYearBS?: string }): RemittanceTransaction[] | undefined {
  const fiscalYearBS = filter?.fiscalYearBS;
  return useLiveQuery(async () => {
    const rows = await (fiscalYearBS ? db.remittances.where('fiscalYearBS').equals(fiscalYearBS).toArray() : db.remittances.toArray());
    return rows.sort((a,b) => b.settlementDateAD.localeCompare(a.settlementDateAD));
  }, [fiscalYearBS]);
}
export function useClients(): Client[] | undefined { return useLiveQuery(() => db.clients.orderBy('name').toArray(), []); }
export function useSettings(): Settings | undefined { return useLiveQuery(async () => (await db.settings.get('profile')) ?? defaultSettings(), []); }
export function useDatabaseIsEmpty(): boolean | undefined { return useLiveQuery(() => db.transaction('r', db.tables, async () => (await Promise.all(db.tables.map(t => t.count()))).every(n => n === 0)), []); }
