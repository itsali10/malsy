'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProgressBar from '../components/ui/ProgressBar';
import StatCard from '../components/ui/StatCard';
import { api, UserRead, MySubjectRead, LessonEvaluationRead } from '../lib/api';
import { auth } from '../lib/auth';

const SUBJ_META: Record<string, { icon: string; color: string; bg: string }> = {
  biology:     { icon: '🧬', color: 'var(--mint)',  bg: 'rgba(0,229,160,.15)' },
  chemistry:   { icon: '⚗️', color: 'var(--vl)',   bg: 'rgba(91,33,245,.15)' },
  mathematics: { icon: '🧮', color: 'var(--sky)',   bg: 'rgba(59,191,255,.12)' },
  math:        { icon: '🧮', color: 'var(--sky)',   bg: 'rgba(59,191,255,.12)' },
  arabic:      { icon: '📚', color: 'var(--amber)', bg: 'rgba(255,184,48,.12)' },
  physics:     { icon: '🔭', color: 'var(--amber)', bg: 'rgba(255,184,48,.12)' },
  science:     { icon: '🌍', color: 'var(--mint)',  bg: 'rgba(0,229,160,.10)' },
  english:     { icon: '📖', color: 'var(--sky)',   bg: 'rgba(59,191,255,.12)' },
};

function subjMeta(name: string) {
  const key = name.toLowerCase().split(' ')[0];
  return SUBJ_META[key] ?? { icon: '📖', color: 'var(--vl)', bg: 'rgba(91,33,245,.12)' };
}

function avg(arr: (number | undefined)[]): number {
  const vals = arr.filter((v): v is number => v !== undefined && v > 0);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

// Fallback hardcoded subjects when API returns empty
const FALLBACK_SUBJECTS = [
  { subject_id: '1', subject_name: 'Biology',          subject_code: 'BIO', enrolled_sessions_count: 12 },
  { subject_id: '2', subject_name: 'Mathematics',      subject_code: 'MAT', enrolled_sessions_count: 10 },
  { subject_id: '3', subject_name: 'Arabic Language',  subject_code: 'ARA', enrolled_sessions_count: 8  },
  { subject_id: '4', subject_name: 'Chemistry',        subject_code: 'CHE', enrolled_sessions_count: 9  },
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
      setSubjects(Array.isArray(s) && s.length ? s : FALLBACK_SUBJECTS);
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
    <div className="page-enter">
      {/* ── Hero ── */}
      <div className="dash-hero">
        <div style={{ maxWidth: '65%', position: 'relative', zIndex: 2 }}>
          <div className="dash-greeting">Welcome back, <span>{firstName}!</span></div>
          <div className="dash-tagline">
            {loading
              ? 'Loading your progress…'
              : completed > 0
                ? `${completed} lesson${completed > 1 ? 's' : ''} completed — keep it up!`
                : 'Ready to start your first lesson? Let\'s go!'}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link href="/lessons"><button className="btn btn-v">▶ Continue Lesson</button></Link>
            <Link href="/schedule"><button className="btn btn-o">View Schedule</button></Link>
          </div>
        </div>

        {/* Jassmine AI avatar */}
        <div className="jassmine-wrap">
          <svg width="220" height="210" viewBox="0 0 220 210" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="110" cy="190" rx="58" ry="12" fill="rgba(91,33,245,0.25)" />
            <path d="M58 210 Q54 175 62 158 Q72 140 110 136 Q148 140 158 158 Q166 175 162 210Z" fill="#3D1FA8" />
            <rect x="88" y="172" width="44" height="22" rx="11" fill="rgba(255,255,255,0.08)" />
            <rect x="100" y="126" width="20" height="18" rx="6" fill="#F4C5A0" />
            <ellipse cx="110" cy="102" rx="36" ry="38" fill="#F4C5A0" />
            <path d="M74 88 Q72 60 84 50 Q94 40 110 38 Q126 40 136 50 Q148 60 146 88 Q142 70 136 64 Q128 55 110 54 Q92 55 84 64 Q78 70 74 88Z" fill="#1A0A3C" />
            <path d="M90 84 Q97 80 104 83" stroke="#3D1FA8" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M116 83 Q123 80 130 84" stroke="#3D1FA8" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <ellipse cx="97" cy="95" rx="8" ry="7" fill="white" />
            <ellipse cx="123" cy="95" rx="8" ry="7" fill="white" />
            <circle cx="97" cy="95" r="4.5" fill="#5B21F5" />
            <circle cx="123" cy="95" r="4.5" fill="#5B21F5" />
            <circle cx="97" cy="95" r="2.2" fill="#1A0A3C" />
            <circle cx="123" cy="95" r="2.2" fill="#1A0A3C" />
            <circle cx="99" cy="93" r="1.2" fill="white" opacity="0.9" />
            <circle cx="125" cy="93" r="1.2" fill="white" opacity="0.9" />
            <path d="M100 114 Q110 122 120 114" stroke="#D4845A" strokeWidth="2" fill="none" strokeLinecap="round" />
            <ellipse cx="74" cy="100" rx="6" ry="9" fill="#F4C5A0" />
            <ellipse cx="146" cy="100" rx="6" ry="9" fill="#F4C5A0" />
            <circle cx="74" cy="104" r="3" fill="#00E5A0" />
            <circle cx="146" cy="104" r="3" fill="#00E5A0" />
            <g transform="translate(0,8)">
              <rect x="6" y="32" width="112" height="32" rx="10" fill="#5B21F5" opacity="0.92" />
              <polygon points="70,64 58,74 82,64" fill="#5B21F5" opacity="0.92" />
              <text x="62" y="50" textAnchor="middle" fill="white" fontFamily="Syne,sans-serif" fontSize="10" fontWeight="700">
                Hey {firstName}! Ready? 👋
              </text>
            </g>
          </svg>
          <div className="jassmine-name">Jassmine · Your AI Tutor</div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-row">
        <StatCard value={String(completed || 0)}        label="Lessons Done"   color="var(--vl)" />
        <StatCard value={quizAvg ? `${quizAvg}%` : '—'} label="Quiz Average"   color="var(--mint)" />
        <StatCard value="0"                              label="Total XP"       color="var(--amber)" />
        <StatCard value="—"                              label="Class Standing" color="var(--sky)" />
      </div>

      {/* ── Main grid ── */}
      <div className="g-left">
        {/* Subject cards */}
        <div>
          <div className="card-title" style={{ marginBottom: 14 }}>Continue Learning</div>
          {subjects.slice(0, 4).map(s => {
            const m = subjMeta(s.subject_name);
            return (
              <Link key={s.subject_id} href="/lessons">
                <div className="subject-card">
                  <div className="subj-ico" style={{ background: m.bg }}>{m.icon}</div>
                  <div className="subj-body">
                    <div className="subj-name">{s.subject_name}</div>
                    <div className="subj-meta">{s.enrolled_sessions_count} sessions enrolled</div>
                    <div style={{ marginTop: 6 }}><ProgressBar value={0} color={m.color} /></div>
                  </div>
                  <div className="subj-pct" style={{ color: m.color }}>—</div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Performance */}
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

          {/* Account card */}
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
