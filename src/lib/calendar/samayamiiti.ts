import { CALENDAR_DATA, MIN_BS_YEAR, MAX_BS_YEAR, MONTHS } from './calendar-data';
export interface BsDate { year: number; month: number; day: number; monthName: string; monthNameNp: string; formatted: string; formattedNp: string }
const DAY = 86_400_000;
const ANCHOR = Date.UTC(1943, 3, 14); // BS 2000-01-01
export const pad = (n: number): string => String(n).padStart(2, '0');
export const toNepaliDigits = (s: string): string => s.replace(/[0-9]/g, d => '०१२३४५६७८९'.charAt(Number(d)));
export const formatBsIso = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;
export function getDaysInBsMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < MIN_BS_YEAR || year > MAX_BS_YEAR) throw new RangeError(`BS year must be ${MIN_BS_YEAR}–${MAX_BS_YEAR}`);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('BS month must be 1–12');
  return CALENDAR_DATA[year][month - 1];
}
export function validateBsDate(year: number, month: number, day: number): void {
  const days = getDaysInBsMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > days) throw new RangeError(`BS day must be 1–${days} for ${year}-${pad(month)}`);
}
export function parseBsDate(value: string): { year: number; month: number; day: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('BS date must use YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  validateBsDate(year, month, day); return { year, month, day };
}
/** Date-only strings are civil dates. Date objects and offset-bearing timestamps are instants interpreted in NST. */
export function normalizeAdDate(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new RangeError('Invalid Gregorian date');
    return value;
  }
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new RangeError('Use YYYY-MM-DD or an ISO timestamp with a timezone');
  if (typeof value === 'string') normalizeAdDate(value.slice(0, 10));
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid Gregorian date');
  return new Date(date.getTime() + 345 * 60_000).toISOString().slice(0, 10);
}
export function bsToAd(year: number, month: number, day: number): Date {
  validateBsDate(year, month, day);
  let offset = day - 1;
  for (let y = MIN_BS_YEAR; y < year; y++) offset += CALENDAR_DATA[y].reduce((a, b) => a + b, 0);
  for (let m = 1; m < month; m++) offset += getDaysInBsMonth(year, m);
  return new Date(ANCHOR + offset * DAY);
}
export function formatNepaliDate(year: number, month: number, day: number, locale: 'en' | 'np' = 'en'): string {
  validateBsDate(year, month, day);
  const text = `${year} ${MONTHS[month - 1][locale]} ${day}`;
  return locale === 'np' ? toNepaliDigits(text) : text;
}
export function adToBs(value: Date | string): BsDate {
  const iso = normalizeAdDate(value);
  let offset = (Date.parse(`${iso}T00:00:00Z`) - ANCHOR) / DAY;
  if (offset < 0) throw new RangeError('AD date precedes BS 2000-01-01');
  for (let year = MIN_BS_YEAR; year <= MAX_BS_YEAR; year++) {
    for (let month = 1; month <= 12; month++) {
      const days = getDaysInBsMonth(year, month);
      if (offset < days) {
        const day = offset + 1;
        return { year, month, day, monthName: MONTHS[month - 1].en, monthNameNp: MONTHS[month - 1].np, formatted: formatBsIso(year, month, day), formattedNp: formatNepaliDate(year, month, day, 'np') };
      }
      offset -= days;
    }
  }
  throw new RangeError('AD date exceeds BS 2095-12 end');
}
export function formatDualDate(value: Date | string): string { return `${normalizeAdDate(value)} AD (${adToBs(value).formatted} BS)`; }
export const MIN_AD_DATE = bsToAd(MIN_BS_YEAR, 1, 1).toISOString().slice(0, 10);
export const MAX_AD_DATE = bsToAd(MAX_BS_YEAR, 12, getDaysInBsMonth(MAX_BS_YEAR, 12)).toISOString().slice(0, 10);
