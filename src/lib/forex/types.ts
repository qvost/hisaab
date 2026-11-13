export interface ForexRate { buy: number; sell: number; unit: number; effectiveBuy: number }
export interface ForexPublication { date: string; publishedOn: string; rates: Record<string, ForexRate> }
export interface CachedPublication extends ForexPublication { fetchedAt: string }
export interface NrbRateResult { rate: number; isFallback: boolean; fallbackDate?: string; source: 'cache' | 'api' | 'bundled'; benchmarkPeriod?: string }
export function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function validateForexDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2199-12-31') throw new RangeError('Date must be YYYY-MM-DD between 1900 and 2199.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw new RangeError('Invalid Gregorian date.');
  return value;
}
export function nstToday(now = new Date()): string { return new Date(now.getTime() + 345 * 60000).toISOString().slice(0,10); }
export function previousDate(date: string, days: number): string { return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString().slice(0,10); }
export function normalizeCurrency(value: string): string { const code = value.toUpperCase().trim(); if (!/^[A-Z]{3}$/.test(code)) throw new RangeError('Currency must be a three-letter ISO code.'); return code; }
function positive(value: unknown): number { if ((typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) && typeof value !== 'number') throw new Error('Invalid NRB numeric value.'); const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid NRB numeric value.'); return n; }
export function parseRate(value: unknown): ForexRate {
  if (!isRecord(value)) throw new Error('Invalid rate.');
  const buy = positive(value.buy), sell = positive(value.sell), unit = positive(value.unit);
  if (!Number.isSafeInteger(unit)) throw new Error('Invalid currency unit.');
  const effectiveBuy = buy / unit;
  if (value.effectiveBuy !== undefined && (typeof value.effectiveBuy !== 'number' || Math.abs(value.effectiveBuy - effectiveBuy) > 1e-9)) throw new Error('Inconsistent effective buying rate.');
  return { buy,sell,unit,effectiveBuy };
}
export function parsePublication(value: unknown, requestedDate: string): ForexPublication {
  if (!isRecord(value) || value.date !== requestedDate || !isRecord(value.rates)) throw new Error('Invalid forex response.');
  const publishedOn = Object.keys(value.rates).length ? validateForexDate(value.publishedOn) : '';
  if (publishedOn > requestedDate) throw new Error('Publication follows requested date.');
  const rates: Record<string, ForexRate> = {};
  for (const [code,rate] of Object.entries(value.rates)) { if (!/^[A-Z]{3}$/.test(code)) throw new Error('Invalid currency code.'); rates[code] = parseRate(rate); }
  return { date: requestedDate,publishedOn,rates };
}
/** NRB V1 documents data.payload[].date, published_on and rates[].currency.{iso3,unit}. */
export function parseNrbResponse(value: unknown, date: string): ForexPublication {
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.payload)) throw new Error('Unexpected NRB response format.');
  if (isRecord(value.status) && value.status.code !== undefined && Number(value.status.code) !== 200) throw new Error('NRB returned an error status.');
  const rows: unknown[] = value.data.payload;
  if (rows.length === 0) return { date,publishedOn:'',rates:{} };
  if (rows.length !== 1) throw new Error('Unexpected NRB publication count.');
  const row = rows[0];
  if (!isRecord(row) || row.date !== date || !Array.isArray(row.rates)) throw new Error('Unexpected NRB publication date or rates.');
  const rates: Record<string, ForexRate> = {};
  for (const entry of row.rates) {
    if (!isRecord(entry) || !isRecord(entry.currency) || typeof entry.currency.iso3 !== 'string') throw new Error('Malformed NRB rate.');
    const code = normalizeCurrency(entry.currency.iso3);
    if (rates[code]) throw new Error('Duplicate NRB currency.');
    rates[code] = parseRate({ buy: entry.buy, sell: entry.sell, unit: entry.currency.unit });
  }
  // The rate's civil date is its effective publication date. NRB published_on can include a time.
  const publishedOn = typeof row.published_on === 'string' ? validateForexDate(row.published_on.slice(0,10)) : date;
  return parsePublication({date,publishedOn: Object.keys(rates).length ? publishedOn : '',rates},date);
}
