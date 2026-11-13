import type { StatementMetadata, ReconciliationAudit, StatementSource } from '../parser/statement-model';
import type { InvoiceDocumentDetails } from '../invoices/model';
import type { RemittanceAudit } from '../remittances/model';
import type { CachedPublication } from '../forex/types';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'AUD' | 'NPR';
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export interface Client { id?: number; name: string; clientType: 'individual' | 'business'; country: string; defaultCurrency: Currency; panNumber?: string; email: string; address: string; createdAt: string }
export interface InvoiceItem { description: string; quantity: number; unitPrice: number; amount: number }
export interface Invoice { id?: number; reconciliationBaselineStatus?: InvoiceStatus; document?: InvoiceDocumentDetails; invoiceNumber: string; clientId: number; status: InvoiceStatus; issueDateAD: string; issueDateBS: string; fiscalYearBS: string; dueDateAD: string; currency: Currency; items: InvoiceItem[]; subtotal: number; isExport: boolean; vatRate: 0 | 13; vatAmount: number; totalAmount: number; paymentInstructions: string; createdAt: string }
export interface RemittanceTransaction { id?: number; invoiceId: number | null; audit?: RemittanceAudit; settlementDateAD: string; settlementDateBS: string; fiscalYearBS: string; foreignCurrency: Currency; foreignAmount: number; nrbBuyingRate: number; nrbGrossNPR: number; actualCreditedNPR: number; bankRealizedRate: number; intermediaryFeeNPR: number; tdsWithheldNPR: number; realizedFxVarianceNPR: number; bankName: string; createdAt: string }
export interface BankTransaction { id?: number; source: StatementSource; importFingerprint?: string; statement?: StatementMetadata; reconciliation?: ReconciliationAudit; dateAD: string; dateBS: string; description: string; amountNPR: number; reconciliationStatus: 'unmatched' | 'matched' | 'ignored'; matchedRemittanceId: number | null; matchedInvoiceId: number | null; createdAt: string }
export interface Expense { id?: number; dateAD: string; dateBS: string; fiscalYearBS: string; assessment?: {deductibleNPR:number;note:string;reviewedAt:string}; category: string; vendorName: string; description: string; currency: Currency; amount: number; createdAt: string }
export interface BankAccount { accountType?: 'FCY' | 'NPR'; bankName: string; accountName: string; accountNumber: string; swiftCode: string; branch?: string; routingNotes?: string }
export interface Settings { id: 'profile'; address?: string; businessName: string; ownerName: string; panNumber: string; taxMode: 'freelancer_5pct_final' | 'sole_proprietor' | 'pvt_ltd'; defaultBankAccounts: BankAccount[] }
export type ForexCache = CachedPublication;
/** Base64 keeps binary document contents lossless in IndexedDB and JSON backups. */
export interface DocumentRecord { id?: number; fileName: string; mimeType: string; contentBase64: string; createdAt: string }
export function defaultSettings(): Settings { return { id: 'profile', businessName: '', ownerName: '', panNumber: '', taxMode: 'freelancer_5pct_final', defaultBankAccounts: [] }; }
export const STORE_SCHEMA = {
  clients: '++id, name, clientType, country, defaultCurrency, createdAt',
  invoices: '++id, invoiceNumber, clientId, status, issueDateAD, issueDateBS, fiscalYearBS, currency, createdAt',
  remittances: '++id, invoiceId, settlementDateAD, settlementDateBS, fiscalYearBS, foreignCurrency, bankName, createdAt',
  bank_transactions: '++id, source, dateAD, dateBS, reconciliationStatus, matchedRemittanceId, matchedInvoiceId, createdAt',
  expenses: '++id, dateAD, dateBS, fiscalYearBS, category, vendorName, createdAt',
  settings: 'id', forex_cache: 'date', documents: '++id, fileName, mimeType, createdAt',
};
