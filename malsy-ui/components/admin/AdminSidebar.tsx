'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import MalsyLogo from '../MalsyLogo';

const NAV = [
  { href: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/admin/books',     icon: '📚', label: 'Student Content' },
  { href: '/admin/students',  icon: '👥', label: 'Students' },
  { href: '/admin/analytics', icon: '📈', label: 'Analytics' },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div id="sidebar" className="expanded admin-sidebar">
      <div className="sb-logo-row">
        <Link href="/admin/dashboard" className="sb-logo" aria-label="MALSY Admin">
          <MalsyLogo variant="sidebar" />
        </Link>
      </div>

      <div style={{ padding: '0 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--g5)' }}>
          Admin Panel
        </div>
      </div>

      <div className="nav-items">
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className={`nav-btn${active ? ' active' : ''}`}>
              <span className="ni">{item.icon}</span>
              <span className="nl">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div style={{ padding: '12px 14px', marginTop: 'auto', width: '100%' }} />
    </div>
  );
}
