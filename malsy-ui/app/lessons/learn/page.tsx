'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, Quiz, SessionAnswerResponse, SessionStartResponse } from '../../../lib/api';
import { auth } from '../../../lib/auth';

// ── Types ─────────────────────────────────────────────────────────

type Phase = 'loading' | 'active' | 'answering' | 'hint' | 'remediation' | 'correct' | 'complete' | 'error';

interface Feedback {
  text: string;
  kind: 'hint' | 'remediation' | 'correct';
  hintCount?: number;
  nextAction?: string;
}

// ── Lesson page ────────────────────────────────────────────────────

function LessonLearn() {
  const router    = useRouter();
  const params       = useSearchParams();
  const chapter      = params.get('chapter') ?? '';
  const lessonTitle  = params.get('lesson_title') ?? '';
  const lessonDesc   = params.get('lesson_desc') ?? '';
  const user      = auth.getUser();
  const studentId = user?.user_id ?? 'student';

  const [phase,       setPhase]       = useState<Phase>('loading');
  const [teacherText, setTeacherText] = useState('');
  const [quiz,        setQuiz]        = useState<Quiz | null>(null);
  const [unitPart,    setUnitPart]    = useState<0 | 1>(0);
  const [answer,      setAnswer]      = useState('');
  const [feedback,    setFeedback]    = useState<Feedback | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [speaking,    setSpeaking]    = useState(false);
  const [ttsError,    setTtsError]    = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Labels for breadcrumb: prefer explicit lesson_title param, fall back to chapter ID parsing
  const [subjectLabel, unitLabel] = (() => {
    const cap = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (lessonTitle) {
      const p = chapter.split(':');
      return [cap(p[0] ?? 'Lesson'), lessonTitle];
    }
    const p = chapter.split(':');
    return [cap(p[0] ?? 'Lesson'), cap(p[1] ?? chapter)];
  })();

  // ── audio ─────────────────────────────────────────────────────

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
    window.dispatchEvent(new CustomEvent('malsy-tts', { detail: { speaking: false } }));
  }

  async function playTTS(text: string) {
    if (!text.trim()) return;
    stopAudio();
    setSpeaking(true);
    setTtsError('');
    try {
      const { audio_url } = await api.tts.speak(text);
      const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
      const src  = audio_url.startsWith('http') ? audio_url : `${base}${audio_url}`;
      const el   = new Audio(src);
      audioRef.current = el;
      el.onplay = () => {
        window.dispatchEvent(new CustomEvent('malsy-tts', { detail: { speaking: true } }));
      };
      el.onended = () => {
        setSpeaking(false);
        window.dispatchEvent(new CustomEvent('malsy-tts', { detail: { speaking: false } }));
      };
      el.onerror = () => {
        setSpeaking(false);
        setTtsError('Audio playback failed — check that the backend is running.');
        window.dispatchEvent(new CustomEvent('malsy-tts', { detail: { speaking: false } }));
      };
      el.play().catch(err => {
        console.error('[TTS] play() rejected:', err);
        setSpeaking(false);
        setTtsError(err instanceof Error ? err.message : 'Playback blocked by browser.');
        window.dispatchEvent(new CustomEvent('malsy-tts', { detail: { speaking: false } }));
      });
    } catch (err) {
      console.error('[TTS] API error:', err);
      setSpeaking(false);
      setTtsError(err instanceof Error ? err.message : 'TTS service unavailable.');
      window.dispatchEvent(new CustomEvent('malsy-tts', { detail: { speaking: false } }));
    }
  }

  // ── session ───────────────────────────────────────────────────

  function applySession(res: SessionStartResponse) {
    setTeacherText(res.teacher_text ?? '');
    setQuiz(res.quiz ?? null);
    setUnitPart((res.unit_part ?? 0) as 0 | 1);
    setFeedback(null);
    setAnswer('');
    setPhase('active');
    // Auto-play is browser-blocked when triggered without a direct user gesture;
    // the user clicks 🔊 Listen to hear the lesson.
  }

  useEffect(() => {
    if (!chapter) { router.replace('/lessons'); return; }
    api.session.start(studentId, chapter, lessonTitle, lessonDesc)
      .then(res => {
        if ((res as { error?: string }).error) { setErrorMsg((res as { error?: string }).error ?? 'Error'); setPhase('error'); return; }
        if (res.done) { setPhase('complete'); return; }
        applySession(res);
      })
      .catch(e => { setErrorMsg(e instanceof Error ? e.message : 'Failed to load lesson'); setPhase('error'); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  async function submitAnswer() {
    if (!answer.trim()) return;
    stopAudio();
    setPhase('answering');
    try {
      const res: SessionAnswerResponse = await api.session.answer(studentId, answer);
      setAnswer('');
      if (res.correct) {
        setFeedback({ text: res.advance_text ?? 'Great job!', kind: 'correct', nextAction: res.next_action });
        setPhase('correct');
      } else if (res.hint) {
        setFeedback({ text: res.hint, kind: 'hint', hintCount: res.hint_count });
        setPhase('hint');
        playTTS(res.hint);
      } else if (res.remediation_text) {
        setFeedback({ text: res.remediation_text, kind: 'remediation' });
        setPhase('remediation');
        playTTS(res.remediation_text);
      } else {
        setFeedback({ text: 'Think about it and try again.', kind: 'hint' });
        setPhase('hint');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed');
      setPhase('error');
    }
  }

  async function handleNext() {
    if (!feedback) return;
    const action = feedback.nextAction;
    stopAudio();
    if (action === 'all_complete') { setPhase('complete'); return; }
    setPhase('loading');
    try {
      let res: SessionStartResponse;
      if (action === 'continue_unit_part2') res = await api.session.continuePart2(studentId);
      else if (action === 'next_unit')      res = await api.session.nextUnit(studentId);
      else                                  res = await api.session.start(studentId, chapter);
      if (res.done || (res as { error?: string }).error) { setPhase('complete'); return; }
      applySession(res);
    } catch { setPhase('complete'); }
  }

  const paragraphs  = teacherText.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const hasFeedback = phase === 'hint' || phase === 'remediation' || phase === 'correct';
  const canRetry    = phase === 'hint' || phase === 'remediation';

  // ── render ────────────────────────────────────────────────────

  return (
    <div className="page-enter" style={{ maxWidth: 820, margin: '0 auto', paddingBottom: 64 }}>

      {/* Breadcrumb header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => { stopAudio(); router.push('/lessons'); }}
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '5px 14px', color: 'var(--g2)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fb)' }}
          >
            ← Lessons
          </button>
          <span style={{ fontSize: 13, color: 'var(--g5)' }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--vl)', fontWeight: 600 }}>{subjectLabel}</span>
          <span style={{ fontSize: 13, color: 'var(--g5)' }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--w)' }}>{unitLabel}</span>
        </div>

        {/* Part progress pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--g4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Part {unitPart + 1} of 2
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1].map(p => (
              <div key={p} style={{ width: 32, height: 4, borderRadius: 99, transition: 'background .3s', background: p <= unitPart ? 'var(--vl)' : 'rgba(255,255,255,.1)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Loading / answering spinner */}
      {(phase === 'loading' || phase === 'answering') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 0' }}>
          <div className="modal-spinner" />
          <div style={{ marginTop: 18, color: 'var(--g3)', fontSize: 13 }}>
            {phase === 'answering' ? 'Checking your answer…' : 'Loading lesson…'}
          </div>
        </div>
      )}

      {/* Main lesson content */}
      {(phase === 'active' || hasFeedback) && (
        <>
          {/* Teaching content card */}
          <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(91,33,245,.2)', marginBottom: 32, background: 'rgba(91,33,245,.05)' }}>
            {/* Card top bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderBottom: '1px solid rgba(91,33,245,.12)', background: 'rgba(91,33,245,.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0, fontSize: 16,
                  background: 'linear-gradient(135deg,#3D1FA8,#5B21F5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: speaking ? '2px solid var(--mint)' : '2px solid rgba(255,255,255,.12)',
                  boxShadow: speaking ? '0 0 14px rgba(0,229,160,.3)' : 'none',
                  transition: 'all .3s',
                }}>🧑‍🏫</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--vl)' }}>Jassmine · AI Tutor</div>
                  <div style={{ fontSize: 10, color: speaking ? 'var(--mint)' : 'var(--g4)', transition: 'color .3s' }}>
                    {speaking ? 'Reading lesson aloud…' : 'AI-guided lesson'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                {speaking
                  ? <button className="btn btn-o btn-sm" onClick={stopAudio}>⏹ Stop</button>
                  : <button className="btn btn-o btn-sm" onClick={() => playTTS(teacherText)} disabled={!teacherText}>🔊 Listen</button>
                }
                {ttsError && (
                  <div style={{ fontSize: 10, color: '#ff7070', maxWidth: 200, textAlign: 'right', lineHeight: 1.3 }}>
                    {ttsError}
                  </div>
                )}
              </div>
            </div>

            {/* Lesson text */}
            <div style={{ padding: '28px 32px 36px' }}>
              {paragraphs.map((p, i) => (
                <p key={i} style={{ fontSize: 15, lineHeight: 1.9, color: 'rgba(255,255,255,.88)', marginBottom: i < paragraphs.length - 1 ? 18 : 0 }}>
                  {p}
                </p>
              ))}
            </div>
          </div>

          {/* Quiz section */}
          {quiz && (
            <>
              {/* Section divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--g4)' }}>Quiz</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }} />
              </div>

              {/* Question card */}
              <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: '22px 28px', marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--sky)', marginBottom: 14 }}>Question</div>
                <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.55, color: 'var(--w)' }}>{quiz.question}</div>
              </div>

              {/* Multiple choice options */}
              {quiz.options && quiz.options.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 24 }}>
                  {quiz.options.map((opt, idx) => {
                    const sel = answer === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => { if (phase !== 'correct') setAnswer(opt); }}
                        style={{
                          padding: '16px 18px', borderRadius: 14, textAlign: 'left', cursor: phase === 'correct' ? 'default' : 'pointer',
                          border: `1px solid ${sel ? 'rgba(91,33,245,.55)' : 'rgba(255,255,255,.08)'}`,
                          background: sel ? 'rgba(91,33,245,.2)' : 'rgba(255,255,255,.03)',
                          display: 'flex', alignItems: 'flex-start', gap: 12, transition: 'all .15s',
                        }}
                      >
                        <span style={{
                          width: 26, height: 26, borderRadius: 8, flexShrink: 0, fontSize: 11, fontWeight: 800, marginTop: 1,
                          background: sel ? 'var(--vl)' : 'rgba(255,255,255,.08)',
                          color: sel ? 'white' : 'var(--g3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                        }}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--w)', lineHeight: 1.45 }}>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Open-ended text input */
                <div style={{ marginBottom: 24 }}>
                  <textarea
                    rows={4} className="field-input"
                    placeholder="Type your answer here…"
                    value={answer} onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitAnswer(); }}
                    style={{ resize: 'vertical', display: 'block', width: '100%' }}
                    disabled={phase === 'correct'}
                  />
                  <div style={{ fontSize: 10, color: 'var(--g5)', marginTop: 5 }}>Ctrl + Enter to submit</div>
                </div>
              )}

              {/* Inline feedback */}
              {hasFeedback && feedback && (
                <div style={{
                  borderRadius: 14, padding: '16px 20px', marginBottom: 22,
                  border: `1px solid ${feedback.kind === 'correct' ? 'rgba(0,229,160,.22)' : feedback.kind === 'hint' ? 'rgba(59,191,255,.22)' : 'rgba(255,184,48,.22)'}`,
                  background: `${feedback.kind === 'correct' ? 'rgba(0,229,160,.06)' : feedback.kind === 'hint' ? 'rgba(59,191,255,.06)' : 'rgba(255,184,48,.06)'}`,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 9,
                    color: feedback.kind === 'correct' ? 'var(--mint)' : feedback.kind === 'hint' ? 'var(--sky)' : 'var(--amber)',
                  }}>
                    {feedback.kind === 'correct' ? '✅ Correct!' : feedback.kind === 'hint' ? `Hint ${(feedback.hintCount ?? 0) + 1}` : 'Let me explain that again'}
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--w)' }}>{feedback.text}</div>
                </div>
              )}

              {/* Action button */}
              {phase === 'correct'
                ? (
                  <button className="auth-submit" onClick={handleNext}>
                    {feedback?.nextAction === 'all_complete' ? '🎉 Finish Lesson'
                      : feedback?.nextAction === 'continue_unit_part2' ? 'Continue to Part 2 →'
                      : 'Next →'}
                  </button>
                ) : (
                  <button className="auth-submit" onClick={submitAnswer} disabled={!answer.trim()}>
                    {canRetry ? 'Try Again →' : 'Submit Answer →'}
                  </button>
                )
              }
            </>
          )}

          {/* No quiz — just Continue */}
          {!quiz && phase === 'active' && (
            <div style={{ textAlign: 'center' }}>
              <button className="auth-submit" style={{ maxWidth: 320, margin: '0 auto' }} onClick={handleNext}>
                Continue →
              </button>
            </div>
          )}
        </>
      )}

      {/* Complete */}
      {phase === 'complete' && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 60, marginBottom: 18 }}>🎉</div>
          <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 26, marginBottom: 10 }}>Lesson Complete!</div>
          <div style={{ fontSize: 14, color: 'var(--g3)', marginBottom: 36 }}>
            Great work on <strong style={{ color: 'var(--vl)' }}>{subjectLabel}</strong>. Your progress has been saved.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-v" onClick={() => {
              setPhase('loading');
              api.session.start(studentId, chapter)
                .then(r => { if (!r.done) applySession(r); else setPhase('complete'); })
                .catch(() => setPhase('complete'));
            }}>
              Start Next Unit
            </button>
            <button className="btn btn-o" onClick={() => { stopAudio(); router.push('/lessons'); }}>
              ← Back to Lessons
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div>
          <div className="auth-error" style={{ marginBottom: 16 }}>{errorMsg}</div>
          <button className="btn btn-o" onClick={() => router.push('/lessons')}>← Back to Lessons</button>
        </div>
      )}
    </div>
  );
}

export default function LessonLearnPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="modal-spinner" />
      </div>
    }>
      <LessonLearn />
    </Suspense>
  );
}
