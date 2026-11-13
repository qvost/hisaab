import { formatDualDate } from '@/lib/calendar/samayamiiti';
export function DualDateBadge({ dateAD }: { dateAD: string | Date }) {
  return <span className="dual-date-badge"><span className="status-dot" />{formatDualDate(dateAD)}</span>;
}
