'use client';
import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowUpRight } from 'lucide-react';
import { navigation } from '@/lib/navigation';
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [shortcut, setShortcut] = useState('Ctrl');
  const router = useRouter();
  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl');
    const keydown = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(v => !v); } };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  return <>
    <button className="search-trigger" onClick={() => setOpen(true)}><Search size={14} /><span>Jump to anything...</span><kbd>{shortcut} K</kbd></button>
    <Command.Dialog open={open} onOpenChange={setOpen} label="Navigate Hisaab" overlayClassName="command-overlay" contentClassName="command-dialog">
      <div className="command-input"><Search size={19} /><Command.Input placeholder="Where would you like to go?" /><button onClick={() => setOpen(false)} aria-label="Close search"><kbd>Esc</kbd></button></div>
      <Command.List><Command.Empty>No matching pages. Try “invoice” or “tax”.</Command.Empty><Command.Group heading="Workspace">{navigation.map(item => <Command.Item key={item.href} value={`${item.label} ${item.description}`} onSelect={() => { router.push(item.href); setOpen(false); }}><item.icon size={19} /><div>{item.label}<small>{item.description}</small></div><ArrowUpRight size={15} /></Command.Item>)}</Command.Group></Command.List>
      <div className="command-footer"><span>↑ ↓ to navigate</span><span>↵ to open</span></div>
    </Command.Dialog>
  </>;
}
