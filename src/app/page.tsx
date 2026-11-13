'use client';
import { useState } from 'react';
import { DatabaseBoundary } from '@/components/db/database-boundary';
import { useFiscalYearStats, useInvoices, useClients, useDatabaseIsEmpty } from '@/lib/db/hooks';
import { seedDemoData } from '@/lib/db/seed';
import { getFiscalYearDateRange } from '@/lib/calendar/fiscal-year';
import { useNepaliCalendar } from '@/components/calendar/use-nepali-calendar';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, FileText, Globe2, ShieldCheck, Plus, CircleCheck, Clock3, ArrowLeftRight, Download, Sparkles } from 'lucide-react';
const statMetadata = [
  { label: 'Total invoiced', currency: 'USD', note: 'Issued USD invoices · excludes drafts', change: 'USD only', icon: FileText, tone: 'cyan' },
  { label: 'Statutory gross', currency: 'NPR', note: 'At NRB settlement rates', change: 'NRB basis', icon: Globe2, tone: 'neutral' },
  { label: 'Section 95क TDS', currency: '5%', note: 'Tax withheld by your banks', change: 'Recorded TDS', icon: ShieldCheck, tone: 'amber' },
  { label: 'Net realized variance', currency: 'NPR', note: 'Forex gain or loss before fees & TDS', change: 'Forex variance', icon: ArrowLeftRight, tone: 'green' },
];
const npr = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function Overview() { return <DatabaseBoundary><LocalOverview /></DatabaseBoundary>; }
function LocalOverview() {
  const [fiscalYear, setFiscalYear] = useState('2081/82');
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');
  const totals = useFiscalYearStats(fiscalYear);
  const invoices = useInvoices({ fiscalYearBS: fiscalYear });
  const clients = useClients();
  const isEmpty = useDatabaseIsEmpty();
  const calendar = useNepaliCalendar();
  const range = getFiscalYearDateRange(fiscalYear);
  const progress = calendar ? Math.max(0, Math.min(100, Math.round((Date.parse(calendar.dateAD) - range.startAD.getTime()) / (range.endAD.getTime() - range.startAD.getTime() + 86400000) * 100))) : 0;
  const values = totals ? [new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totals.totalInvoicedUSD), npr(totals.totalStatutoryGrossNPR), npr(totals.totalTdsWithheldNPR), `${totals.netFxVarianceNPR >= 0 ? '+' : '−'}${npr(Math.abs(totals.netFxVarianceNPR))}`] : ['…','…','…','…'];
  const stats = statMetadata.map((meta,i) => ({ ...meta, value: values[i] }));
  const clientMap = new Map(clients?.map(c => [c.id,c.name]));
  const transactions = (invoices ?? []).slice(0,3).map(i => ({ id: i.id, client: clientMap.get(i.clientId) ?? 'Loading client…', initials: (clientMap.get(i.clientId) ?? '…').slice(0,2).toUpperCase(), detail: i.invoiceNumber, amount: new Intl.NumberFormat('en-US', { style: 'currency', currency: i.currency }).format(i.totalAmount), date: i.issueDateAD, status: i.status === 'paid' ? 'Settled' : i.status.replace('_',' '), color: 'gray' }));
  async function seed() { setSeeding(true); setSeedMessage(''); try { const added = await seedDemoData(); if (added) setFiscalYear('2081/82'); setSeedMessage(added ? 'Sample data added for FY 2081/82.' : 'Sample data was not added because local records already exist.'); } catch { setSeedMessage('Could not add sample data. Check browser storage and try again.'); } finally { setSeeding(false); } }
  return <main id="main" className="workspace">
    <div className="workspace-heading"><Link href="/" className="wordmark"><span className="brand-mark">हि</span>hisaab<span className="brand-divider" /> <span className="workspace-name">Workspace</span></Link><span className="local-badge"><ShieldCheck size={13} />Stored locally</span></div>
    <div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={12} /><span>Overview</span></div><h1>Overview</h1></div><Link href="/invoices" className="button primary"><Plus size={16} />Create invoice</Link></div>
    <section className="fiscal-card" aria-labelledby="fiscal-title"><div className="fiscal-copy"><div className="fiscal-label"><span className="status-dot" />Fiscal Year {fiscalYear} <span className="tiny-divider" />Annual summary</div><h2 id="fiscal-title">FY {fiscalYear}</h2><p>{range.startBS} — {range.endBS} BS</p><div className="hero-bottom"><span className="fy-chip"><CircleCheck size={13} />Stored on this device</span><span className="demo-label">{totals ? `${totals.pendingInvoicesCount} unpaid invoices` : 'Loading local records…'}</span></div></div><div className="fiscal-progress"><div className="progress-header"><span>Fiscal year progress</span><span className="mono">{progress}<span className="muted"> / 100%</span></span></div><div className="fiscal-track">{Array.from({ length: 40 }, (_, i) => <i key={i} className={i < Math.round(progress / 100 * 40) ? 'filled' : ''} />)}</div><div className="progress-dates"><span>Shrawan 1, {fiscalYear.slice(0,4)}</span><span>Ashadh {Number(range.endBS.slice(-2))}, {Number(fiscalYear.slice(0,4)) + 1}</span></div><div className="tax-reminder"><span className="reminder-icon"><Clock3 size={16} /></span><div>Ashoj tax filing<small>Review totals and export schedules</small></div><Link href="/tax-pack" aria-label="Open Ashoj Tax Pack"><ArrowUpRight size={18} /></Link></div></div></section>
    <div className="section-heading"><h2>Summary</h2><label className="period">Fiscal year <select className="fiscal-select" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)}>{Array.from({ length: 95 }, (_,i) => 2094-i).map(year => <option key={year} value={`${year}/${String(year+1).slice(-2)}`}>{year}/{String(year+1).slice(-2)}</option>)}</select></label></div>
    <section className="stats-grid" aria-label="Fiscal year summary">{stats.map(stat => <article key={stat.label} className={`stat-card ${stat.tone}`}><div className="stat-top"><span className="stat-icon"><stat.icon size={16} /></span><span className="currency">{stat.currency}</span></div><h3>{stat.label}</h3><div className="stat-value">{stat.currency !== 'USD' && <span className="rs">Rs. </span>}{stat.value}</div><p>{stat.note}</p></article>)}</section>
    <div className="lower-grid"><section className="panel activity"><div className="panel-heading"><div><h2>Recent invoices</h2></div><Link href="/invoices" className="text-link">All invoices<ArrowUpRight size={14} /></Link></div><div className="transaction-head"><span>Invoice / Client</span><span>Amount</span><span>Status</span></div>{transactions.map(tx => <Link href="/invoices" key={tx.id} className="transaction"><span className={`client-avatar ${tx.color}`}>{tx.initials}</span><span className="client-info"><strong>{tx.client}</strong><small>{tx.detail}</small></span><span className="transaction-amount">{tx.amount}<small>{tx.date}</small></span><span className={`transaction-status ${tx.status === 'Settled' ? 'settled' : 'pending'}`}><span className="small-dot" />{tx.status}</span></Link>)}{invoices?.length === 0 && <p className="empty-records">No invoices in this fiscal year.</p>}{!invoices && <p className="empty-records">Loading local invoices…</p>}<div className="activity-footer"><span><span className="small-dot" />All amounts shown in original currency</span><span className="mono">{transactions.length} of {invoices?.length ?? 0} invoices</span></div></section>
    <section className="panel next-steps"><div className="panel-heading"><div><h2>Actions</h2></div></div><Link href="/reconcile" className="task"><span className="task-icon amber"><ArrowLeftRight size={17} /></span><span><strong>Match your bank statements</strong><small>Review your imported bank statements</small></span><ChevronRight size={15} /></Link><Link href="/tax-pack" className="task"><span className="task-icon cyan"><Download size={17} /></span><span><strong>Prepare your Ashoj tax pack</strong><small>Export PDF and CSV schedules</small></span><ChevronRight size={15} /></Link><div className="vault-note"><ShieldCheck size={17} /><div>Local storage<span>Back up your records in Settings.</span></div><span className="status-dot" /></div></section></div>
    <section className="local-data-actions" aria-live="polite">{isEmpty === true && <button className="button primary" disabled={seeding} onClick={seed}>{seeding ? 'Adding sample data…' : 'Add sample data'}</button>}<span>{seedMessage || (isEmpty ? 'Start with sample records, stored only in this browser.' : '')}</span>{totals && <span className="muted">Net credited: Rs. {npr(totals.totalNetCreditedNPR)}</span>}</section>

  </main>;
}
