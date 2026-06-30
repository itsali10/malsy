'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProgressBar from '../components/ui/ProgressBar';
import StatCard from '../components/ui/StatCard';
import AvatarWidget from '../components/AvatarWidget';
import SubjectCard from '../components/SubjectCard';
import { api, UserRead, MySubjectRead, LessonEvaluationRead } from '../lib/api';
import { auth } from '../lib/auth';
import { filterAppSubjects } from '../lib/studentSchedule';

const SUBJ_META: Record<string, { icon: string; color: string; bg: string }> = {
  english: { icon: '📖', color: 'var(--sky)',   bg: 'rgba(59,191,255,.12)' },
  science: { icon: '🔬', color: 'var(--mint)',  bg: 'rgba(0,229,160,.10)'  },
  history: { icon: '🏛️', color: 'var(--amber)', bg: 'rgba(255,184,48,.12)' },
};

function subjMeta(name: string) {
  const key = name.toLowerCase().split(' ')[0];
  return SUBJ_META[key] ?? { icon: '📖', color: 'var(--vl)', bg: 'rgba(91,33,245,.12)' };
}

function avg(arr: (number | undefined)[]): number {
  const vals = arr.filter((v): v is number => v !== undefined && v > 0);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

const FALLBACK_SUBJECTS: MySubjectRead[] = [
  { subject_id: '1', subject_name: 'English', subject_code: 'ENG', enrolled_sessions_count: 12 },
  { subject_id: '2', subject_name: 'Science', subject_code: 'SCI', enrolled_sessions_count: 10 },
  { subject_id: '3', subject_name: 'History', subject_code: 'HIS', enrolled_sessions_count: 9  },
];

export default function DashboardPage() {
  const [user, setUser]       = useState<UserRead | null>(auth.getUser());
  const [subjects, setSubjects] = useState<MySubjectRead[]>([]);
  const [evals, setEvals]     = useState<LessonEvaluationRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.auth.me().catch(() => null),
      api.dashboard.subjects().catch(() => []),
      api.evaluations.mine().catch(() => []),
    ]).then(([u, s, e]) => {
      if (u) { setUser(u); auth.setUser(u); }
      const filtered = Array.isArray(s) ? filterAppSubjects(s) : [];
      setSubjects(filtered.length ? filtered : FALLBACK_SUBJECTS);
      setEvals(Array.isArray(e) ? e : []);
    }).finally(() => setLoading(false));
  }, []);

  const firstName = user?.first_name ?? 'there';
  const initials  = user ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : 'SA';

  const completed = evals.filter(e => e.lesson_completed).length;
  const grammar   = avg(evals.map(e => e.grammar_score));
  const comprehension = avg(evals.map(e => e.comprehension_score));
  const pronunciation = avg(evals.map(e => e.pronunciation_score));
  const overallAvg = avg(evals.map(e => e.overall_score));
  const quizAvg = overallAvg || (grammar || comprehension || pronunciation
    ? avg([grammar, comprehension, pronunciation])
    : 0);

  return (
    <div className="page-enter dashboard-page">
      {/* ── Welcome banner with embedded avatar ── */}
      <div className="welcome-banner">
        <div className="welcome-content">
          <div className="dash-greeting">Welcome back, <span>{firstName}!</span></div>
          <div className="dash-tagline">
            {loading
              ? 'Loading your progress…'
              : completed > 0
                ? `${completed} lesson${completed > 1 ? 's' : ''} completed — keep it up!`
                : 'Ready to start your first lesson? Let\'s go!'}
          </div>
          <div className="welcome-actions">
            <Link href="/lessons"><button className="btn btn-v">▶ Continue Lesson</button></Link>
            <Link href="/schedule"><button className="btn btn-o">View Schedule</button></Link>
          </div>
        </div>
        <div className="welcome-teacher-stage">
          <div className="avatar-wrapper">
            <AvatarWidget variant="dashboard" />
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-row dashboard-stat-row">
        <StatCard value={String(completed || 0)}        label="Lessons Done"   color="var(--vl)" />
        <StatCard value={quizAvg ? `${quizAvg}%` : '—'} label="Quiz Average"   color="var(--mint)" />
        <StatCard value="0"                              label="Total XP"       color="var(--amber)" />
        <StatCard value="—"                              label="Class Standing" color="var(--sky)" />
      </div>

      {/* ── Main grid ── */}
      <div className="dashboard-grid">
        {/* Left: Continue Learning */}
        <div className="dashboard-grid__left">
          <div className="card-title" style={{ marginBottom: 14 }}>Continue Learning</div>
          {subjects.map(s => {
            const m = subjMeta(s.subject_name);
            return (
              <SubjectCard
                key={s.subject_id}
                subjectId={s.subject_id}
                subjectName={s.subject_name}
                sessionsCount={s.enrolled_sessions_count}
                icon={m.icon}
                color={m.color}
                bg={m.bg}
              />
            );
          })}
        </div>

        {/* Right: Performance + Account */}
        <div className="dashboard-grid__right">
          <div className="card">
            <div className="card-title">Performance</div>
            <div className="card-sub">
              {evals.length ? 'Your evaluation averages' : 'No evaluations yet'}
            </div>
            {[
              { label: 'Grammar',       value: grammar,       color: 'var(--vl)' },
              { label: 'Comprehension', value: comprehension, color: 'var(--mint)' },
              { label: 'Pronunciation', value: pronunciation, color: 'var(--sky)' },
            ].map(p => (
              <div key={p.label} className="perf-item">
                <div className="perf-lbl">{p.label}</div>
                <ProgressBar value={p.value} color={p.color} />
                <div className="perf-pct" style={{ color: p.color }}>
                  {p.value ? `${p.value}%` : '—'}
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">👤 Your Account</div>
            <div className="card-sub">Logged in as</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', background: 'var(--v)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 16, flexShrink: 0,
              }}>
                {initials}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 14 }}>
                  {user ? `${user.first_name} ${user.last_name}` : '…'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--g3)', marginTop: 2 }}>{user?.email ?? ''}</div>
                {user?.grade_level && (
                  <div style={{ fontSize: 11, color: 'var(--vl)', marginTop: 2 }}>Grade {user.grade_level}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
