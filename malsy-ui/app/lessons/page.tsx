'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, MySubjectRead, ContentUnit } from '../../lib/api';
import { learningConfig } from '../../lib/learning-config';
import {
  filterAppSubjects,
  getLockedMessage,
  getTodaySubjects,
  isSubjectUnlocked,
} from '../../lib/studentSchedule';

const SUBJ_META: Record<string, { icon: string; color: string; bg: string }> = {
  english: { icon: '📖', color: 'var(--sky)',   bg: 'linear-gradient(135deg,rgba(59,191,255,.12),rgba(91,33,245,.06))' },
  science: { icon: '🔬', color: 'var(--mint)',  bg: 'linear-gradient(135deg,rgba(0,229,160,.1),rgba(59,191,255,.08))' },
  history: { icon: '🏛️', color: 'var(--amber)', bg: 'linear-gradient(135deg,rgba(255,184,48,.1),rgba(200,130,0,.06))' },
};

const FALLBACK_SUBJECTS: MySubjectRead[] = [
  { subject_id: '1', subject_name: 'English', subject_code: 'ENG', enrolled_sessions_count: 12 },
  { subject_id: '2', subject_name: 'Science', subject_code: 'SCI', enrolled_sessions_count: 10 },
  { subject_id: '3', subject_name: 'History', subject_code: 'HIS', enrolled_sessions_count: 9  },
];

function subjMeta(name: string) {
  const key = name.toLowerCase().split(' ')[0];
  return SUBJ_META[key] ?? { icon: '📖', color: 'var(--vl)', bg: 'rgba(91,33,245,.12)' };
}

interface Chapter { id: string; title: string; desc: string }

const DEFAULT_CHAPTERS: Record<string, Chapter[]> = {
  english: [
    { id: 'english:unit_01', title: 'Reading & Comprehension', desc: 'Passages · vocabulary · inference' },
    { id: 'english:unit_02', title: 'Grammar & Writing',       desc: 'Sentences · punctuation · essays' },
    { id: 'english:unit_03', title: 'Listening & Speaking',    desc: 'Pronunciation · expression' },
    { id: 'english:unit_04', title: 'Literature & Poetry',     desc: 'Analysis · themes · devices' },
    { id: 'english:unit_05', title: 'Revision & Assessment',   desc: 'Review all topics' },
  ],
  science: [
    { id: 'science:unit_01', title: 'Living Organisms',        desc: 'Cells · biology · ecosystems' },
    { id: 'science:unit_02', title: 'Matter & Materials',      desc: 'States · properties · changes' },
    { id: 'science:unit_03', title: 'Forces & Energy',         desc: 'Motion · work · power' },
    { id: 'science:unit_04', title: 'Earth & Space',           desc: 'Geography · atmosphere · universe' },
    { id: 'science:unit_05', title: 'Experiments & Methods',   desc: 'Scientific reasoning · lab skills' },
  ],
  history: [
    { id: 'history:unit_01', title: 'Ancient Civilisations',   desc: 'Egypt · Greece · Rome' },
    { id: 'history:unit_02', title: 'The Middle Ages',         desc: 'Medieval Europe · trade routes' },
    { id: 'history:unit_03', title: 'The Modern World',        desc: 'Industrial Revolution · empires' },
    { id: 'history:unit_04', title: 'World Wars',              desc: 'WW1 · WW2 · causes & effects' },
    { id: 'history:unit_05', title: 'Contemporary History',    desc: 'Post-1945 · politics · today' },
  ],
};

// ── Jassmine avatar (used in bottom banner) ───────────────────────

function JassmineAvatar({ size = 56 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#3D1FA8,#5B21F5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid rgba(255,255,255,.1)', flexShrink: 0 }}>
      <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 220 220" fill="none">
        <path d="M58 210 Q54 175 62 158 Q72 140 110 136 Q148 140 158 158 Q166 175 162 210Z" fill="#3D1FA8" />
        <rect x="100" y="126" width="20" height="18" rx="6" fill="#F4C5A0" />
        <ellipse cx="110" cy="102" rx="36" ry="38" fill="#F4C5A0" />
        <path d="M74 88 Q72 60 84 50 Q94 40 110 38 Q126 40 136 50 Q148 60 146 88 Q142 70 136 64 Q128 55 110 54 Q92 55 84 64 Q78 70 74 88Z" fill="#1A0A3C" />
        <ellipse cx="97" cy="95" rx="8" ry="7" fill="white" /><ellipse cx="123" cy="95" rx="8" ry="7" fill="white" />
        <circle cx="97" cy="95" r="4.5" fill="#5B21F5" /><circle cx="123" cy="95" r="4.5" fill="#5B21F5" />
        <circle cx="97" cy="95" r="2.2" fill="#1A0A3C" /><circle cx="123" cy="95" r="2.2" fill="#1A0A3C" />
        <path d="M100 114 Q110 122 120 114" stroke="#D4845A" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="74" cy="100" rx="6" ry="9" fill="#F4C5A0" /><ellipse cx="146" cy="100" rx="6" ry="9" fill="#F4C5A0" />
      </svg>
    </div>
  );
}

// ── Chapter-picker modal ──────────────────────────────────────────

function LessonModal({ subject, units, onClose }: { subject: MySubjectRead; units: ContentUnit[]; onClose: () => void }) {
  const router = useRouter();
  const meta = subjMeta(subject.subject_name);
  const subjectKey = subject.subject_name.toLowerCase().split(' ')[0];

  const relevantUnits = units.filter(u =>
    u.book_id?.toLowerCase().includes(subjectKey) ||
    u.title?.toLowerCase().includes(subjectKey) ||
    u.subject?.toLowerCase().includes(subjectKey)
  );
  const chapterList: Chapter[] = relevantUnits.length > 0
    ? relevantUnits.map((u, i) => ({ id: u.unit_id, title: u.title ?? `Unit ${i + 1}`, desc: '' }))
    : (DEFAULT_CHAPTERS[subjectKey] ?? [{ id: subject.subject_code.toLowerCase(), title: subject.subject_name, desc: '' }]);

  const [chapterId, setChapterId] = useState(chapterList[0]?.id ?? '');

  function startLesson() {
    onClose();
    router.push('/lessons/learn?chapter=' + encodeURIComponent(chapterId));
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 580 }}>

        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {meta.icon}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 15 }}>{subject.subject_name}</div>
              <div style={{ fontSize: 11, color: 'var(--g3)' }}>AI-guided lesson with Jassmine</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* What to expect */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24 }}>
            {[
              { icon: '📚', label: 'Reading & Vocab' },
              { icon: '✏️', label: 'Grammar & Writing' },
              { icon: '🎧', label: 'Listening & Speaking' },
              { icon: '❓', label: 'Quiz & Feedback' },
            ].map(item => (
              <div key={item.label} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 5 }}>{item.icon}</div>
                <div style={{ fontSize: 9, color: 'var(--g3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', lineHeight: 1.4 }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Chapter cards */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--g3)', marginBottom: 10 }}>
              Choose a chapter
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {chapterList.map((ch, idx) => {
                const sel = chapterId === ch.id;
                return (
                  <button key={ch.id} onClick={() => setChapterId(ch.id)} style={{
                    padding: '11px 13px', borderRadius: 12, textAlign: 'left', outline: 'none', cursor: 'pointer',
                    border: `1px solid ${sel ? 'rgba(91,33,245,.5)' : 'rgba(255,255,255,.07)'}`,
                    background: sel ? 'rgba(91,33,245,.18)' : 'rgba(255,255,255,.03)',
                    transition: 'all .15s',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: sel ? 'var(--vl)' : 'var(--g5)', marginBottom: 4 }}>
                      Chapter {idx + 1}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--w)', lineHeight: 1.35 }}>{ch.title}</div>
                    {ch.desc && <div style={{ fontSize: 10, color: 'var(--g4)', marginTop: 3, lineHeight: 1.4 }}>{ch.desc}</div>}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: 'var(--g5)', marginTop: 8 }}>Each chapter has 2 parts. Your progress is saved automatically.</div>
          </div>

          <button className="auth-submit" onClick={startLesson} disabled={!chapterId}>
            Start Lesson with Jassmine →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hub page ──────────────────────────────────────────────────────

export default function LessonsPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<MySubjectRead[]>([]);
  const [units,    setUnits]    = useState<ContentUnit[]>([]);
  const [activeSubject, setActiveSubject] = useState<MySubjectRead | null>(null);
  const [loading, setLoading]   = useState(true);
  const [filter,  setFilter]    = useState('All');

  useEffect(() => {
    Promise.all([
      api.dashboard.subjects().catch(() => []),
      api.units.list().catch(() => ({ units: [] })),
    ]).then(([s, u]) => {
      const filtered = Array.isArray(s) ? filterAppSubjects(s) : [];
      setSubjects(filtered.length ? filtered : FALLBACK_SUBJECTS);
      setUnits(u?.units ?? []);
    }).finally(() => setLoading(false));
  }, []);

  function openSubject(s: MySubjectRead) {
    if (!isSubjectUnlocked(s.subject_name)) {
      alert(getLockedMessage());
      return;
    }
    const key = s.subject_name.toLowerCase().split(' ')[0];
    if (learningConfig[key]) {
      router.push(`/lessons/subject/${key}`);
    } else {
      setActiveSubject(s);
    }
  }

  const filters = ['All', ...FALLBACK_SUBJECTS.map(s => s.subject_name)];
  const visible = filter === 'All' ? subjects : subjects.filter(s => s.subject_name === filter);

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="card-title" style={{ fontSize: 18 }}>All Lessons</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 3 }}>
            {loading ? 'Loading…' : `Today: ${getTodaySubjects().join(' · ')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button key={f} className="btn btn-o btn-sm"
              style={filter === f ? { background: 'rgba(91,33,245,.15)', color: 'var(--vl)', borderColor: 'rgba(91,33,245,.3)' } : {}}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      <div className="lesson-grid">
        {visible.map(s => {
          const m = subjMeta(s.subject_name);
          const unlocked = isSubjectUnlocked(s.subject_name);
          return (
            <div
              key={s.subject_id}
              className={`lesson-card${unlocked ? '' : ' locked'}`}
              onClick={() => unlocked ? openSubject(s) : alert(getLockedMessage())}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  unlocked ? openSubject(s) : alert(getLockedMessage());
                }
              }}
            >
              <div className="lc-thumb" style={{ background: m.bg }}>{m.icon}</div>
              <div className="lc-body">
                <div className="lc-subject" style={{ color: m.color }}>{s.subject_name}</div>
                <div className="lc-title">{s.enrolled_sessions_count} sessions enrolled</div>
                {!unlocked && (
                  <div className="subject-lock-msg">{getLockedMessage()}</div>
                )}
                <div className="lc-meta">
                  <span className="lc-time">AI-guided · Jassmine</span>
                  {unlocked ? (
                    <span className="pill pill-s">▶ Start</span>
                  ) : (
                    <span className="lock-badge">🔒 Locked</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 24, background: 'linear-gradient(135deg,var(--navym),#130d40)', marginTop: 24 }}>
        <div style={{ background: 'linear-gradient(135deg,var(--navys),#1a1060)', borderRadius: 16, width: 88, height: 88, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <JassmineAvatar size={72} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ fontSize: 16 }}>AI Tutor — Jassmine</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', margin: '4px 0 12px' }}>
            Jassmine reads the textbook with you, explains every topic — vocabulary, grammar, reading passages, and exercises — then quizzes you with hints and re-explanations if you need them.
          </div>
        </div>
        {subjects.find(s => isSubjectUnlocked(s.subject_name)) && (
          <button
            className="btn btn-v"
            onClick={() => {
              const first = subjects.find(s => isSubjectUnlocked(s.subject_name));
              if (first) openSubject(first);
            }}
          >
            ▶ Start Now
          </button>
        )}
      </div>

      {activeSubject && <LessonModal subject={activeSubject} units={units} onClose={() => setActiveSubject(null)} />}
    </div>
  );
}
