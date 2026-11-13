import { bsToAd, getDaysInBsMonth, parseBsDate, formatBsIso } from './samayamiiti';
export function getNepaliFiscalYear(date: string | { year: number; month: number }): string {
  const { year, month } = typeof date === 'string' ? parseBsDate(date) : date;
  getDaysInBsMonth(year, month);
  const start = month >= 4 ? year : year - 1;
  return `${start}/${String(start + 1).slice(-2)}`;
}
export function getFiscalYearDateRange(fiscalYear: string): { startAD: Date; endAD: Date; startBS: string; endBS: string } {
  if (!/^\d{4}\/\d{2}$/.test(fiscalYear)) throw new RangeError('Fiscal year must use YYYY/YY');
  const year = Number(fiscalYear.slice(0, 4));
  if (fiscalYear.slice(-2) !== String(year + 1).slice(-2)) throw new RangeError('Fiscal year must contain consecutive years');
  const endDay = getDaysInBsMonth(year + 1, 3);
  return { startAD: bsToAd(year, 4, 1), endAD: bsToAd(year + 1, 3, endDay), startBS: formatBsIso(year, 4, 1), endBS: formatBsIso(year + 1, 3, endDay) };
}
/** Standard monthly filing rule; special filing periods and extensions are outside this resolver. */
export function getVatFilingDeadline(year: number, month: number): { deadlineBS: string; deadlineAD: Date } {
  getDaysInBsMonth(year, month);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { deadlineBS: formatBsIso(nextYear, nextMonth, 25), deadlineAD: bsToAd(nextYear, nextMonth, 25) };
}
