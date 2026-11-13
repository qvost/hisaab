'use client';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getNrbForexRate } from '@/lib/forex/nrb-client';
import { db } from '@/lib/db';
import { nstToday, type NrbRateResult } from '@/lib/forex/types';
import { Check } from 'lucide-react';
export function ForexRateBadge({ dateAD, currency = 'USD' }: { dateAD?: string; currency?: string }) {
  const [today,setToday] = useState<string | null>(null);
  const [result,setResult] = useState<{ date: string; currency: string; value: NrbRateResult } | null>(null);
  const [error,setError] = useState(false);
  const date = dateAD ?? today;
  useEffect(() => { const tick = () => setToday(nstToday()); tick(); const timer = setInterval(tick,60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!date) return;
    let disposed = false;
    const refresh = () => { void getNrbForexRate(date,currency).then(value => { if (!disposed) { setResult({date,currency,value}); setError(false); } },() => { if (!disposed) { setResult(null); setError(true); } }); };
    refresh(); const timer = setInterval(refresh,60000);
    window.addEventListener('online',refresh);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('online',refresh); };
  }, [date,currency]);
  const value = result?.date === date && result.currency === currency ? result.value : null;
  const saved = useLiveQuery(async () => {
    if (!date || !value || value.source === 'bundled') return false;
    try { return !!(await db.forex_cache.get(value.fallbackDate ?? date)); } catch { return false; }
  }, [date,value?.fallbackDate,value?.source,value?.rate]);
  const rateDate = value?.fallbackDate;
  const formatted = rateDate ? new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${rateDate}T00:00:00Z`)) : '';
  const tooltip = value?.source === 'bundled' ? `Offline benchmark: ${value.benchmarkPeriod}. Verify the settlement-date quote before filing.` : rateDate ? `Rate from ${formatted}. No newer quote was available; this may reflect a non-publication day or offline lookup.` : value ? `NRB buying rate for ${date}${saved ? ' · saved on this device' : ''}` : error ? 'NRB unavailable and no saved rate covers this date.' : 'Loading NRB buying rate…';
  return <span className="rate-badge forex-badge" tabIndex={0} title={tooltip} aria-label={tooltip}>
    <i className={`status-dot ${saved ? '' : 'forex-not-cached'}`} /><span>NRB {currency}: <strong>{value ? `Rs. ${value.rate.toFixed(value.rate < 10 ? 4 : 2)}` : error ? 'unavailable' : '…'}</strong></span>{saved && <Check size={11} aria-label="Cached" />}<small>{value?.source === 'bundled' ? 'benchmark' : value?.isFallback ? 'prior rate' : saved ? 'cached' : value ? 'live' : ''}</small><span className="forex-tooltip" role="tooltip">{tooltip}</span>
  </span>;
}
