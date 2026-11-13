'use client';
import { useEffect, useState } from 'react';
import { adToBs, normalizeAdDate } from '@/lib/calendar/samayamiiti';
import { getNepaliFiscalYear } from '@/lib/calendar/fiscal-year';
export function useNepaliCalendar() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  if (!now) return null;
  const currentBS = adToBs(now);
  return { currentAD: now, dateAD: normalizeAdDate(now), currentBS, fiscalYear: getNepaliFiscalYear(currentBS), nstClock: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now) };
}
