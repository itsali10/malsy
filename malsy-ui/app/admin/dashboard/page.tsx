'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, AdminDashboard } from '../../../lib/admin-api';

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card" style={{ padding: '22px 24px', borderRadius: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--g3)', marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: 'var(--fd)', fontSize: 34, fontWeight: 800, color: color ?? 'var(--w)' }}>{value}</div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.dashboard().then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  return (
    <div className="page-enter" style={{ padding: 28 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Dashboard</h1>
        <p style={{ color: 'var(--g3)', fontSize: 14 }}>Overview of students, books, and processing status.</p>
      </div>

      {error && <div style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
            <StatCard label="Total Students" value={data.total_students} color="var(--sky)" />
            <StatCard label="Active Students" value={data.active_students} color="var(--mint)" />
            <StatCard label="Total Books" value={data.total_books} />
            <StatCard label="Visible Books" value={data.visible_books} color="var(--mint)" />
            <StatCard label="Processed" value={data.processed_books} color="var(--mint)" />
            <StatCard label="Processing" value={data.processing_books} color="var(--amber)" />
            <StatCard label="Failed" value={data.failed_books} color="var(--coral)" />
            <StatCard label="Archived" value={data.archived_books} color="var(--g3)" />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/admin/books" className="btn btn-o">Manage Student Content</Link>
            <Link href="/admin/students" className="btn btn-o">View Students</Link>
          </div>
        </>
      )}

      {!data && !error && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="modal-spinner" /></div>
      )}
    </div>
  );
}
