import { db } from '../db';
import { createForexLookup } from './lookup';
const lookup = createForexLookup({
  readCache: date => db.forex_cache.get(date),
  writeCache: value => db.forex_cache.put(value),
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  now: () => new Date(),
  fetchPublication: async date => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),10000);
    try {
      const response = await fetch(`/api/forex?date=${encodeURIComponent(date)}`,{signal:controller.signal,cache:'no-store'});
      if (!response.ok) throw new Error('NRB proxy is unavailable.');
      const value: unknown = await response.json(); return value;
    } finally { clearTimeout(timeout); }
  },
});
export function getNrbForexRate(dateAD: string, currency = 'USD') { return lookup(dateAD,currency); }
