'use client';

import { useEffect, useState, useRef } from 'react';
import {
  api,
  MySubjectRead,
  ContentUnit,
  SessionStartResponse,
  SessionAnswerResponse,
  Quiz,
} from '../../lib/api';
import { auth } from '../../lib/auth';

// ── Subject display helpers ──────────────────────────────────────

const SUBJ_META: Record<string, { icon: string; color: string; bg: string }> = {
  biology:     { icon: '🧬', color: 'var(--mint)',  bg: 'linear-gradient(135deg,rgba(0,229,160,.15),rgba(0,184,126,.08))' },
  chemistry:   { icon: '⚗️', color: 'var(--vl)',   bg: 'linear-gradient(135deg,rgba(91,33,245,.15),rgba(139,85,255,.08))' },
  mathematics: { icon: '🧮', color: 'var(--sky)',   bg: 'linear-gradient(135deg,rgba(59,191,255,.12),rgba(10,141,204,.06))' },
  math:        { icon: '🧮', color: 'var(--sky)',   bg: 'linear-gradient(135deg,rgba(59,191,255,.12),rgba(10,141,204,.06))' },
  arabic:      { icon: '📚', color: 'var(--coral)', bg: 'linear-gradient(135deg,rgba(255,107,107,.1),rgba(200,60,60,.06))' },
  physics:     { icon: '🔭', color: 'var(--amber)', bg: 'linear-gradient(135deg,rgba(255,184,48,.1),rgba(200,130,0,.06))' },
  science:     { icon: '🌍', color: 'var(--mint)',  bg: 'linear-gradient(135deg,rgba(0,229,160,.1),rgba(59,191,255,.08))' },
  english:     { icon: '📖', color: 'var(--sky)',   bg: 'linear-gradient(135deg,rgba(59,191,255,.12),rgba(91,33,245,.06))' },
};

function subjMeta(name: string) {
  const key = name.toLowerCase().split(' ')[0];
  return SUBJ_META[key] ?? { icon: '📖', color: 'var(--vl)', bg: 'rgba(91,33,245,.12)' };
}

// ── Session modal ────────────────────────────────────────────────

type Phase = 'setup' | 'loading' | 'teaching' | 'quiz' | 'answering' | 'feedback' | 'complete' | 'error';

interface ModalState {
  subject: MySubjectRead;
  chapterId: string;
  phase: Phase;
  teacherText: string;
  quiz: Quiz | null;
  answer: string;
  lastAnswer: SessionAnswerResponse | null;
  errorMsg: string;
  speakLoading: boolean;
  audioEl: HTMLAudioElement | null;
  completed: boolean;
}

function LessonModal({
  subject,
  units,
  onClose,
}: {
  subject: MySubjectRead;
  units: ContentUnit[];
  onClose: () => void;
}) {
  const user = auth.getUser();
  const studentId = user?.user_id ?? 'student';

  const [chapterId, setChapterId] = useState(
    units.find(u =>
      u.book_id?.toLowerCase().includes(subject.subject_name.toLowerCase().split(' ')[0]) ||
      u.title?.toLowerCase().includes(subject.subject_name.toLowerCase().split(' ')[0])
    )?.unit_id ?? subject.subject_code.toLowerCase()
  );

  const [phase, setPhase] = useState<Phase>('setup');
  const [teacherText, setTeacherText] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answer, setAnswer] = useState('');
  const [lastAnswer, setLastAnswer] = useState<SessionAnswerResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [speakLoading, setSpeakLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Filter units relevant to this subject
  const subjectKey = subject.subject_name.toLowerCase().split(' ')[0];
  const relevantUnits = units.filter(
    u =>
      u.book_id?.toLowerCase().includes(subjectKey) ||
      u.title?.toLowerCase().includes(subjectKey) ||
      u.subject?.toLowerCase().includes(subjectKey)
  );

  async function startLesson() {
    setPhase('loading');
    setErrorMsg('');
    try {
      const res: SessionStartResponse = await api.session.start(studentId, chapterId);
      if (res.error) { setErrorMsg(res.error); setPhase('error'); return; }
      if (res.done) { setErrorMsg(res.message ?? 'No content found for this chapter ID.'); setPhase('error'); return; }
      setTeacherText(res.teacher_text ?? '');
      setQuiz(res.quiz ?? null);
      setPhase('teaching');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to start session');
      setPhase('error');
    }
  }

  async function submitAnswer() {
    if (!answer.trim()) return;
    setPhase('answering');
    try {
      const res: SessionAnswerResponse = await api.session.answer(studentId, answer);
      setLastAnswer(res);
      setAnswer('');

      // If lesson completed, write evaluation
      if (res.next_action === 'session_start' || res.next_action === 'all_complete' || res.unit_completed) {
        const evalData = res.evaluation as { grammar_score?: number; comprehension_score?: number; pronunciation_score?: number; overall_score?: number } | undefined;
        api.evaluations.create({
          subject_id: subject.subject_id,
          content_id: chapterId,
          lesson_completed: true,
          completion_date: new Date().toISOString().split('T')[0],
          overall_score: evalData?.overall_score,
          grammar_score: evalData?.grammar_score,
          comprehension_score: evalData?.comprehension_score,
          pronunciation_score: evalData?.pronunciation_score,
        }).catch(() => {}); // fire and forget
        setPhase('complete');
        return;
      }

      setPhase('feedback');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to submit answer');
      setPhase('error');
    }
  }

  async function continueLesson(action: string) {
    setPhase('loading');
    try {
      let res: SessionStartResponse;
      if (action === 'continue_unit_part2') {
        res = await api.session.continuePart2(studentId);
      } else {
        res = await api.session.nextUnit(studentId);
      }
      if (res.error || res.done) {
        setPhase('complete');
        return;
      }
      setTeacherText(res.teacher_text ?? '');
      setQuiz(res.quiz ?? null);
      setLastAnswer(null);
      setPhase('teaching');
    } catch {
      setPhase('complete');
    }
  }

  async function speakText(text: string) {
    if (speakLoading || !text) return;
    setSpeakLoading(true);
    try {
      const { audio_url } = await api.tts.speak(text);
      if (audioRef.current) audioRef.current.pause();
      const el = new Audio(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${audio_url}`);
      audioRef.current = el;
      el.play();
    } catch { /* TTS optional */ } finally {
      setSpeakLoading(false);
    }
  }

  const meta = subjMeta(subject.subject_name);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {meta.icon}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 15 }}>{subject.subject_name}</div>
              <div style={{ fontSize: 11, color: 'var(--g3)' }}>AI Lesson Session</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">

          {/* ── SETUP ── */}
          {phase === 'setup' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <label className="field-label">Chapter / Unit ID</label>
                {relevantUnits.length > 0 ? (
                  <select
                    className="field-input"
                    value={chapterId}
                    onChange={e => setChapterId(e.target.value)}
                  >
                    {relevantUnits.map(u => (
                      <option key={u.unit_id} value={u.unit_id}>
                        {u.title ?? u.unit_id}
                      </option>
                    ))}
                    <option value={subject.subject_code.toLowerCase()}>
                      {subject.subject_code.toLowerCase()} (default)
                    </option>
                  </select>
                ) : (
                  <input
                    className="field-input"
                    type="text"
                    value={chapterId}
                    onChange={e => setChapterId(e.target.value)}
                    placeholder="e.g. english_g6:unit_01"
                  />
                )}
                <div style={{ fontSize: 10, color: 'var(--g5)', marginTop: 5 }}>
                  This maps to the content chapter in the AI teacher system.
                </div>
              </div>
              <button className="auth-submit" onClick={startLesson} disabled={!chapterId.trim()}>
                Start Lesson with AI Tutor →
              </button>
            </div>
          )}

          {/* ── LOADING ── */}
          {(phase === 'loading' || phase === 'answering') && (
            <div className="modal-center">
              <div className="modal-spinner" />
              <div style={{ marginTop: 14, color: 'var(--g3)', fontSize: 13 }}>
                {phase === 'answering' ? 'Checking your answer…' : 'Starting lesson…'}
              </div>
            </div>
          )}

          {/* ── TEACHING ── */}
          {phase === 'teaching' && (
            <div>
              <div className="session-teacher-box">
                <div className="session-teacher-label">
                  <span style={{ color: 'var(--vl)' }}>🤖</span> AI Tutor
                </div>
                <div className="session-teacher-text">{teacherText}</div>
                <button
                  className="session-speak-btn"
                  onClick={() => speakText(teacherText)}
                  disabled={speakLoading}
                  title="Listen to this"
                >
                  {speakLoading ? '⏳' : '🔊'}
                </button>
              </div>
              {quiz && (
                <button className="auth-submit" style={{ marginTop: 16 }} onClick={() => setPhase('quiz')}>
                  I&apos;m ready — show the quiz →
                </button>
              )}
            </div>
          )}

          {/* ── QUIZ ── */}
          {phase === 'quiz' && quiz && (
            <div>
              <div className="session-quiz-box">
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--vl)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                  Quiz Question
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 16 }}>{quiz.question}</div>

                {quiz.options && quiz.options.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {quiz.options.map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="quiz-option"
                          value={opt}
                          checked={answer === opt}
                          onChange={() => setAnswer(opt)}
                          style={{ accentColor: 'var(--v)' }}
                        />
                        <span style={{ fontSize: 13 }}>{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="field-input"
                    rows={3}
                    placeholder="Type your answer here…"
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    style={{ resize: 'vertical', marginBottom: 16 }}
                  />
                )}
              </div>
              <button className="auth-submit" onClick={submitAnswer} disabled={!answer.trim()}>
                Submit Answer →
              </button>
            </div>
          )}

          {/* ── FEEDBACK ── */}
          {phase === 'feedback' && lastAnswer && (
            <div>
              {lastAnswer.correct ? (
                <div className="session-feedback-correct">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                  <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, marginBottom: 6 }}>Correct!</div>
                  {lastAnswer.advance_text && (
                    <div style={{ fontSize: 13, color: 'var(--g3)', lineHeight: 1.6 }}>{lastAnswer.advance_text}</div>
                  )}
                </div>
              ) : (
                <div className="session-feedback-wrong">
                  <div style={{ fontSize: 24, marginBottom: 8 }}>💡</div>
                  <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, marginBottom: 6 }}>
                    {lastAnswer.hint ? 'Hint' : 'Not quite'}
                  </div>
                  {lastAnswer.hint && (
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>{lastAnswer.hint}</div>
                  )}
                  {lastAnswer.remediation_text && (
                    <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{lastAnswer.remediation_text}</div>
                  )}
                </div>
              )}

              {/* Next action buttons */}
              <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                {lastAnswer.next_action === 'answer_again' && (
                  <button className="auth-submit" onClick={() => { setLastAnswer(null); setPhase('quiz'); }}>
                    Try Again →
                  </button>
                )}
                {lastAnswer.next_action === 'continue_unit_part2' && (
                  <button className="auth-submit" onClick={() => continueLesson('continue_unit_part2')}>
                    Continue to Part 2 →
                  </button>
                )}
                {lastAnswer.next_action === 'next_unit' && (
                  <button className="auth-submit" onClick={() => continueLesson('next_unit')}>
                    Next Unit →
                  </button>
                )}
                {(lastAnswer.next_action === 'session_start' || lastAnswer.next_action === 'all_complete') && (
                  <button className="auth-submit" onClick={() => setPhase('complete')}>
                    Finish Lesson ✓
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── COMPLETE ── */}
          {phase === 'complete' && (
            <div className="modal-center">
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Lesson Complete!</div>
              <div style={{ fontSize: 13, color: 'var(--g3)', marginBottom: 24 }}>
                Your progress has been recorded for {subject.subject_name}.
              </div>
              <button className="auth-submit" onClick={onClose}>Back to Lessons</button>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <div>
              <div className="auth-error" style={{ marginBottom: 16 }}>{errorMsg}</div>
              <button className="auth-submit" onClick={() => setPhase('setup')}>Try a different Chapter ID</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────

const FALLBACK_SUBJECTS: MySubjectRead[] = [
  { subject_id: '1', subject_name: 'Biology',         subject_code: 'BIO', enrolled_sessions_count: 12 },
  { subject_id: '2', subject_name: 'Mathematics',     subject_code: 'MAT', enrolled_sessions_count: 10 },
  { subject_id: '3', subject_name: 'Chemistry',       subject_code: 'CHE', enrolled_sessions_count: 9  },
  { subject_id: '4', subject_name: 'Arabic Language', subject_code: 'ARA', enrolled_sessions_count: 8  },
  { subject_id: '5', subject_name: 'Science',         subject_code: 'SCI', enrolled_sessions_count: 7  },
  { subject_id: '6', subject_name: 'Physics',         subject_code: 'PHY', enrolled_sessions_count: 6  },
];

export default function LessonsPage() {
  const [subjects, setSubjects] = useState<MySubjectRead[]>([]);
  const [units, setUnits] = useState<ContentUnit[]>([]);
  const [activeSubject, setActiveSubject] = useState<MySubjectRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    Promise.all([
      api.dashboard.subjects().catch(() => []),
      api.units.list().catch(() => ({ units: [] })),
    ]).then(([s, u]) => {
      setSubjects(Array.isArray(s) && s.length ? s : FALLBACK_SUBJECTS);
      setUnits(u?.units ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const filters = ['All', ...subjects.map(s => s.subject_name.split(' ')[0])];
  const visible = filter === 'All' ? subjects : subjects.filter(s => s.subject_name.startsWith(filter));

  return (
    <div className="page-enter">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="card-title" style={{ fontSize: 18 }}>All Lessons</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 3 }}>
            {loading ? 'Loading…' : `${subjects.length} subjects enrolled`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.slice(0, 6).map(f => (
            <button
              key={f}
              className="btn btn-o btn-sm"
              style={filter === f ? { background: 'rgba(91,33,245,.15)', color: 'var(--vl)', borderColor: 'rgba(91,33,245,.3)' } : {}}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Subject / lesson cards */}
      <div className="lesson-grid">
        {visible.map(s => {
          const m = subjMeta(s.subject_name);
          return (
            <div key={s.subject_id} className="lesson-card">
              <div className="lc-thumb" style={{ background: m.bg }}>{m.icon}</div>
              <div className="lc-body">
                <div className="lc-subject" style={{ color: m.color }}>{s.subject_name}</div>
                <div className="lc-title">{s.enrolled_sessions_count} sessions enrolled</div>
                <div className="lc-meta">
                  <span className="lc-time">AI-guided lesson</span>
                  <span className="pill pill-s" style={{ cursor: 'pointer' }} onClick={() => setActiveSubject(s)}>
                    ▶ Start
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Session banner */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 24, background: 'linear-gradient(135deg,var(--navym),#130d40)', marginTop: 24 }}>
        <div style={{ background: 'linear-gradient(135deg,var(--navys),#1a1060)', borderRadius: 16, width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 40, position: 'relative' }}>
          🤖
          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)' }}>
            <div className="wave-row">{[0,1,2,3,4].map(i => <div key={i} className="wv" />)}</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ fontSize: 16 }}>AI Tutor — Jassmine</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', margin: '4px 0 12px' }}>
            Click &quot;Start&quot; on any subject above to begin an interactive lesson with your AI tutor.
            Your answers and progress are recorded automatically.
          </div>
        </div>
        {subjects[0] && (
          <button className="btn btn-v" onClick={() => setActiveSubject(subjects[0])}>
            ▶ Start Now
          </button>
        )}
      </div>

      {/* Lesson Modal */}
      {activeSubject && (
        <LessonModal
          subject={activeSubject}
          units={units}
          onClose={() => setActiveSubject(null)}
        />
      )}
    </div>
  );
}
