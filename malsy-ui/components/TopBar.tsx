'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '../lib/auth';
import type { UserRead } from '../lib/api';

const META: Record<string, [string, string]> = {
  '/':            ['Dashboard',    'Good morning'],
  '/lessons':     ['Lessons',      'Choose a subject to study'],
  '/challenges':  ['Challenges',   "Beat today's challenge & earn XP"],
  '/leaderboard': ['Leaderboard',  'Class rankings'],
  '/schedule':    ['Schedule',     'Your classes and exams'],
  '/arcade':      ['Arcade',       'Play games, earn rewards'],
  '/lab':         ['Lab',          'Virtual experiments from your textbook'],
  '/inbox':       ['Inbox',        'Messages'],
  '/profile':     ['Profile',      'Your progress'],
  '/settings':    ['Settings',     'Preferences & account'],
};

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserRead | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [title, sub] = META[pathname] ?? ['MALSY', ''];

  useEffect(() => {
    const cached = auth.getUser();
    if (cached) setUser(cached);
  }, []);

  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : 'SA';

  const greeting =
    pathname === '/'
      ? `Good morning, ${user?.first_name ?? 'there'} 👋`
      : sub;

  function handleLogout() {
    auth.logout();
    router.replace('/login');
  }

  return (
    <div id="topbar">
      <div>
        <span className="tb-title">{title}</span>
        <span className="tb-sub">{greeting}</span>
      </div>
      <div className="tb-right">
        <div className="tb-search">
          <span>🔍</span>
          <input type="text" placeholder="Search lessons, topics…" />
        </div>
        <div className="tb-streak">🔥 0</div>
        <button className="tb-icon-btn">
          🔔
          <div className="tb-notif-dot" />
        </button>
        <div style={{ position: 'relative' }}>
          <div
            className="tb-avatar"
            style={{ cursor: 'pointer' }}
            onClick={() => setMenuOpen(o => !o)}
            title={user ? `${user.first_name} ${user.last_name}` : ''}
          >
            {initials}
          </div>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              background: 'var(--navym)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 12, padding: '6px 0', minWidth: 160,
              boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 999,
            }}>
              {user && (
                <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700 }}>
                    {user.first_name} {user.last_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--g3)', marginTop: 2 }}>{user.email}</div>
                </div>
              )}
              <button
                onClick={handleLogout}
                style={{
                  display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
                  background: 'none', border: 'none', color: 'var(--coral)',
                  fontFamily: 'var(--fb)', fontSize: 13, cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
