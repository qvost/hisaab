'use client';
import { useState } from 'react';
import { DualDatePicker, type DualDateChange } from './dual-date-picker';
import { DualDateBadge } from './dual-date-badge';
export function CalendarPreview() {
  const [selection, setSelection] = useState<DualDateChange | null>(null);
  return <section className="panel calendar-preview" aria-label="Dual calendar"><div><h2>One date. Both calendars.</h2><p>Pick a settlement date to resolve its Nepali fiscal year.</p></div><DualDatePicker valueAD={selection?.ad ?? '2024-08-15'} onChange={setSelection} /><DualDateBadge dateAD={selection?.ad ?? '2024-08-15'} /><span className="muted">FY {selection?.fiscalYear ?? '2081/82'}</span></section>;
}
