'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AdminSidebar from './AdminSidebar';
import MalsyLogo from '../MalsyLogo';
import ThemeToggle from '../ThemeToggle';
import { adminAuth } from '../../lib/admin-auth';
import { adminApi } from '../../lib/admin-api';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname.startsWith('/admin/login');
  const [ready, setReady] = useState(isLogin);

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    if (!adminAuth.isLoggedIn()) {
      router.replace('/admin/login');
      return;
    }
    adminApi.me()
      .then(user => { adminAuth.setUser(user); setReady(true); })
      .catch(() => { adminAuth.clear(); router.replace('/admin/login'); });
  }, [isLogin, router]);

  if (!ready) {
    return (
      <div className="app-loading">
        <MalsyLogo variant="loading" />
        <span>Loading admin…</span>
      </div>
    );
  }

  if (isLogin) return <>{children}</>;

  const user = adminAuth.getUser();

  return (
    <div className="app-shell">
      <AdminSidebar />
      <div id="main">
        <div id="topbar" className="admin-topbar">
          <div className="tb-title">Admin Dashboard</div>
          <div className="tb-right">
            <ThemeToggle />
            <span style={{ fontSize: 12, color: 'var(--g3)' }}>{user?.display_name ?? 'Admin'}</span>
            <button
              className="btn btn-o btn-sm"
              onClick={() => { adminAuth.clear(); router.replace('/admin/login'); }}
            >
              Sign out
            </button>
          </div>
        </div>
        <div id="content" style={{ overflow: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
