'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MalsyLogo from './MalsyLogo';
import { ThemeProvider } from '../lib/theme';

const AUTH_PATHS = ['/login'];
const ADMIN_PREFIX = '/admin';

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX);
  const isAuthPage =
    AUTH_PATHS.some(p => pathname.startsWith(p)) || pathname.startsWith('/admin/login');
  const [ready, setReady] = useState(isAuthPage || isAdminRoute);

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

  return (
    <ThemeProvider>
      <Sidebar />
      <div id="main">
        <TopBar />
        <div id="content">{children}</div>
      </div>
    </ThemeProvider>
  );
}
