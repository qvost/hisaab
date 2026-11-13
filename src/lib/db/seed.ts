import { db } from './index';
import { createInvoice, createRemittance, createExpense } from './records';
import { defaultSettings } from './schema';
/** A single read/write transaction makes repeated and concurrent seed clicks safe. */
export async function seedDemoData(): Promise<boolean> {
  return db.transaction('rw', db.tables, async () => {
    if ((await Promise.all([db.clients.count(),db.invoices.count(),db.remittances.count(),db.bank_transactions.count(),db.expenses.count(),db.documents.count()])).some(n => n > 0)) return false;
    const createdAt = new Date().toISOString();
    const us = await db.clients.add({ name: 'Acme Cloud Inc', clientType: 'business', country: 'US', defaultCurrency: 'USD', email: 'billing@example.com', address: 'San Francisco, USA', createdAt });
    const eu = await db.clients.add({ name: 'Nordic Labs GmbH', clientType: 'business', country: 'DE', defaultCurrency: 'EUR', email: 'accounts@example.org', address: 'Berlin, Germany', createdAt });
    const paymentInstructions = 'Wire to Nabil Bank. Include invoice number in payment reference.';
    const usd = await createInvoice({ invoiceNumber: 'HIS-2081-001', clientId: us, status: 'paid', issueDateAD: '2024-08-01', dueDateAD: '2024-08-31', currency: 'USD', isExport: true, items: [{ description: 'Cloud platform development', quantity: 1, unitPrice: 2500 }], paymentInstructions });
    const eur = await createInvoice({ invoiceNumber: 'HIS-2081-002', clientId: eu, status: 'paid', issueDateAD: '2024-09-01', dueDateAD: '2024-09-30', currency: 'EUR', isExport: true, items: [{ description: 'Product design retainer', quantity: 1, unitPrice: 1200 }], paymentInstructions: 'Wire to NIC Asia Bank.' });
    await createRemittance({ invoiceId: usd, settlementDateAD: '2024-08-15', foreignCurrency: 'USD', foreignAmount: 2500, nrbBuyingRate: 134.20, actualCreditedNPR: 319475, intermediaryFeeNPR: 750, bankName: 'Nabil Bank' });
    await createRemittance({ invoiceId: eur, settlementDateAD: '2024-09-16', foreignCurrency: 'EUR', foreignAmount: 1200, nrbBuyingRate: 148.50, actualCreditedNPR: 168190, intermediaryFeeNPR: 500, bankName: 'NIC Asia' });
    await createExpense({ dateAD: '2024-09-05', category: 'Cloud Hosting', vendorName: 'AWS', description: 'Development infrastructure', currency: 'USD', amount: 45 });
    if(!(await db.settings.get('profile')))await db.settings.put({ ...defaultSettings(), businessName: 'Himalayan Digital Studio', ownerName: 'Sample Freelancer', panNumber: '123456789', defaultBankAccounts: [{ bankName: 'Nabil Bank', accountName: 'Sample Freelancer', accountNumber: '000000000001', swiftCode: 'NARBNPKA' }] });
    return true;
  });
}
