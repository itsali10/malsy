'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, StudentSummary } from '../../../lib/admin-api';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function studentStatsLabel(s: StudentSummary): string {
  const parts: string[] = [];
  if (s.subjects_assigned_count > 0) {
    parts.push(
      `${s.subjects_assigned_count} subject${s.subjects_assigned_count === 1 ? '' : 's'} assigned`,
    );
  }
  if (s.scheduled_lessons_count > 0) {
    parts.push(
      `${s.scheduled_lessons_count} scheduled lesson${s.scheduled_lessons_count === 1 ? '' : 's'}`,
    );
  }
  if (s.completed_lessons_count > 0) {
    parts.push(
      `${s.completed_lessons_count} completed lesson${s.completed_lessons_count === 1 ? '' : 's'}`,
    );
  }
  if (parts.length === 0) return 'No schedule data yet';
  return parts.join(' · ');
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const listUrl = `${API_BASE}/admin/students`;
    console.log('[admin-students] fetching list:', listUrl);

    adminApi.students
      .list()
      .then((rows) => {
        console.log('[admin-students] list response:', rows);
        rows.forEach((s) => {
          console.log('[admin-students] counts for', s.user_id, {
            source: 'StudentScheduleEnrollment + LessonEvaluation',
            subjects_assigned_count: s.subjects_assigned_count,
            scheduled_lessons_count: s.scheduled_lessons_count,
            completed_lessons_count: s.completed_lessons_count,
          });
        });
        setStudents(rows);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to load students';
        console.error('[admin-students] list error:', e);
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-enter" style={{ padding: 28 }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Students</h1>
      <p style={{ color: 'var(--g3)', fontSize: 14, marginBottom: 24 }}>View student accounts and learning progress.</p>

      {error && <div style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="modal-spinner" /></div>
      ) : students.length === 0 && !error ? (
        <div className="card" style={{ padding: 24, borderRadius: 16, color: 'var(--g3)' }}>No active students found.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {students.map((s) => (
            <Link
              key={s.user_id}
              href={`/admin/students/${s.user_id}`}
              className="card"
              style={{ padding: '16px 20px', borderRadius: 16, display: 'block' }}
              onClick={() => console.log('[admin-students] clicked student id:', s.user_id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.first_name} {s.last_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 4 }}>{s.email} · Grade {s.grade_level ?? '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, color: s.account_status === 'Active' ? 'var(--mint)' : 'var(--g5)' }}>{s.account_status}</span>
                  <span style={{ fontSize: 11, color: 'var(--g3)', textAlign: 'right' }}>{studentStatsLabel(s)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
