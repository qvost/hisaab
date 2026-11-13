'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { adToBs, bsToAd, getDaysInBsMonth, normalizeAdDate, parseBsDate, MIN_AD_DATE, MAX_AD_DATE, type BsDate } from '@/lib/calendar/samayamiiti';
import { getNepaliFiscalYear } from '@/lib/calendar/fiscal-year';
import { MONTHS, MIN_BS_YEAR, MAX_BS_YEAR } from '@/lib/calendar/calendar-data';
export interface DualDateChange { ad: string; bs: BsDate; fiscalYear: string }
export function DualDatePicker({ valueAD, onChange }: { valueAD: string | Date; onChange: (value: DualDateChange) => void }) {
  const iso = normalizeAdDate(valueAD);
  const selected = adToBs(iso);
  const [adDraft, setAdDraft] = useState(iso);
  const [bsDraft, setBsDraft] = useState(selected.formatted);
  const [view, setView] = useState({ year: selected.year, month: selected.month });
  const [error, setError] = useState('');
  const root = useRef<HTMLDetailsElement>(null);
  const id = useId();
  useEffect(() => { const bs = adToBs(iso); setAdDraft(iso); setBsDraft(bs.formatted); setView({ year: bs.year, month: bs.month }); setError(''); }, [iso]);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !root.current?.contains(e.target)) root.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, []);
  function commit(ad: string) {
    const bs = adToBs(ad); setAdDraft(ad); setBsDraft(bs.formatted); setView({ year: bs.year, month: bs.month }); setError('');
    onChange({ ad, bs, fiscalYear: getNepaliFiscalYear(bs) });
  }
  function edit(value: string, kind: 'ad' | 'bs') {
    if (kind === 'ad') setAdDraft(value); else setBsDraft(value);
    try { if (kind === 'ad') commit(normalizeAdDate(value)); else { const bs = parseBsDate(value); commit(bsToAd(bs.year, bs.month, bs.day).toISOString().slice(0, 10)); } }
    catch (e) { setError(e instanceof Error ? e.message : 'Invalid date'); }
  }
  function move(delta: number) {
    const index = view.year * 12 + view.month - 1 + delta;
    setView({ year: Math.floor(index / 12), month: index % 12 + 1 });
  }
  const firstWeekday = bsToAd(view.year, view.month, 1).getUTCDay();
  return <details ref={root} className="date-picker" onKeyDown={e => { if (e.key === 'Escape' && root.current?.open) { e.preventDefault(); e.stopPropagation(); root.current?.removeAttribute('open'); root.current?.querySelector('summary')?.focus(); } }}><summary><CalendarDays size={14} /><span>{iso} AD <span className="muted">/ {selected.formatted} BS</span></span></summary><div className="date-popover" aria-label="Choose a date">
    <label htmlFor={`${id}-ad`}>Gregorian (AD)</label><input id={`${id}-ad`} type="date" min={MIN_AD_DATE} max={MAX_AD_DATE} value={adDraft} onChange={e => edit(e.target.value, 'ad')} aria-describedby={error ? `${id}-error` : undefined} />
    <label htmlFor={`${id}-bs`}>Bikram Sambat (BS)</label><input id={`${id}-bs`} placeholder="YYYY-MM-DD" value={bsDraft} onChange={e => edit(e.target.value, 'bs')} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <p id={`${id}-error`} role="status" className="date-error">{error}</p>}
    <div className="calendar-nav"><button type="button" disabled={view.year === MIN_BS_YEAR && view.month === 1} onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button><span>{MONTHS[view.month - 1].en} {view.year}</span><button type="button" disabled={view.year === MAX_BS_YEAR && view.month === 12} onClick={() => move(1)} aria-label="Next month"><ChevronRight size={16} /></button></div>
    <div className="calendar-grid">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <span key={d}>{d}</span>)}{Array.from({ length: firstWeekday }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: getDaysInBsMonth(view.year, view.month) }, (_, i) => <button type="button" key={i} aria-label={`${view.year} ${MONTHS[view.month - 1].en} ${i + 1}`} aria-pressed={selected.year === view.year && selected.month === view.month && selected.day === i + 1} onClick={() => { commit(bsToAd(view.year, view.month, i + 1).toISOString().slice(0,10)); root.current?.removeAttribute('open'); }}>{i + 1}</button>)}</div><div className="date-fiscal">Fiscal year {getNepaliFiscalYear(selected)}</div>
  </div></details>;
}
