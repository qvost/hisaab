import { House, FileText, ArrowLeftRight, GitCompareArrows, Package, Settings2 } from 'lucide-react';
export const navigation = [
  { href: '/', label: 'Overview', description: 'Fiscal year totals', icon: House },
  { href: '/invoices', label: 'Invoices', description: 'Dual-calendar BS / AD invoice builder', icon: FileText },
  { href: '/remittances', label: 'Remittances', description: 'Foreign wires, NRB rates & Section 95क TDS', icon: ArrowLeftRight },
  { href: '/reconcile', label: 'Reconciliation', description: 'Match Nabil, NIC Asia & eSewa statements', icon: GitCompareArrows },
  { href: '/tax-pack', label: 'Ashoj Tax Pack', description: 'Annual schedules and summary', icon: Package },
  { href: '/settings', label: 'Settings', description: 'Encrypted backups & PAN configuration', icon: Settings2 },
];
