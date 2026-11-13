import historical from './historical-rates.json';
import { normalizeCurrency, nstToday, parsePublication, previousDate, validateForexDate, type ForexPublication, type NrbRateResult, type CachedPublication } from './types';
export interface ForexLookupDependencies {
  readCache: (date: string) => Promise<CachedPublication | undefined>;
  writeCache: (value: CachedPublication) => Promise<unknown>;
  fetchPublication: (date: string) => Promise<unknown>;
  isOnline: () => boolean;
  now: () => Date;
}
export class ForexRateUnavailableError extends Error { constructor(message: string) { super(message); this.name = 'ForexRateUnavailableError'; } }
function bundledRate(date: string, currency: string): NrbRateResult | undefined {
  const benchmark = historical.benchmarks.find(b => date >= b.from && date <= b.to);
  if (!benchmark) return;
  const entry = Object.entries(benchmark.rates).find(([code]) => code === currency)?.[1];
  if (!entry) return;
  return { rate: entry.buy / entry.unit, isFallback: true, source: 'bundled', benchmarkPeriod: benchmark.period };
}
export function createForexLookup(deps: ForexLookupDependencies) {
  const pending = new Map<string, Promise<unknown>>();
  function fetchOnce(date: string): Promise<unknown> {
    const existing = pending.get(date); if (existing) return existing;
    const request = deps.fetchPublication(date).finally(() => pending.delete(date));
    pending.set(date,request); return request;
  }
  return async function lookup(dateAD: string, currency = 'USD'): Promise<NrbRateResult> {
    const date = validateForexDate(dateAD), code = normalizeCurrency(currency), now = deps.now(), today = nstToday(now);
    if (date > today) throw new RangeError('Future settlement dates are not supported.');
    let networkAvailable = deps.isOnline();
    for (let offset = 0; offset <= 5; offset++) {
      const candidate = previousDate(date,offset);
      let cached: CachedPublication | undefined;
      try { cached = await deps.readCache(candidate); } catch { /* Storage denial must not block network or bundled rates. */ }
      let staleRate: NrbRateResult | undefined;
      if (cached) {
        try {
          const publication = parsePublication(cached,candidate);
          // Today's publication may be corrected. Revalidate hourly while online.
          const age = now.getTime() - Date.parse(cached.fetchedAt);
          const fresh = candidate !== today || (age >= 0 && age < 3600000) || !networkAvailable;
          const rate = publication.rates[code];
          if (rate && publication.publishedOn >= previousDate(date,5)) {
            staleRate = { rate:rate.effectiveBuy,isFallback:publication.publishedOn !== date,...(publication.publishedOn !== date ? {fallbackDate:publication.publishedOn} : {}),source:'cache' };
            if (fresh) return staleRate;
          }
        } catch { /* Old or invalid cache entries are replaceable. */ }
      }
      if (!networkAvailable) continue;
      let publication: ForexPublication;
      try { publication = parsePublication(await fetchOnce(candidate),candidate); }
      catch { networkAvailable = false; if (staleRate) return staleRate; continue; }
      if (!Object.keys(publication.rates).length) continue;
      try { await deps.writeCache({...publication,fetchedAt:now.toISOString()}); } catch { /* The retrieved rate remains usable if storage is full. */ }
      const rate = publication.rates[code];
      if (!rate) throw new ForexRateUnavailableError(`NRB has no ${code} quote for ${candidate}.`);
      if (publication.publishedOn < previousDate(date,5)) continue;
      return {rate:rate.effectiveBuy,isFallback:publication.publishedOn !== date,...(publication.publishedOn !== date ? {fallbackDate:publication.publishedOn} : {}),source:'api'};
    }
    const benchmark = bundledRate(date,code);
    if (benchmark) return benchmark;
    throw new ForexRateUnavailableError(`No saved or published ${code} rate within five days of ${date}, and no bundled benchmark covers this date.`);
  };
}
