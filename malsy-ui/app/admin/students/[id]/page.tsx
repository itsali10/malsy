'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  adminApi,
  StudentOverview,
  StudentParentInfo,
  StudentSession,
} from '../../../../lib/admin-api';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function statusColor(status: string): string {
  switch (status) {
    case 'attended':
    case 'completed':
      return 'var(--mint)';
    case 'available':
      return 'var(--sky)';
    case 'missed':
      return 'var(--coral)';
    case 'locked':
    case 'not_started':
    default:
      return 'var(--g3)';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'attended': return 'Attended';
    case 'missed': return 'Missed';
    case 'completed': return 'Completed';
    case 'available': return 'Available';
    case 'locked': return 'Locked';
    case 'not_started': return 'Not started';
    default: return status;
  }
}

function scheduleSummaryLabel(data: StudentOverview): string {
  if (data.scheduled_lessons_count > 0) {
    return `${data.scheduled_lessons_count} scheduled lesson${data.scheduled_lessons_count === 1 ? '' : 's'}`;
  }
  return 'No schedule data yet';
}

function SessionTable({
  title,
  sessions,
  studentId,
  showDate = true,
  loadError,
}: {
  title: string;
  sessions: StudentSession[];
  studentId: string;
  showDate?: boolean;
  loadError?: string;
}) {
  if (loadError) {
    return (
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{title}</h2>
        <div className="card" style={{ padding: 20, borderRadius: 16, color: 'var(--coral)', fontSize: 14 }}>
          {loadError}
        </div>
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{title}</h2>
        <div className="card" style={{ padding: 20, borderRadius: 16, color: 'var(--g3)', fontSize: 14 }}>
          No sessions recorded yet.
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{title}</h2>
      <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: showDate
              ? 'minmax(90px,1fr) minmax(80px,1fr) minmax(100px,1fr) minmax(90px,1fr) minmax(80px,1fr) minmax(90px,1fr) minmax(70px,1fr) auto'
              : 'minmax(80px,1fr) minmax(100px,1fr) minmax(90px,1fr) minmax(80px,1fr) minmax(90px,1fr) minmax(70px,1fr) auto',
            gap: 8,
            padding: '12px 16px',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            color: 'var(--g3)',
            borderBottom: '1px solid rgba(255,255,255,.08)',
          }}
        >
          {showDate && <span>Date</span>}
          <span>Day</span>
          <span>Subject</span>
          <span>Lesson</span>
          <span>Time</span>
          <span>Status</span>
          <span>Score</span>
          <span />
        </div>
        {sessions.map((row, idx) => (
          <div
            key={`${row.session_date}-${row.schedule_id}-${row.module}-${idx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: showDate
                ? 'minmax(90px,1fr) minmax(80px,1fr) minmax(100px,1fr) minmax(90px,1fr) minmax(80px,1fr) minmax(90px,1fr) minmax(70px,1fr) auto'
                : 'minmax(80px,1fr) minmax(100px,1fr) minmax(90px,1fr) minmax(80px,1fr) minmax(90px,1fr) minmax(70px,1fr) auto',
              gap: 8,
              padding: '14px 16px',
              fontSize: 13,
              borderBottom: '1px solid rgba(255,255,255,.05)',
              alignItems: 'center',
            }}
          >
            {showDate && (
              <span style={{ color: 'var(--g3)' }}>
                {row.session_date ? new Date(row.session_date).toLocaleDateString() : '—'}
              </span>
            )}
            <span style={{ color: 'var(--g3)' }}>{row.day_of_week ?? '—'}</span>
            <span>{row.subject}</span>
            <span>{row.module}</span>
            <span style={{ color: 'var(--g3)' }}>
              {row.scheduled_start ? `${row.scheduled_start}${row.scheduled_end ? `–${row.scheduled_end}` : ''}` : '—'}
            </span>
            <span style={{ color: statusColor(row.status), fontWeight: 700 }}>{statusLabel(row.status)}</span>
            <span>{row.quiz_score != null ? row.quiz_score : '—'}</span>
            {row.chapter_id ? (
              <Link
                href={`/admin/lessons/${encodeURIComponent(row.chapter_id)}?student=${encodeURIComponent(studentId)}`}
                className="btn btn-o btn-sm"
                style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                View lesson
              </Link>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminStudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(String(params.id ?? ''));
  const [data, setData] = useState<StudentOverview | null>(null);
  const [parents, setParents] = useState<StudentParentInfo | null>(null);
  const [schedule, setSchedule] = useState<StudentSession[]>([]);
  const [attendance, setAttendance] = useState<StudentSession[]>([]);
  const [error, setError] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [attendanceError, setAttendanceError] = useState('');
  const [parentsError, setParentsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing student id in URL.');
      setLoading(false);
      return;
    }

    setError('');
    setScheduleError('');
    setAttendanceError('');
    setParentsError('');
    setLoading(true);

    const overviewUrl = `${API_BASE}/admin/students/${encodeURIComponent(id)}`;
    console.log('[admin-students] loading detail for id:', id);
    console.log('[admin-students] overview URL:', overviewUrl);

    try {
      const overview = await adminApi.students.get(id);
      console.log('[admin-students] overview response:', overview);
      console.log('[admin-students] count source:', {
        subjects_assigned_count: overview.subjects_assigned_count,
        scheduled_lessons_count: overview.scheduled_lessons_count,
        completed_lessons_count: overview.completed_lessons_count,
        source: 'StudentLessonScheduleItem (same as GET /dashboard/my-week)',
      });
      setData(overview);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load student details';
      console.error('[admin-students] overview error:', e);
      setError(msg);
      setLoading(false);
      return;
    }

    const parentsUrl = `${API_BASE}/admin/students/${encodeURIComponent(id)}/parents`;
    const scheduleUrl = `${API_BASE}/admin/students/${encodeURIComponent(id)}/schedule`;
    const attendanceUrl = `${API_BASE}/admin/students/${encodeURIComponent(id)}/attendance`;
    console.log('[admin-students] parents URL:', parentsUrl);
    console.log('[admin-students] schedule URL:', scheduleUrl);
    console.log('[admin-students] attendance URL:', attendanceUrl);

    const [parentResult, scheduleResult, attendanceResult] = await Promise.allSettled([
      adminApi.students.parents(id),
      adminApi.students.schedule(id),
      adminApi.students.attendance(id),
    ]);

    if (parentResult.status === 'fulfilled') {
      console.log('[admin-students] parents response:', parentResult.value);
      setParents(parentResult.value);
    } else {
      const msg = parentResult.reason instanceof Error ? parentResult.reason.message : 'Failed to load parent info';
      console.error('[admin-students] parents error:', parentResult.reason);
      setParentsError(msg);
    }

    if (scheduleResult.status === 'fulfilled') {
      console.log('[admin-students] schedule response:', scheduleResult.value);
      setSchedule(scheduleResult.value);
    } else {
      const msg = scheduleResult.reason instanceof Error ? scheduleResult.reason.message : 'Failed to load schedule';
      console.error('[admin-students] schedule error:', scheduleResult.reason);
      setScheduleError(msg);
    }

    if (attendanceResult.status === 'fulfilled') {
      console.log('[admin-students] attendance response:', attendanceResult.value);
      setAttendance(attendanceResult.value);
    } else {
      const msg = attendanceResult.reason instanceof Error ? attendanceResult.reason.message : 'Failed to load attendance';
      console.error('[admin-students] attendance error:', attendanceResult.reason);
      setAttendanceError(msg);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runDeactivate() {
    if (!confirm('Deactivate this student? They will be hidden from the active student list and cannot log in. Progress records will be kept.')) {
      return;
    }
    setBusy('deactivate');
    try {
      await adminApi.students.deactivate(id);
      router.push('/admin/students');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed');
    } finally {
      setBusy('');
    }
  }

  const s = data?.student;

  return (
    <div className="page-enter" style={{ padding: 28 }}>
      <Link href="/admin/students" style={{ fontSize: 13, color: 'var(--g3)', display: 'inline-block', marginBottom: 20 }}>
        ← Back to Students
      </Link>

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'rgba(255,107,107,.3)', color: 'var(--coral)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="modal-spinner" style={{ margin: '40px auto' }} />
      ) : !s ? (
        <div className="card" style={{ padding: 24, borderRadius: 16, color: 'var(--g3)' }}>Student not found.</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
                {s.first_name} {s.last_name}
              </h1>
              <p style={{ color: 'var(--g3)', fontSize: 14, margin: 0 }}>
                {s.email} · Grade {s.grade_level ?? '—'} ·{' '}
                <span style={{ color: s.account_status === 'Active' ? 'var(--mint)' : 'var(--g5)' }}>{s.account_status}</span>
              </p>
              <p style={{ color: 'var(--g3)', fontSize: 12, marginTop: 6 }}>
                Joined {new Date(s.created_at).toLocaleDateString()}
                {s.last_login && ` · Last login ${new Date(s.last_login).toLocaleDateString()}`}
              </p>
            </div>
            {s.account_status === 'Active' && (
              <button type="button" className="btn btn-o btn-sm" disabled={!!busy} onClick={runDeactivate}>
                {busy === 'deactivate' ? 'Deactivating…' : 'Deactivate Student'}
              </button>
            )}
          </div>

          {data && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                [
                  'Subjects assigned',
                  data.subjects_assigned_count > 0
                    ? String(data.subjects_assigned_count)
                    : 'None',
                ],
                ['Scheduled lessons', scheduleSummaryLabel(data)],
                ['Completed lessons', String(data.completed_lessons_count ?? data.evaluations.completed_lessons ?? 0)],
                ['Attendance rate', `${data.attendance.attendance_rate}%`],
                [
                  'Avg quiz score',
                  data.evaluations.avg_overall_score != null ? String(data.evaluations.avg_overall_score) : '—',
                ],
              ].map(([label, val]) => (
                <div key={String(label)} className="card" style={{ padding: 18, borderRadius: 14 }}>
                  <div style={{ fontSize: 10, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Parent information</h2>
            <div className="card" style={{ padding: 20, borderRadius: 16 }}>
              {parentsError ? (
                <div style={{ color: 'var(--coral)', fontSize: 14 }}>{parentsError}</div>
              ) : parents?.available ? (
                <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--vl)' }}>
                  {parents.parent_name && <div><strong>Name:</strong> {parents.parent_name}</div>}
                  {parents.parent_email && <div><strong>Email:</strong> {parents.parent_email}</div>}
                  {parents.parent_phone && <div><strong>Phone:</strong> {parents.parent_phone}</div>}
                  {parents.relationship && <div><strong>Relationship:</strong> {parents.relationship}</div>}
                  <div style={{ color: 'var(--g3)', marginTop: 8 }}>
                    {parents.emergency_contact
                      ? <><strong>Emergency contact:</strong> {parents.emergency_contact}</>
                      : (parents.emergency_contact_note ?? 'Emergency contact not available.')}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--g3)', fontSize: 14 }}>
                  {parents?.message ?? 'Parent information not available.'}
                </div>
              )}
            </div>
          </section>

          <SessionTable title="Weekly schedule" sessions={schedule} studentId={id} showDate={false} loadError={scheduleError} />
          <SessionTable title="Attendance & lesson history" sessions={attendance} studentId={id} showDate loadError={attendanceError} />

          {data && data.progress.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Completed lessons & progress</h2>
              <div className="card" style={{ padding: 0, borderRadius: 16, overflow: 'hidden' }}>
                {data.progress.map((p) => (
                  <div
                    key={p.content_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 18px',
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      fontSize: 13,
                      gap: 12,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <span>{p.content_id}</span>
                    <span style={{ color: p.lesson_completed ? 'var(--mint)' : 'var(--g5)' }}>
                      {p.lesson_completed ? 'Completed' : 'In progress'}
                    </span>
                    <span>{p.overall_score != null ? `Score ${p.overall_score}` : ''}</span>
                    {p.completion_date && (
                      <span style={{ color: 'var(--g3)', fontSize: 12 }}>
                        {new Date(p.completion_date).toLocaleString()}
                      </span>
                    )}
                    <Link
                      href={`/admin/lessons/${encodeURIComponent(p.content_id)}?student=${encodeURIComponent(id)}`}
                      className="btn btn-o btn-sm"
                      style={{ textDecoration: 'none' }}
                    >
                      View lesson
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data && data.quiz_scores.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Quiz scores</h2>
              <div className="card" style={{ padding: 0, borderRadius: 16, overflow: 'hidden' }}>
                {data.quiz_scores.map((q) => (
                  <div
                    key={`${q.content_id}-${q.created_at}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 18px',
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      fontSize: 13,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span>{q.content_id}</span>
                    <span style={{ color: 'var(--g3)' }}>{q.subject_name}</span>
                    <span style={{ fontWeight: 700 }}>{q.overall_score ?? '—'}</span>
                    <span style={{ color: q.lesson_completed ? 'var(--mint)' : 'var(--g5)' }}>
                      {q.lesson_completed ? 'Done' : 'In progress'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
