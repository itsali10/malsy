'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MalsyLogo from './MalsyLogo';
import { ThemeProvider } from '../lib/theme';

const AUTH_PATHS = ['/login'];
const ADMIN_PREFIX = '/admin';
const LESSON_FOCUS_PREFIX = '/lessons/learn';

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX);
  const isAuthPage =
    AUTH_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith('/admin/login');
  const isLessonFocus = pathname.startsWith(LESSON_FOCUS_PREFIX);
  const [ready, setReady] = useState(isAuthPage || isAdminRoute);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (isAuthPage || isAdminRoute) {
      setReady(true);
      return;
    }
    const token = localStorage.getItem('malsy_token');
    if (!token) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [pathname, isAuthPage, isAdminRoute, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (!ready) {
    return (
      <div className="app-loading">
        <MalsyLogo variant="loading" />
        <span>Loading…</span>
      </div>
    );
  }

  if (isAuthPage || isAdminRoute) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  if (isLessonFocus) {
    return (
      <ThemeProvider>
        <div id="main" className="shell-focus">
          <div id="content" className="shell-focus__content">
            {children}
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      {mobileNavOpen ? (
        <button
          type="button"
          className="shell-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <div className="app-shell">
        <Sidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
        <div id="main">
          <TopBar onMenuToggle={() => setMobileNavOpen((open) => !open)} />
          <div id="content">{children}</div>
        </div>
      </div>
    </ThemeProvider>
  );
}
