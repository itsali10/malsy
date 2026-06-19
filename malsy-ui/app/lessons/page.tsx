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

// ── Constants ────────────────────────────────────────────────────

const ALLOWED_SUBJECTS = ['english', 'science', 'history', 'math'];

const SUBJ_META: Record<string, { icon: string; color: string; bg: string }> = {
  english: { icon: '📖', color: 'var(--sky)',   bg: 'linear-gradient(135deg,rgba(59,191,255,.12),rgba(91,33,245,.06))' },
  science: { icon: '🔬', color: 'var(--mint)',  bg: 'linear-gradient(135deg,rgba(0,229,160,.1),rgba(59,191,255,.08))' },
  history: { icon: '🏛️', color: 'var(--amber)', bg: 'linear-gradient(135deg,rgba(255,184,48,.1),rgba(200,130,0,.06))' },
  math:    { icon: '🧮', color: 'var(--vl)',    bg: 'linear-gradient(135deg,rgba(91,33,245,.15),rgba(139,85,255,.08))' },
};

const FALLBACK_SUBJECTS: MySubjectRead[] = [
  { subject_id: '1', subject_name: 'English', subject_code: 'ENG', enrolled_sessions_count: 12 },
  { subject_id: '2', subject_name: 'Science', subject_code: 'SCI', enrolled_sessions_count: 10 },
  { subject_id: '3', subject_name: 'History', subject_code: 'HIS', enrolled_sessions_count: 9  },
  { subject_id: '4', subject_name: 'Math',    subject_code: 'MAT', enrolled_sessions_count: 8  },
];

function subjMeta(name: string) {
  const key = name.toLowerCase().split(' ')[0];
  return SUBJ_META[key] ?? { icon: '📖', color: 'var(--vl)', bg: 'rgba(91,33,245,.12)' };
}

// ── Types ─────────────────────────────────────────────────────────

type Phase =
  | 'setup'
  | 'loading'
  | 'teaching'
  | 'quiz'
  | 'answering'
  | 'hint'
  | 'remediation'
  | 'correct'
  | 'complete'
  | 'error';

interface FeedbackState {
  text: string;
  hintCount?: number;
  nextAction?: string;
}

// ── Jassmine avatar ───────────────────────────────────────────────

function JassmineAvatar({ speaking, size = 56 }: { speaking: boolean; size?: number }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0, width: size, height: size + (speaking ? 16 : 0) }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg,#3D1FA8,#5B21F5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        border: speaking ? '2px solid var(--mint)' : '2px solid rgba(255,255,255,.1)',
        boxShadow: speaking ? '0 0 18px rgba(0,229,160,.35)' : 'none',
        transition: 'border-color .3s, box-shadow .3s',
      }}>
        <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 220 220" fill="none">
          <path d="M58 210 Q54 175 62 158 Q72 140 110 136 Q148 140 158 158 Q166 175 162 210Z" fill="#3D1FA8" />
          <rect x="100" y="126" width="20" height="18" rx="6" fill="#F4C5A0" />
          <ellipse cx="110" cy="102" rx="36" ry="38" fill="#F4C5A0" />
          <path d="M74 88 Q72 60 84 50 Q94 40 110 38 Q126 40 136 50 Q148 60 146 88 Q142 70 136 64 Q128 55 110 54 Q92 55 84 64 Q78 70 74 88Z" fill="#1A0A3C" />
          <ellipse cx="97"  cy="95" rx="8" ry="7" fill="white" />
          <ellipse cx="123" cy="95" rx="8" ry="7" fill="white" />
          <circle cx="97"  cy="95" r="4.5" fill="#5B21F5" />
          <circle cx="123" cy="95" r="4.5" fill="#5B21F5" />
          <circle cx="97"  cy="95" r="2.2" fill="#1A0A3C" />
          <circle cx="123" cy="95" r="2.2" fill="#1A0A3C" />
          <circle cx="99"  cy="93" r="1.2" fill="white" opacity="0.9" />
          <circle cx="125" cy="93" r="1.2" fill="white" opacity="0.9" />
          <path d="M100 114 Q110 122 120 114" stroke="#D4845A" strokeWidth="2" fill="none" strokeLinecap="round" />
          <ellipse cx="74"  cy="100" rx="6" ry="9" fill="#F4C5A0" />
          <ellipse cx="146" cy="100" rx="6" ry="9" fill="#F4C5A0" />
        </svg>
      </div>
      {speaking && (
        <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 3 }}>
          {[0,1,2,3,4].map(i => <div key={i} className="wv" />)}
        </div>
      )}
    </div>
  );
}

// ── Lesson Modal ──────────────────────────────────────────────────

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
  const meta = subjMeta(subject.subject_name);

  // unit selection
  const subjectKey = subject.subject_name.toLowerCase().split(' ')[0];
  const relevantUnits = units.filter(u =>
    u.book_id?.toLowerCase().includes(subjectKey) ||
    u.title?.toLowerCase().includes(subjectKey) ||
    u.subject?.toLowerCase().includes(subjectKey)
  );
  const [chapterId, setChapterId] = useState(
    relevantUnits[0]?.unit_id ?? subject.subject_code.toLowerCase()
  );

  // core state
  const [phase, setPhase]           = useState<Phase>('setup');
  const [teacherText, setTeacherText] = useState('');
  const [quiz, setQuiz]             = useState<Quiz | null>(null);
  const [answer, setAnswer]         = useState('');
  const [unitPart, setUnitPart]     = useState<0 | 1>(0);
  const [feedback, setFeedback]     = useState<FeedbackState | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [speaking, setSpeaking]     = useState(false);

  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // ── audio helpers ─────────────────────────────────────────────

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }

  async function playTTS(text: string) {
    if (!text.trim()) return;
    stopAudio();
    setSpeaking(true);
    try {
      const { audio_url } = await api.tts.speak(text);
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
      const el = new Audio(`${base}${audio_url}`);
      audioRef.current = el;
      el.onended = () => setSpeaking(false);
      el.onerror = () => setSpeaking(false);
      el.play().catch(() => setSpeaking(false));
    } catch {
      setSpeaking(false);
    }
  }

  // ── session helpers ───────────────────────────────────────────

  function applySessionResponse(res: SessionStartResponse) {
    setTeacherText(res.teacher_text ?? '');
    setQuiz(res.quiz ?? null);
    setUnitPart((res.unit_part ?? 0) as 0 | 1);
    setFeedback(null);
    setAnswer('');
    setPhase('teaching');
    playTTS(res.teacher_text ?? '');
  }

  async function startLesson() {
    setPhase('loading');
    setErrorMsg('');
    try {
      const res = await api.session.start(studentId, chapterId);
      if (res.error) { setErrorMsg(res.error); setPhase('error'); return; }
      if (res.done)  { setPhase('complete'); return; }
      applySessionResponse(res);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to start session');
      setPhase('error');
    }
  }

  async function submitAnswer() {
    if (!answer.trim()) return;
    stopAudio();
    setPhase('answering');
    try {
      const res: SessionAnswerResponse = await api.session.answer(studentId, answer);
      setAnswer('');

      if (res.correct) {
        setFeedback({ text: res.advance_text ?? 'Great job!', nextAction: res.next_action });
        setPhase('correct');
      } else if (res.hint) {
        setFeedback({ text: res.hint, hintCount: res.hint_count, nextAction: 'answer_again' });
        setPhase('hint');
        playTTS(res.hint);
      } else if (res.remediation_text) {
        setFeedback({ text: res.remediation_text, nextAction: 'answer_again' });
        setPhase('remediation');
        playTTS(res.remediation_text);
      } else {
        setFeedback({ text: 'Think about it and try again.', nextAction: 'answer_again' });
        setPhase('hint');
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to submit answer');
      setPhase('error');
    }
  }

  function retryQuiz() {
    stopAudio();
    setFeedback(null);
    setPhase('quiz');
    setTimeout(() => textAreaRef.current?.focus(), 80);
  }

  async function handleCorrectNext() {
    if (!feedback) return;
    const action = feedback.nextAction;
    stopAudio();

    if (action === 'all_complete') { setPhase('complete'); return; }

    setPhase('loading');
    try {
      let res: SessionStartResponse;
      if (action === 'continue_unit_part2') {
        res = await api.session.continuePart2(studentId);
      } else if (action === 'next_unit') {
        res = await api.session.nextUnit(studentId);
      } else {
        // session_start or unknown — restart session (progress is saved, picks up where left off)
        res = await api.session.start(studentId, chapterId);
      }
      if (res.done || (res as { error?: string }).error) { setPhase('complete'); return; }
      applySessionResponse(res);
    } catch { setPhase('complete'); }
  }

  // paragraphs for display
  const paragraphs = teacherText.split(/\n+/).map(p => p.trim()).filter(Boolean);

  // ── render ────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { stopAudio(); onClose(); } }}>
      <div className="modal-box" style={{ maxWidth: 680 }}>

        {/* ── Header ── */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {meta.icon}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 15 }}>{subject.subject_name}</div>
              <div style={{ fontSize: 11, color: 'var(--g3)' }}>
                {phase === 'setup'
                  ? 'AI-guided lesson with Jassmine'
                  : `Part ${unitPart + 1} of 2 · AI Lesson`}
              </div>
            </div>
          </div>
          {/* Part indicator pills */}
          {phase !== 'setup' && phase !== 'loading' && (
            <div style={{ display: 'flex', gap: 5, marginRight: 'auto', marginLeft: 16 }}>
              {[0, 1].map(p => (
                <div key={p} style={{
                  width: 28, height: 5, borderRadius: 99,
                  background: p === unitPart ? meta.color : 'rgba(255,255,255,.1)',
                  transition: 'background .3s',
                }} />
              ))}
            </div>
          )}
          <button className="modal-close" onClick={() => { stopAudio(); onClose(); }}>✕</button>
        </div>

        <div className="modal-body">

          {/* ── SETUP ── */}
          {phase === 'setup' && (
            <div>
              {/* What to expect */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 22 }}>
                {[
                  { icon: '📚', label: 'Reading & Vocab' },
                  { icon: '✏️', label: 'Grammar & Writing' },
                  { icon: '🎧', label: 'Listening & Speaking' },
                  { icon: '❓', label: 'Quiz & Feedback' },
                ].map(item => (
                  <div key={item.label} style={{
                    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
                    borderRadius: 10, padding: '12px 8px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 5 }}>{item.icon}</div>
                    <div style={{ fontSize: 9, color: 'var(--g3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', lineHeight: 1.4 }}>{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Unit selector */}
              <div style={{ marginBottom: 20 }}>
                <label className="field-label">Unit</label>
                {relevantUnits.length > 0 ? (
                  <select className="field-input" value={chapterId} onChange={e => setChapterId(e.target.value)}>
                    {relevantUnits.map(u => (
                      <option key={u.unit_id} value={u.unit_id}>{u.title ?? u.unit_id}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="field-input" type="text" value={chapterId}
                    onChange={e => setChapterId(e.target.value)}
                    placeholder="e.g. english_g6:unit_01"
                  />
                )}
                <div style={{ fontSize: 10, color: 'var(--g5)', marginTop: 5 }}>
                  Each unit has 2 parts. Your progress is saved automatically.
                </div>
              </div>

              <button className="auth-submit" onClick={startLesson} disabled={!chapterId.trim()}>
                Start Lesson with Jassmine →
              </button>
            </div>
          )}

          {/* ── LOADING / ANSWERING ── */}
          {(phase === 'loading' || phase === 'answering') && (
            <div className="modal-center" style={{ padding: '44px 0' }}>
              <div className="modal-spinner" />
              <div style={{ marginTop: 18, color: 'var(--g3)', fontSize: 13 }}>
                {phase === 'answering' ? 'Checking your answer…' : 'Preparing your lesson…'}
              </div>
            </div>
          )}

          {/* ── TEACHING ── */}
          {phase === 'teaching' && (
            <div>
              {/* Avatar + teacher bubble */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
                <JassmineAvatar speaking={speaking} size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--vl)', marginBottom: 7 }}>
                    Jassmine · AI Tutor
                  </div>
                  <div style={{
                    background: 'rgba(91,33,245,.1)', border: '1px solid rgba(91,33,245,.22)',
                    borderRadius: '4px 16px 16px 16px', padding: '14px 16px',
                    maxHeight: 340, overflowY: 'auto',
                  }}>
                    {paragraphs.map((p, i) => (
                      <p key={i} style={{
                        fontSize: 13, lineHeight: 1.75, color: 'var(--w)',
                        marginBottom: i < paragraphs.length - 1 ? 12 : 0,
                      }}>
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              {/* Audio controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                {speaking ? (
                  <button className="btn btn-o btn-sm" onClick={stopAudio}>⏹ Stop</button>
                ) : (
                  <button className="btn btn-o btn-sm" onClick={() => playTTS(teacherText)}>🔊 Play Again</button>
                )}
                <span style={{ fontSize: 11, color: 'var(--g5)' }}>
                  {speaking ? 'Jassmine is speaking…' : 'Read the lesson, then start the quiz when ready.'}
                </span>
              </div>

              {quiz ? (
                <button className="auth-submit" onClick={() => { stopAudio(); setPhase('quiz'); }}>
                  I&apos;m ready — take the quiz →
                </button>
              ) : (
                <button className="auth-submit" onClick={startLesson}>
                  Continue →
                </button>
              )}
            </div>
          )}

          {/* ── QUIZ ── */}
          {phase === 'quiz' && quiz && (
            <div>
              {/* Question card */}
              <div style={{
                background: 'rgba(59,191,255,.06)', border: '1px solid rgba(59,191,255,.18)',
                borderRadius: 14, padding: '18px 16px', marginBottom: 16,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--sky)', marginBottom: 10 }}>
                  Quiz
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.55, color: 'var(--w)' }}>
                  {quiz.question}
                </div>
              </div>

              {/* Multiple choice */}
              {quiz.options && quiz.options.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {quiz.options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setAnswer(opt)}
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: 10, textAlign: 'left',
                        border: `1px solid ${answer === opt ? 'var(--v)' : 'rgba(255,255,255,.1)'}`,
                        background: answer === opt ? 'rgba(91,33,245,.22)' : 'rgba(255,255,255,.04)',
                        color: 'var(--w)', fontFamily: 'var(--fb)', fontSize: 13,
                        cursor: 'pointer', transition: 'all .15s',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                /* Open text */
                <div style={{ marginBottom: 16 }}>
                  <textarea
                    ref={textAreaRef}
                    className="field-input"
                    rows={4}
                    placeholder="Type your answer here…"
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitAnswer(); }}
                    style={{ resize: 'vertical', display: 'block', width: '100%' }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--g5)', marginTop: 5 }}>Ctrl + Enter to submit</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="auth-submit" style={{ flex: 1 }} onClick={submitAnswer} disabled={!answer.trim()}>
                  Submit Answer →
                </button>
                <button
                  className="btn btn-o"
                  onClick={() => setPhase('teaching')}
                  title="Re-read the lesson"
                  style={{ padding: '11px 14px', fontSize: 16 }}
                >
                  📖
                </button>
              </div>
            </div>
          )}

          {/* ── HINT ── */}
          {phase === 'hint' && feedback && (
            <div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
                <JassmineAvatar speaking={speaking} size={48} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sky)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>
                    Hint {(feedback.hintCount ?? 0) < 2 ? `${(feedback.hintCount ?? 0) + 1} of 2` : '2 of 2 — last hint!'}
                  </div>
                  <div style={{
                    background: 'rgba(59,191,255,.07)', border: '1px solid rgba(59,191,255,.22)',
                    borderRadius: '4px 14px 14px 14px', padding: '12px 14px',
                    fontSize: 13, lineHeight: 1.7, color: 'var(--w)',
                  }}>
                    {feedback.text}
                  </div>
                </div>
              </div>
              <button className="auth-submit" onClick={retryQuiz}>Try Again →</button>
            </div>
          )}

          {/* ── REMEDIATION ── */}
          {phase === 'remediation' && feedback && (
            <div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
                <JassmineAvatar speaking={speaking} size={48} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>
                    Let me explain that again
                  </div>
                  <div style={{
                    background: 'rgba(255,184,48,.07)', border: '1px solid rgba(255,184,48,.22)',
                    borderRadius: '4px 14px 14px 14px', padding: '12px 14px',
                    fontSize: 13, lineHeight: 1.7, color: 'var(--w)',
                  }}>
                    {feedback.text.split(/\n+/).filter(Boolean).map((p, i, arr) => (
                      <p key={i} style={{ marginBottom: i < arr.length - 1 ? 10 : 0 }}>{p}</p>
                    ))}
                  </div>
                </div>
              </div>
              <button className="auth-submit" onClick={retryQuiz}>I understand — Try Again →</button>
            </div>
          )}

          {/* ── CORRECT ── */}
          {phase === 'correct' && feedback && (
            <div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
                <JassmineAvatar speaking={false} size={48} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--mint)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>
                    ✅ Correct!
                  </div>
                  <div style={{
                    background: 'rgba(0,229,160,.07)', border: '1px solid rgba(0,229,160,.22)',
                    borderRadius: '4px 14px 14px 14px', padding: '12px 14px',
                    fontSize: 13, lineHeight: 1.7, color: 'var(--w)',
                  }}>
                    {feedback.text}
                  </div>
                </div>
              </div>
              <button className="auth-submit" onClick={handleCorrectNext}>
                {feedback.nextAction === 'all_complete'
                  ? '🎉 Finish Lesson'
                  : feedback.nextAction === 'continue_unit_part2'
                  ? 'Continue to Part 2 →'
                  : 'Next →'}
              </button>
            </div>
          )}

          {/* ── COMPLETE ── */}
          {phase === 'complete' && (
            <div className="modal-center" style={{ padding: '36px 0' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
                Lesson Complete!
              </div>
              <div style={{ fontSize: 13, color: 'var(--g3)', marginBottom: 28 }}>
                Great work on <strong>{subject.subject_name}</strong>. Your progress has been saved.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-v" onClick={startLesson}>Start Next Part</button>
                <button className="btn btn-o" onClick={() => { stopAudio(); onClose(); }}>Back to Lessons</button>
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <div>
              <div className="auth-error" style={{ marginBottom: 16 }}>{errorMsg}</div>
              <button className="auth-submit" onClick={() => setPhase('setup')}>Try a Different Unit</button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Hub page ──────────────────────────────────────────────────────

export default function LessonsPage() {
  const [subjects, setSubjects]       = useState<MySubjectRead[]>([]);
  const [units, setUnits]             = useState<ContentUnit[]>([]);
  const [activeSubject, setActiveSubject] = useState<MySubjectRead | null>(null);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('All');

  useEffect(() => {
    Promise.all([
      api.dashboard.subjects().catch(() => []),
      api.units.list().catch(() => ({ units: [] })),
    ]).then(([s, u]) => {
      const filtered = Array.isArray(s)
        ? s.filter(sub => ALLOWED_SUBJECTS.includes(sub.subject_name.toLowerCase()))
        : [];
      setSubjects(filtered.length ? filtered : FALLBACK_SUBJECTS);
      setUnits(u?.units ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const filters = ['All', ...FALLBACK_SUBJECTS.map(s => s.subject_name)];
  const visible = filter === 'All' ? subjects : subjects.filter(s => s.subject_name === filter);

  return (
    <div className="page-enter">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="card-title" style={{ fontSize: 18 }}>All Lessons</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 3 }}>
            {loading ? 'Loading…' : `${subjects.length} subjects available`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.map(f => (
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

      {/* Subject cards */}
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
                  <span className="lc-time">AI-guided · Jassmine</span>
                  <span
                    className="pill pill-s"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveSubject(s)}
                  >
                    ▶ Start
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Jassmine banner */}
      <div className="card" style={{
        display: 'flex', alignItems: 'center', gap: 24,
        background: 'linear-gradient(135deg,var(--navym),#130d40)', marginTop: 24,
      }}>
        <div style={{
          background: 'linear-gradient(135deg,var(--navys),#1a1060)',
          borderRadius: 16, width: 88, height: 88, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <JassmineAvatar speaking={false} size={72} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ fontSize: 16 }}>AI Tutor — Jassmine</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', margin: '4px 0 12px' }}>
            Jassmine reads the textbook with you, explains every topic — vocabulary, grammar,
            reading passages, and exercises — then quizzes you with hints and re-explanations if you need them.
          </div>
        </div>
        {subjects[0] && (
          <button className="btn btn-v" onClick={() => setActiveSubject(subjects[0])}>
            ▶ Start Now
          </button>
        )}
      </div>

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
