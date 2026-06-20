'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',            icon: '🏠', label: 'Dashboard' },
  { href: '/lessons',     icon: '📖', label: 'Lessons' },
  { href: '/challenges',  icon: '⚡', label: 'Challenges' },
  { href: '/schedule',    icon: '📅', label: 'Schedule' },
  { href: '/profile',     icon: '👤', label: 'Profile' },
  { href: '/settings',    icon: '⚙️', label: 'Settings' },
];

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  const toggle = () => setExpanded(p => !p);

  return (
    <div id="sidebar" className={expanded ? 'expanded' : ''}>
      <div className="sb-logo-row">
        <div className="sb-logo" onClick={toggle}>
          <svg viewBox="0 0 72 72" fill="none">
            <circle cx="36" cy="36" r="22" fill="white" fillOpacity=".2" />
            <path
              d="M23 42V30L29 38L36 30L43 38L49 30V42"
              stroke="white" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" fill="none"
            />
            <circle cx="36" cy="4" r="4" fill="#00E5A0" />
          </svg>
        </div>
        <div className="sb-logo-text">
          MALSY<span style={{ color: 'var(--mint)' }}>.</span>
        </div>
      </div>

      <div className="nav-items">
        {NAV.map(item => {
          const active = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-btn${active ? ' active' : ''}`}
            >
              <span className="ni">{item.icon}</span>
              <span className="nl">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <button className="sb-toggle" onClick={toggle}>
        {expanded ? '‹' : '›'}
      </button>
    </div>
  );
}
