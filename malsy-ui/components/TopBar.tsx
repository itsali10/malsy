'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Flame, Bell, LogOut } from 'lucide-react';
import { auth } from '../lib/auth';
import { api } from '../lib/api';
import type { UserRead } from '../lib/api';
import { recordStreakActivity } from '../lib/streak';
import { buildNotifications, getReadIds, markRead, type AppNotification } from '../lib/notifications';
import { searchPortalSubjects } from '../lib/studentPortalSubjects';
import type { PortalSubject } from '../lib/studentPortalSubjects';
import { routeForSubject } from '../lib/studentSchedule';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHits, setSearchHits] = useState<PortalSubject[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchHits([]);
      setSearchOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchPortalSubjects(q).then((hits) => {
        if (!cancelled) {
          setSearchHits(hits);
          setSearchOpen(true);
        }
      });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchQuery]);

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
      ? `Good morning, ${user?.first_name ?? 'there'}`
      : sub;

  function handleLogout() {
    auth.logout();
    router.replace('/login');
  }

  return (
    <header id="topbar">
      <div className="tb-left">
        <h1 className="tb-title">{title}</h1>
        <span className="tb-sub">{greeting}</span>
      </div>
      <div className="tb-right">
        <div className="tb-search" ref={searchRef}>
          <Search size={16} strokeWidth={2} aria-hidden />
          <input
            type="text"
            placeholder="Search your subjects…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim() && setSearchOpen(true)}
            aria-label="Search subjects"
          />
          {searchOpen && searchHits.length > 0 && (
            <div className="tb-dropdown tb-search-dropdown">
              {searchHits.map((hit) => (
                <button
                  key={hit.subject_id}
                  type="button"
                  className="tb-dropdown-item"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery('');
                    router.push(routeForSubject(hit.subject_name, searchHits));
                  }}
                >
                  {hit.icon ? `${hit.icon} ` : ''}{hit.subject_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tb-streak" title={`${streak}-day learning streak`}>
          <Flame size={16} strokeWidth={2} aria-hidden />
          <span>{streak}</span>
        </div>
        <div className="tb-menu-wrap">
          <button className="tb-icon-btn" onClick={toggleNotifs} aria-label="Notifications">
            <Bell size={18} strokeWidth={2} />
            {unreadCount > 0 && <div className="tb-notif-dot" />}
          </button>
          {notifOpen && (
            <div className="tb-dropdown tb-notif-dropdown">
              <div className="tb-dropdown-header">Notifications</div>
              {notifs.length === 0 ? (
                <div className="tb-dropdown-empty">You&apos;re all caught up.</div>
              ) : (
                notifs.map(n => (
                  <div key={n.id} className="tb-notif-item">
                    <span className="tb-notif-icon" aria-hidden>{n.icon}</span>
                    <div className="tb-notif-body">
                      <div className="tb-notif-title">{n.title}</div>
                      <div className="tb-notif-text">{n.body}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div className="tb-menu-wrap">
          <button
            type="button"
            className="tb-avatar"
            onClick={() => setMenuOpen(o => !o)}
            title={user ? `${user.first_name} ${user.last_name}` : ''}
            aria-label="Account menu"
          >
            {initials}
          </button>
          {menuOpen && (
            <div className="tb-dropdown tb-profile-dropdown">
              {user && (
                <div className="tb-profile-header">
                  <div className="tb-profile-name">
                    {user.first_name} {user.last_name}
                  </div>
                  <div className="tb-profile-email">{user.email}</div>
                </div>
              )}
              <button type="button" className="tb-logout-btn" onClick={handleLogout}>
                <LogOut size={16} strokeWidth={2} aria-hidden />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
