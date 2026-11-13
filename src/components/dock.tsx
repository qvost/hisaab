'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { navigation } from '@/lib/navigation';
import { cn } from '@/lib/utils';
export function Dock() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<number | null>(null);
  return <nav className="dock" aria-label="Main navigation" onPointerLeave={() => setHovered(null)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHovered(null); }}>
    {navigation.map((item, index) => {
      const distance = hovered === null ? Infinity : Math.abs(hovered - index);
      const scale = distance === 0 ? 1.15 : distance === 1 ? 1.05 : 1;
      return <Link key={item.href} href={item.href} aria-label={item.label} aria-current={pathname === item.href ? 'page' : undefined} className={cn('dock-slot', pathname === item.href && 'active')} onPointerEnter={e => { if (e.pointerType !== 'touch') setHovered(index); }} onFocus={() => setHovered(index)} style={{ width: 40 * scale }}>
        <span className="dock-circle" style={{ transform: `scale(${scale})` }}><item.icon size={19} strokeWidth={1.6} /></span>
        <span className={cn('dock-tooltip', distance === 0 && 'visible')} role="tooltip" style={{ bottom: 40 * scale + 15 }}>{item.label}</span>
        <span className="dock-indicator" />
      </Link>;
    })}
  </nav>;
}
