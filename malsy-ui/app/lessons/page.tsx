'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import {
  usePortalSubjects,
  routeForPortalSubject,
  type PortalSubject,
} from '../../lib/studentPortalSubjects';
import { getSubjectMeta } from '../../lib/studentSchedule';

const SUBJ_META: Record<string, { icon: string; color: string; bg: string }> = {
  english: { icon: '📖', color: 'var(--sky)',   bg: 'linear-gradient(135deg,rgba(59,191,255,.12),rgba(91,33,245,.06))' },
  science: { icon: '🔬', color: 'var(--mint)',  bg: 'linear-gradient(135deg,rgba(0,229,160,.1),rgba(59,191,255,.08))' },
  history: { icon: '🏛️', color: 'var(--amber)', bg: 'linear-gradient(135deg,rgba(255,184,48,.1),rgba(200,130,0,.06))' },
};

function subjMeta(name: string, subjects: PortalSubject[]) {
  const fromPortal = getSubjectMeta(name, subjects);
  const key = name.toLowerCase().split(' ')[0];
  const fallback = SUBJ_META[key];
  if (fromPortal.icon !== '📖' || fallback) {
    return { icon: fromPortal.icon, color: fallback?.color ?? fromPortal.color, bg: fallback?.bg ?? fromPortal.bg };
  }
  return fromPortal;
}

interface Chapter { id: string; title: string; desc: string }

// ── Chapter-picker modal ──────────────────────────────────────────

function LessonModal({ subject, onClose }: { subject: PortalSubject; onClose: () => void }) {
  const router = useRouter();
  const meta = subjMeta(subject.subject_name, [subject]);
  const [chapterList, setChapterList] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [chapterId, setChapterId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const bookId = subject.primary_book_id;
    if (!bookId) {
      setChapterList([]);
      setChaptersLoading(false);
      return;
    }
    setChaptersLoading(true);
    api.books
      .lessons(bookId)
      .then((data) => {
        if (cancelled) return;
        const chapters = (data.lessons ?? []).map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          desc: lesson.shortDescription || '',
        }));
        setChapterList(chapters);
        setChapterId(chapters[0]?.id ?? '');
      })
      .catch(() => {
        if (!cancelled) {
          setChapterList([]);
          setChapterId('');
        }
      })
      .finally(() => {
        if (!cancelled) setChaptersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subject.primary_book_id, subject.subject_key]);

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
              {chaptersLoading ? (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--g3)', padding: 8 }}>Loading lessons…</div>
              ) : chapterList.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--g3)', padding: 8 }}>
                  No published lessons yet for this subject.
                </div>
              ) : null}
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
  const { subjects, loading } = usePortalSubjects();
  const [activeSubject, setActiveSubject] = useState<PortalSubject | null>(null);
  const [filter, setFilter] = useState('All');

  function openSubject(s: PortalSubject) {
    if (s.route) {
      router.push(routeForPortalSubject(s));
      return;
    }
    setActiveSubject(s);
  }

  const todaySubjectNames = subjects.filter((s) => s.scheduled_today).map((s) => s.subject_name);
  const filters = ['All', ...todaySubjectNames];
  const visible =
    filter === 'All'
      ? subjects
      : subjects.filter((s) => s.subject_name === filter);

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="card-title" style={{ fontSize: 18 }}>All Lessons</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 3 }}>
            {loading
              ? 'Loading…'
              : subjects.length
                ? `Today: ${todaySubjectNames.length ? todaySubjectNames.join(' · ') : 'no lessons scheduled'}`
                : 'No published subjects yet'}
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
        {!loading && visible.length === 0 && (
          <div className="card" style={{ padding: 24, color: 'var(--g3)', fontSize: 14, lineHeight: 1.6 }}>
            No subjects are published for your account yet. Check back after your teacher publishes lesson content.
          </div>
        )}
        {visible.map((s) => {
          const m = subjMeta(s.subject_name, subjects);
          return (
            <div
              key={s.subject_id}
              className="lesson-card"
              onClick={() => openSubject(s)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openSubject(s);
                }
              }}
            >
              <div className="lc-thumb" style={{ background: m.bg }}>{m.icon}</div>
              <div className="lc-body">
                <div className="lc-subject" style={{ color: m.color }}>{s.subject_name}</div>
                <div className="lc-title">
                  {(s.available_lessons_count ?? s.enrolled_sessions_count ?? 0) > 0
                    ? `${s.available_lessons_count ?? s.enrolled_sessions_count} lessons available`
                    : 'Lessons available'}
                </div>
                <div className="lc-meta">
                  <span className="lc-time">AI-guided · Jassmine</span>
                  <span className="pill pill-s">▶ Start</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activeSubject ? (
        <LessonModal subject={activeSubject} onClose={() => setActiveSubject(null)} />
      ) : null}
    </div>
  );
}
