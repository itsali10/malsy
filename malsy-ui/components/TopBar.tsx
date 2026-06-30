'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '../lib/auth';
import { api } from '../lib/api';
import type { UserRead } from '../lib/api';
import { recordStreakActivity } from '../lib/streak';
import { buildNotifications, getReadIds, markRead, type AppNotification } from '../lib/notifications';

const META: Record<string, [string, string]> = {
  '/':            ['Dashboard',    'Good morning'],
  '/lessons':     ['Lessons',      'Choose a subject to study'],
  '/challenges':  ['Challenges',   "Beat today's challenge & earn XP"],
  '/schedule':    ['Schedule',     'Your classes and exams'],
  '/profile':     ['Profile',      'Your progress'],
  '/settings':    ['Settings',     'Preferences & account'],
};

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserRead | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [notifOpen, setNotifOpen] = useState(false);

  const [title, sub] = META[pathname] ?? ['MALSY', ''];

  useEffect(() => {
    const cached = auth.getUser();
    if (cached) setUser(cached);
    const s = recordStreakActivity(cached?.user_id);
    setStreak(s);
    setReadIds(getReadIds(cached?.user_id));

    let cancelled = false;
    api.dashboard
      .nextSession()
      .catch(() => null)
      .then(nextSession => {
        if (cancelled) return;
        setNotifs(buildNotifications({ streak: s, nextSession: nextSession ?? null }));
      });
    return () => { cancelled = true; };
  }, []);

  const unreadCount = notifs.filter(n => !readIds.has(n.id)).length;

  function toggleNotifs() {
    setNotifOpen(open => {
      const next = !open;
      if (next && notifs.length > 0) {
        const ids = notifs.map(n => n.id);
        markRead(user?.user_id, ids);
        setReadIds(prev => new Set([...prev, ...ids]));
      }
      return next;
    });
  }

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
        <div className="tb-streak" title={`${streak}-day learning streak`}>🔥 {streak}</div>
        <div style={{ position: 'relative' }}>
          <button className="tb-icon-btn" onClick={toggleNotifs} aria-label="Notifications">
            🔔
            {unreadCount > 0 && <div className="tb-notif-dot" />}
          </button>
          {notifOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              background: 'var(--navym)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 12, padding: '6px 0', width: 320, maxHeight: 420, overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,.4)', zIndex: 999,
            }}>
              <div style={{
                padding: '8px 14px 10px', borderBottom: '1px solid rgba(255,255,255,.07)',
                fontFamily: 'var(--fd)', fontSize: 13, fontWeight: 700,
              }}>
                Notifications
              </div>
              {notifs.length === 0 ? (
                <div style={{ padding: '18px 14px', fontSize: 12, color: 'var(--g3)' }}>
                  You&apos;re all caught up.
                </div>
              ) : (
                notifs.map(n => (
                  <div key={n.id} style={{
                    display: 'flex', gap: 10, padding: '10px 14px',
                    borderBottom: '1px solid rgba(255,255,255,.05)',
                  }}>
                    <span style={{ fontSize: 18, lineHeight: '20px' }}>{n.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--fd)', fontSize: 12.5, fontWeight: 700 }}>{n.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--g3)', marginTop: 2, lineHeight: 1.35 }}>{n.body}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
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
