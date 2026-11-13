'use client';
import { useNepaliCalendar } from './calendar/use-nepali-calendar';
import { ForexRateBadge } from './forex/forex-badge';
import { CommandPalette } from './command-palette';
export function TopBar() {
  const calendar = useNepaliCalendar();
  return <header className="top-bar"><div className="dual-clock"><span className="clock-date">{calendar ? `${calendar.currentBS.year} ${calendar.currentBS.monthName} ${calendar.currentBS.day}` : '…'} BS <b>•</b> {calendar?.dateAD ?? '…'} AD <b>•</b> FY {calendar?.fiscalYear ?? '…'} <b>•</b> </span><time>{calendar?.nstClock ?? '--:--:--'} <span>NST</span></time></div><CommandPalette /><ForexRateBadge /></header>;
}
