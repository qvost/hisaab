import type { Metadata } from 'next';
import { Dock } from '@/components/dock';
import { TopBar } from '@/components/top-bar';
import './globals.css';
export const metadata: Metadata = { title: 'Hisaab', description: 'A local-first workspace for invoices, foreign remittances, and Nepali tax reconciliation.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><TopBar />{children}<Dock /></body></html>;
}
