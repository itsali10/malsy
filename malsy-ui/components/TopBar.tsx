'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Flame, Bell, LogOut, Menu, User as UserIcon, Settings as SettingsIcon } from 'lucide-react';
import { auth } from '../lib/auth';
import { api } from '../lib/api';
import type { UserRead } from '../lib/api';
import { recordStreakActivity } from '../lib/streak';
import { buildNotifications, getReadIds, markRead, type AppNotification } from '../lib/notifications';
import { searchPortalSubjects, clearPortalSubjectsCache, routeForPortalSubject, type PortalSubject } from '../lib/studentPortalSubjects';
import { getTimeGreeting } from '../lib/greeting';

const META: Record<string, [string, string]> = {
  '/':            ['Dashboard',    ''],
  '/lessons':     ['Lessons',      'Choose a subject to study'],
  '/challenges':  ['Challenges',   'Play games and climb the leaderboard'],
  '/schedule':    ['Schedule',     'Your classes and exams'],
  '/profile':     ['Profile',      'Your progress'],
  '/settings':    ['Settings',     'Preferences and account'],
};

interface TopBarProps {
  onMenuToggle?: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
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
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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
      .then((nextSession) => {
        if (cancelled) return;
        setNotifs(buildNotifications({ streak: s, nextSession: nextSession ?? null }));
      });
    return () => {
      cancelled = true;
    };
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
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (notifOpen && notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (menuOpen && profileRef.current && !profileRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (searchOpen && searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [notifOpen, menuOpen, searchOpen]);

  const unreadCount = notifs.filter((n) => !readIds.has(n.id)).length;

  function toggleNotifs() {
    setNotifOpen((open) => {
      const next = !open;
      if (next && notifs.length > 0) {
        const ids = notifs.map((n) => n.id);
        markRead(user?.user_id, ids);
        setReadIds((prev) => new Set([...prev, ...ids]));
      }
      return next;
    });
  }

  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : 'SA';

  const greeting =
    pathname === '/'
      ? getTimeGreeting(user?.first_name)
      : sub;

  function handleLogout() {
    clearPortalSubjectsCache();
    auth.logout();
    router.replace('/login');
  }

  return (
    <header id="topbar">
      <div className="tb-left">
        {onMenuToggle ? (
          <button
            type="button"
            className="tb-menu-btn"
            onClick={onMenuToggle}
            aria-label="Open navigation menu"
          >
            <Menu size={20} strokeWidth={2} />
          </button>
        ) : null}
        <div>
          <h1 className="tb-title">{title}</h1>
          {greeting ? <span className="tb-sub">{greeting}</span> : null}
        </div>
      </div>
      <div className="tb-right">
        <div className="tb-search" ref={searchRef}>
          <Search size={16} strokeWidth={2} aria-hidden />
          <input
            type="text"
            placeholder="Search subjects"
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
                    router.push(routeForPortalSubject(hit));
                  }}
                >
                  {hit.icon ? `${hit.icon} ` : ''}
                  {hit.subject_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tb-streak" title={`${streak}-day learning streak`}>
          <Flame size={16} strokeWidth={2} aria-hidden />
          <span>{streak}</span>
        </div>
        <div className="tb-menu-wrap" ref={notifRef}>
          <button type="button" className="tb-icon-btn" onClick={toggleNotifs} aria-label="Notifications">
            <Bell size={18} strokeWidth={2} />
            {unreadCount > 0 && <div className="tb-notif-dot" />}
          </button>
          {notifOpen && (
            <div className="tb-dropdown tb-notif-dropdown">
              <div className="tb-dropdown-header">Notifications</div>
              {notifs.length === 0 ? (
                <div className="tb-dropdown-empty">You&apos;re all caught up.</div>
              ) : (
                notifs.map((n) => (
                  <div key={n.id} className="tb-notif-item">
                    <span className="tb-notif-icon" aria-hidden>
                      {n.icon}
                    </span>
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
        <div className="tb-menu-wrap" ref={profileRef}>
          <button
            type="button"
            className="tb-avatar"
            onClick={() => setMenuOpen((o) => !o)}
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
              <Link href="/profile" className="tb-menu-link" onClick={() => setMenuOpen(false)}>
                <UserIcon size={16} strokeWidth={2} aria-hidden />
                Profile
              </Link>
              <Link href="/settings" className="tb-menu-link" onClick={() => setMenuOpen(false)}>
                <SettingsIcon size={16} strokeWidth={2} aria-hidden />
                Settings
              </Link>
              <div className="tb-dropdown-divider" />
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
