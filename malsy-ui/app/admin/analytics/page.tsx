'use client';

import { useEffect, useState } from 'react';
import { adminApi, AdminAnalytics, statusColor } from '../../../lib/admin-api';

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.analytics().then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed'));
  }, []);

  return (
    <div className="page-enter" style={{ padding: 28 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Analytics</h1>
      <p style={{ color: 'var(--g3)', fontSize: 14, marginBottom: 28 }}>Platform usage and content statistics.</p>

      {error && <div style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</div>}

      {!data ? (
        !error && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="modal-spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div className="card" style={{ padding: 22, borderRadius: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--vl)' }}>Students by Grade</h2>
            {Object.entries(data.students_by_grade).map(([grade, count]) => (
              <div key={grade} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 14 }}>
                <span>Grade {grade}</span>
                <span style={{ fontWeight: 700 }}>{count}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 22, borderRadius: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--vl)' }}>Books by Status</h2>
            {Object.entries(data.books_by_status).map(([status, count]) => (
              <div key={status} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 14 }}>
                <span style={{ color: statusColor(status) }}>{status}</span>
                <span style={{ fontWeight: 700 }}>{count}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 22, borderRadius: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--vl)' }}>Books by Subject</h2>
            {Object.entries(data.books_by_subject).map(([subj, count]) => (
              <div key={subj} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 14 }}>
                <span style={{ textTransform: 'capitalize' }}>{subj}</span>
                <span style={{ fontWeight: 700 }}>{count}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 22, borderRadius: 18, gridColumn: '1 / -1' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--vl)' }}>Recent Uploads</h2>
            {data.recent_uploads.length === 0 && <div style={{ color: 'var(--g3)', fontSize: 13 }}>No uploads yet.</div>}
            {data.recent_uploads.map(u => (
              <div key={u.book_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 14 }}>
                <span>{u.title}</span>
                <span style={{ color: statusColor(u.status), fontSize: 12, fontWeight: 700 }}>{u.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
