import {Suspense} from 'react';
import {InvoiceStudio} from '@/components/invoices/invoice-studio';
import '../../remittances/remittances.css';
import '../invoices.css';
export default function NewInvoicePage(){return <Suspense fallback={<main id="main" className="workspace">Opening studio…</main>}><InvoiceStudio/></Suspense>;}
