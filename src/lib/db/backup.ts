import { db } from './index';
import { encryptBackupPayload, decryptBackupPayload, MAX_BACKUP_BYTES } from './backup-codec';
import {parseBackupPayload,type BackupPayload} from './validation';
export async function createBackupPayload():Promise<BackupPayload> {
  const data = await db.transaction('r', db.tables, async () => {
    const [clients,invoices,remittances,bank_transactions,expenses,settings,forex_cache,documents] = await Promise.all([db.clients.toArray(),db.invoices.toArray(),db.remittances.toArray(),db.bank_transactions.toArray(),db.expenses.toArray(),db.settings.toArray(),db.forex_cache.toArray(),db.documents.toArray()]);
    return { clients,invoices,remittances,bank_transactions,expenses,settings,forex_cache,documents };
  });
  const payload: BackupPayload = { format: 'hisaab', version: 2, exportedAt: new Date().toISOString(), data };
  return parseBackupPayload(payload);
}
export async function exportRawBackup():Promise<Blob>{const payload=await createBackupPayload();return new File([JSON.stringify(payload,null,2)],`hisaab-${payload.exportedAt.replace(/[:.]/g,'-')}.json`,{type:'application/json'});}
export async function exportEncryptedBackup(password: string): Promise<Blob> {
  const payload=await createBackupPayload();
  const encrypted = await encryptBackupPayload(payload,password);
  return new File([encrypted], `hisaab-${payload.exportedAt.replace(/[:.]/g,'-')}.hisaab`, { type: 'application/octet-stream' });
}
/** Replaces all stores atomically. Callers must make replacement semantics clear before invoking. */
export async function importEncryptedBackup(file: File, password: string): Promise<{ success: boolean; message: string }> {
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 50 MiB limit.');
    const { data } = await decryptBackupPayload(await file.arrayBuffer(),password);
    // Crypto and validation finish before opening the IndexedDB write transaction.
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map(table => table.clear()));
      await db.clients.bulkAdd(data.clients); await db.invoices.bulkAdd(data.invoices);
      await db.remittances.bulkAdd(data.remittances); await db.bank_transactions.bulkAdd(data.bank_transactions);
      await db.expenses.bulkAdd(data.expenses); await db.settings.bulkAdd(data.settings);
      await db.forex_cache.bulkAdd(data.forex_cache); await db.documents.bulkAdd(data.documents);
    });
    return { success: true, message: 'Backup restored. All local records have been replaced.' };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Restore failed. Your data has not been changed.' }; }
}
