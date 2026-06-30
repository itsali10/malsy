'use client';

import { useEffect, useState } from 'react';
import ProgressBar from '../../components/ui/ProgressBar';
import { auth } from '../../lib/auth';
import type { UserRead } from '../../lib/api';
import { getStreak } from '../../lib/streak';

const badges = [
  { icon: '🧬', label: 'Bio Master', bg: 'linear-gradient(135deg,#5B21F5,#8B55FF)', col: 'var(--vl)', locked: false },
  { icon: '🔥', label: 'Streak 18',  bg: 'linear-gradient(135deg,#00B87E,#00E5A0)', col: 'var(--mint)', locked: false },
  { icon: '⭐', label: 'Star Quiz',  bg: 'linear-gradient(135deg,#D4A017,#FFB830)', col: 'var(--amber)', locked: false },
  { icon: '📖', label: 'Bookworm',   bg: 'linear-gradient(135deg,#0A6090,#3BBFFF)', col: 'var(--sky)', locked: false },
  { icon: '🚀', label: 'Launch Week', locked: true },
  { icon: '🏅', label: 'Monthly Top', locked: true },
];

export default function ProfilePage() {
  const [user, setUser] = useState<UserRead | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const u = auth.getUser();
    setUser(u);
    setStreak(getStreak(u?.user_id));
  }, []);

  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : '??';
  const fullName = user ? `${user.first_name} ${user.last_name}` : '—';
  const gradeLabel = user?.grade_level
    ? `Grade ${user.grade_level}`
    : user?.role ?? '';

  return (
    <div className="page-enter">
      {/* Hero */}
      <div className="profile-hero">
        <div className="prof-top">
          <div className="prof-av">{initials}</div>
          <div>
            <div className="prof-name">{fullName}</div>
            <div className="prof-class">{gradeLabel}</div>
            {user?.email && (
              <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 2 }}>{user.email}</div>
            )}
            <div className="prof-xp">⭐ Level 7 · 1,240 XP · 260 XP to Level 8</div>
            <div style={{ marginTop: 8 }}>
              <div className="pbar-wrap" style={{ width: 200 }}>
                <div className="pbar" style={{ width: '48%', background: 'var(--amber)' }} />
              </div>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn btn-o btn-sm">Edit Profile</button>
            <button className="btn btn-v btn-sm">Share Profile</button>
          </div>
        </div>

        <div className="prof-stats">
          <div className="ps-item"><div className="ps-n" style={{ color: 'var(--vl)' }}>12</div><div className="ps-l">Lessons Done</div></div>
          <div className="ps-item"><div className="ps-n" style={{ color: 'var(--mint)' }}>94%</div><div className="ps-l">Quiz Average</div></div>
          <div className="ps-item"><div className="ps-n" style={{ color: 'var(--amber)' }}>🔥 {streak}</div><div className="ps-l">Day Streak</div></div>
          <div className="ps-item"><div className="ps-n" style={{ color: 'var(--sky)' }}>#4</div><div className="ps-l">Class Rank</div></div>
        </div>
      </div>

      <div className="g2">
        {/* Performance */}
        <div className="card">
          <div className="card-title">Performance Scores</div>
          <div className="card-sub">This semester average</div>
          {[
            { label: 'Grammar',       pct: 88, col: 'var(--vl)' },
            { label: 'Comprehension', pct: 76, col: 'var(--mint)' },
            { label: 'Pronunciation', pct: 91, col: 'var(--sky)' },
            { label: 'Vocabulary',    pct: 82, col: 'var(--amber)' },
          ].map(p => (
            <div key={p.label} className="perf-item">
              <div className="perf-lbl">{p.label}</div>
              <ProgressBar value={p.pct} color={p.col} />
              <div className="perf-pct" style={{ color: p.col }}>{p.pct}%</div>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div className="card">
          <div className="card-title">Badges Earned</div>
          <div className="card-sub">6 of 18 unlocked</div>
          <div className="badge-shelf">
            {badges.map(b => (
              <div key={b.label} className={`badge-item${b.locked ? ' badge-locked' : ''}`}>
                <div className="badge-ico" style={!b.locked ? { background: b.bg } : {}}>{b.icon}</div>
                <div className="badge-lbl" style={!b.locked ? { color: b.col } : {}}>{b.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
