'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  Zap,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import MalsyLogo from './MalsyLogo';

const NAV = [
  { href: '/',            Icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/schedule',    Icon: CalendarDays,    label: 'Schedule' },
  { href: '/lessons',     Icon: BookOpen,        label: 'Lessons' },
  { href: '/challenges',  Icon: Zap,             label: 'Challenges' },
];

export default function Sidebar({
  mobileOpen = false,
  onNavigate,
}: {
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  const toggle = () => setExpanded((p) => !p);

  return (
    <aside
      id="sidebar"
      className={[expanded ? 'expanded' : '', mobileOpen ? 'mobile-open' : ''].filter(Boolean).join(' ')}
      aria-label="Main navigation"
    >
      <div className="sb-logo-row">
        <button type="button" className="sb-logo" onClick={toggle} aria-label="Toggle sidebar">
          <MalsyLogo variant="sidebar" />
        </button>
      </div>

      <nav className="nav-items">
        {NAV.map(item => {
          const active = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
          const { Icon } = item;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-btn${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={!expanded ? item.label : undefined}
              onClick={onNavigate}
            >
              <span className="ni" aria-hidden="true">
                <Icon size={20} strokeWidth={2} />
              </span>
              <span className="nl">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        className="sb-toggle"
        onClick={toggle}
        aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
    </aside>
  );
}
