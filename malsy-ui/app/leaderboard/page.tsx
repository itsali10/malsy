'use client';
import { useState } from 'react';

const filters = ['This Week', 'This Month', 'All Time'];

const rows = [
  { rank: 4,  me: false, initials: 'SA', bg: 'var(--v)',    name: 'Sara Ahmed',     badge: '🧬 Bio Master',  lessons: 12, quiz: '94%', streak: '🔥18', xp: '1,240' },
  { rank: 4,  me: true,  initials: 'SA', bg: 'var(--v)',    name: 'Sara Ahmed',     badge: '🧬 Bio Master',  lessons: 12, quiz: '94%', streak: '🔥18', xp: '1,240' },
  { rank: 5,  me: false, initials: 'NA', bg: '#00B87E',     name: 'Nada Amin',      badge: '⚡ Fast Learner', lessons: 10, quiz: '88%', streak: '🔥9',  xp: '990' },
  { rank: 6,  me: false, initials: 'OT', bg: '#FF6B6B',     name: 'Omar Tarek',     badge: '🎯 Quiz Pro',    lessons: 9,  quiz: '82%', streak: '🔥6',  xp: '870' },
];

export default function LeaderboardPage() {
  const [active, setActive] = useState(0);

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="card-title" style={{ fontSize: 18 }}>Class Leaderboard</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 3 }}>Class 9-A · Week of June 2</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {filters.map((f, i) => (
            <button key={f} className="btn btn-o btn-sm"
              style={i === active ? { background: 'rgba(91,33,245,.15)', color: 'var(--vl)' } : {}}
              onClick={() => setActive(i)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Podium */}
      <div className="lb-podium">
        {/* 2nd */}
        <div className="podium-card podium-2" style={{ height: 180 }}>
          <div className="podium-avatar" style={{ background: '#3BBFFF', color: 'white', fontSize: 14 }}>MH</div>
          <div className="podium-name">Mohamed Hassan</div>
          <div className="podium-score" style={{ color: 'var(--sky)' }}>1,180</div>
          <div className="podium-xplbl">XP · 🥈 2nd</div>
        </div>
        {/* 1st */}
        <div className="podium-card podium-1" style={{ height: 210 }}>
          <div className="podium-crown">👑</div>
          <div className="podium-avatar" style={{ background: 'linear-gradient(135deg,#FFB830,#E8A020)', color: 'var(--navy)', fontSize: 14 }}>KA</div>
          <div className="podium-name">Karim Ali</div>
          <div className="podium-score" style={{ color: 'var(--amber)' }}>1,420</div>
          <div className="podium-xplbl">XP · 🥇 1st</div>
        </div>
        {/* 3rd */}
        <div className="podium-card podium-3" style={{ height: 160 }}>
          <div className="podium-avatar" style={{ background: '#FF6B6B', color: 'white', fontSize: 14 }}>LM</div>
          <div className="podium-name">Layla Mostafa</div>
          <div className="podium-score" style={{ color: 'var(--coral)' }}>1,020</div>
          <div className="podium-xplbl">XP · 🥉 3rd</div>
        </div>
      </div>

      {/* Table header */}
      <div className="lb-row" style={{ background: 'rgba(255,255,255,.04)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--g5)', cursor: 'default' }}>
        <div style={{ textAlign: 'center' }}>Rank</div>
        <div>Student</div>
        <div style={{ textAlign: 'center' }}>Lessons</div>
        <div style={{ textAlign: 'center' }}>Quiz Avg</div>
        <div style={{ textAlign: 'center' }}>Streak</div>
        <div style={{ textAlign: 'right' }}>XP</div>
      </div>

      {rows.map((r, i) => (
        <div key={i} className={`lb-row${r.me ? ' me' : ''}`}>
          <div className="lb-num" style={r.me ? { color: 'var(--vl)' } : {}}>{r.rank}</div>
          <div className="lb-user">
            <div className="lb-av" style={{ background: r.bg, border: r.me ? '2px solid var(--mint)' : undefined }}>
              {r.initials}
            </div>
            <div>
              <div className="lb-uname" style={r.me ? { color: 'var(--mint)' } : {}}>
                {r.name}{r.me && <span style={{ fontSize: 9 }}> (You)</span>}
              </div>
              <div className="lb-usub">{r.badge}</div>
            </div>
          </div>
          <div className="lb-num-val" style={{ color: r.me ? 'var(--mint)' : undefined }}>{r.lessons}</div>
          <div className="lb-num-val" style={{ color: r.me ? 'var(--mint)' : undefined }}>{r.quiz}</div>
          <div className="lb-num-val" style={{ color: 'var(--amber)' }}>{r.streak}</div>
          <div className="lb-xp">{r.xp}</div>
        </div>
      ))}
    </div>
  );
}
