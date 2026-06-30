'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, Quiz, SessionAnswerResponse, SessionStartResponse } from '../../../lib/api';
import { auth } from '../../../lib/auth';
import LessonPartVideoPanel from '../../../components/LessonPartVideoPanel';
import HistoryInteractiveImages from '../../../components/HistoryInteractiveImages';
import AvatarWidget from '../../../components/AvatarWidget';
import { unitVideoFilename } from '../../../lib/unit-video';
import { subjectPathFromChapter, nextLessonFromChapter } from '../../../lib/learning-config';
import { useLessonAudioPlayer } from '../../../hooks/useLessonAudioPlayer';
import { attachLipSync, dispatchSpeaking } from '../../../lib/lesson-audio';

// ── Types ─────────────────────────────────────────────────────────

type Phase = 'loading' | 'active' | 'answering' | 'hint' | 'remediation' | 'correct' | 'complete' | 'error';

interface Feedback {
  text: string;
  kind: 'hint' | 'remediation' | 'correct';
  hintCount?: number;
  nextAction?: string;
}

const LESSON_SECTION_HEADING = /^\d+\.\s*(Hook|Explanation|Historical Example|Real-Life Connection|Quick Recap|Transition to Quiz)\s*$/i;

function lessonParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p && !LESSON_SECTION_HEADING.test(p));
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
  const [maxUnlocked, setMaxUnlocked] = useState<0 | 1>(0);
  const [switching,   setSwitching]   = useState(false);
  const [answer,      setAnswer]      = useState('');
  const [answerIndex, setAnswerIndex] = useState(-1);
  const [feedback,    setFeedback]    = useState<Feedback | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [completeMsg, setCompleteMsg] = useState('');
  const [feedbackSpeaking, setFeedbackSpeaking] = useState(false);

  const feedbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const feedbackTokenRef = useRef(0);
  const sessionLoadIdRef = useRef(0);

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

  // ── lesson audio (Listen / Pause / Continue / Restart) ─────────

  const lessonAudio = useLessonAudioPlayer(chapter, teacherText);

  async function playFeedbackTTS(text: string) {
    if (!text.trim()) return;
    lessonAudio.pauseAndSave();
    feedbackTokenRef.current += 1;
    const token = feedbackTokenRef.current;
    feedbackAudioRef.current?.pause();
    setFeedbackSpeaking(true);
    try {
      const { audio_url } = await api.tts.speak(text);
      if (token !== feedbackTokenRef.current) return;
      const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
      const src = audio_url.startsWith('http') ? audio_url : `${base}${audio_url}`;
      const el = new Audio(src);
      feedbackAudioRef.current = el;
      let stopLipSync: (() => void) | null = null;
      el.onplaying = () => { if (!stopLipSync) stopLipSync = attachLipSync(el, text); };
      const stop = () => {
        setFeedbackSpeaking(false);
        stopLipSync?.();
        stopLipSync = null;
        dispatchSpeaking(false, 0);
      };
      el.onended = stop;
      el.onerror = stop;
      el.play().catch(stop);
    } catch {
      if (token === feedbackTokenRef.current) setFeedbackSpeaking(false);
    }
  }

  const avatarSpeaking = lessonAudio.isSpeaking || feedbackSpeaking;

  // ── session ───────────────────────────────────────────────────

  const isHistory = chapter.toLowerCase().includes('history');
  const videoFilename = isHistory ? unitVideoFilename(chapter) : null;
  const lessonsBackPath = subjectPathFromChapter(chapter);

  function applySession(res: SessionStartResponse) {
    setTeacherText(res.teacher_text ?? '');
    setQuiz(res.quiz ?? null);
    setUnitPart((res.unit_part ?? 0) as 0 | 1);
    setMaxUnlocked(Math.min(1, Math.max(0, res.max_unlocked_part ?? 0)) as 0 | 1);
    setFeedback(null);
    setAnswer('');
    setAnswerIndex(-1);
    setPhase('active');
  }

  async function goToPart(target: 0 | 1) {
    if (target > maxUnlocked || target === unitPart || switching) return;
    lessonAudio.pauseAndSave();
    setSwitching(true);
    setPhase('loading');
    try {
      let res = await api.session.switchPart(studentId, target);
      // Session was lost (e.g. server reload) — restart the chapter, then retry the switch.
      if ((res as { need_restart?: boolean }).need_restart) {
        await api.session.start(studentId, chapter, lessonTitle, lessonDesc);
        res = await api.session.switchPart(studentId, target);
      }
      if ((res as { error?: string }).error) {
        setErrorMsg((res as { error?: string }).error ?? 'Could not switch part');
        setPhase('error');
        return;
      }
      applySession(res);
      // Switching parts stays within the same unit, so unlock state must never regress.
      setMaxUnlocked(prev => Math.max(prev, res.max_unlocked_part ?? 0) as 0 | 1);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not switch part');
      setPhase('error');
    } finally {
      setSwitching(false);
    }
  }

  useEffect(() => {
    if (!chapter) { router.replace('/lessons'); return; }

    const loadId = ++sessionLoadIdRef.current;
    setPhase('loading');
    setErrorMsg('');

    api.session.start(studentId, chapter, lessonTitle, lessonDesc)
      .then(res => {
        if (loadId !== sessionLoadIdRef.current) return;
        if ((res as { error?: string }).error) {
          setErrorMsg((res as { error?: string }).error ?? 'Error');
          setPhase('error');
          return;
        }
        if (res.done) { setPhase('complete'); return; }
        applySession(res);
      })
      .catch(e => {
        if (loadId !== sessionLoadIdRef.current) return;
        setErrorMsg(e instanceof Error ? e.message : 'Failed to load lesson');
        setPhase('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  async function submitAnswer() {
    if (!answer.trim()) return;
    lessonAudio.pauseAndSave();
    setPhase('answering');
    try {
      const res: SessionAnswerResponse = await api.session.answer(
        studentId,
        answer,
        quiz?.options?.length ? answerIndex : undefined,
      );
      setAnswer('');
      setAnswerIndex(-1);
      if (res.correct) {
        const unlocked = Math.min(1, Math.max(maxUnlocked, res.max_unlocked_part ?? 0)) as 0 | 1;
        setMaxUnlocked(unlocked);
        if (res.message) setCompleteMsg(res.message);
        setFeedback({
          text: res.message ?? res.advance_text ?? 'Great job!',
          kind: 'correct',
          nextAction: res.next_action,
        });
        setPhase('correct');
      } else if (res.hint) {
        setFeedback({ text: res.hint, kind: 'hint', hintCount: res.hint_count });
        setPhase('hint');
        playFeedbackTTS(res.hint);
      } else if (res.remediation_text) {
        setFeedback({ text: res.remediation_text, kind: 'remediation' });
        setPhase('remediation');
        playFeedbackTTS(res.remediation_text);
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
    lessonAudio.pauseAndSave();
    if (action === 'all_complete' || action === 'lesson_complete') { setPhase('complete'); return; }
    setPhase('loading');
    try {
      let res: SessionStartResponse;
      if (action === 'continue_unit_part2') {
        res = await api.session.continuePart2(studentId);
        if ((res as { need_restart?: boolean }).need_restart) {
          await api.session.start(studentId, chapter, lessonTitle, lessonDesc);
          res = await api.session.continuePart2(studentId);
        }
      }
      else if (action === 'next_unit')      res = await api.session.nextUnit(studentId);
      else                                  res = await api.session.start(studentId, chapter);
      if (res.done || (res as { error?: string }).error) { setPhase('complete'); return; }
      applySession(res);
    } catch { setPhase('complete'); }
  }

  const paragraphs  = lessonParagraphs(teacherText);
  const canListen = paragraphs.length > 0;
  const nextLesson = nextLessonFromChapter(chapter);

  function goToNextLesson() {
    if (!nextLesson) return;
    lessonAudio.abort();
    const params = new URLSearchParams({
      chapter: nextLesson.chapter,
      lesson_title: nextLesson.title,
      lesson_desc: nextLesson.description,
    });
    router.push(`/lessons/learn?${params.toString()}`);
  }
  const hasFeedback = phase === 'hint' || phase === 'remediation' || phase === 'correct';
  const canRetry    = phase === 'hint' || phase === 'remediation';

  // ── render ────────────────────────────────────────────────────

  return (
    <div className="page-enter lesson-page">

      {/* Breadcrumb header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => { lessonAudio.abort(); router.push(lessonsBackPath); }}
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '5px 14px', color: 'var(--g2)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fb)' }}
          >
            ← Back to Lessons
          </button>
          <span style={{ fontSize: 13, color: 'var(--g5)' }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--vl)', fontWeight: 600 }}>{subjectLabel}</span>
          <span style={{ fontSize: 13, color: 'var(--g5)' }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--w)' }}>{unitLabel}</span>
        </div>

        {/* Part progress pills — click to switch unlocked parts.
            History has NO parts (one lesson = one unit), so pills are hidden. */}
        {!isHistory && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--g4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Part {unitPart + 1} of 2
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {([0, 1] as const).map(p => {
              const unlocked = p <= maxUnlocked;
              const active = p === unitPart;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={!unlocked || active || switching}
                  onClick={() => goToPart(p)}
                  title={unlocked ? `Go to Part ${p + 1}` : `Pass Part ${p} quiz to unlock`}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 99,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: unlocked && !active ? 'pointer' : 'default',
                    border: `1px solid ${active ? 'var(--vl)' : unlocked ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)'}`,
                    background: active ? 'rgba(91,33,245,.35)' : unlocked ? 'rgba(255,255,255,.06)' : 'transparent',
                    color: active ? 'var(--w)' : unlocked ? 'var(--g2)' : 'var(--g5)',
                    opacity: unlocked ? 1 : 0.5,
                  }}
                >
                  {unlocked ? '' : '🔒 '}Part {p + 1}
                </button>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* Loading / answering spinner */}
      {(phase === 'loading' || phase === 'answering') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 0' }}>
          <div className="modal-spinner" />
          <div style={{ marginTop: 18, color: 'var(--g3)', fontSize: 13 }}>
            {phase === 'answering' ? 'Checking your answer…' : 'Loading lesson…'}
          </div>
          {phase === 'loading' && (
            <div style={{ marginTop: 8, color: 'var(--g5)', fontSize: 11 }}>
              Connecting to the server…
            </div>
          )}
        </div>
      )}

      {/* Main lesson content */}
      {(phase === 'active' || hasFeedback) && (
        <div className="lesson-main">
          <div className="lesson-column">
          {/* Lesson video — one video per History lesson (no parts) */}
          {isHistory && (
            <LessonPartVideoPanel
              unitId={chapter}
              lessonTitle={unitLabel}
              videoFilename={videoFilename}
            />
          )}

          {/* Teaching content card */}
          <div className="lesson-card board-card" style={{ overflow: 'hidden', marginBottom: 32 }}>
            {/* Card top bar */}
            <div className="lesson-card__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0, fontSize: 16,
                  background: 'linear-gradient(135deg,#3D1FA8,#5B21F5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: avatarSpeaking ? '2px solid var(--mint)' : '2px solid rgba(255,255,255,.12)',
                  boxShadow: avatarSpeaking ? '0 0 14px rgba(0,229,160,.3)' : 'none',
                  transition: 'all .3s',
                }}>🧑‍🏫</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--vl)' }}>Jassmine · AI Tutor</div>
                  <div style={{ fontSize: 10, color: avatarSpeaking ? 'var(--mint)' : 'var(--g4)', transition: 'color .3s' }}>
                    {lessonAudio.audioState === 'loading'
                      ? 'Preparing audio…'
                      : lessonAudio.audioState === 'speaking'
                        ? 'Reading lesson aloud…'
                        : lessonAudio.audioState === 'transitioning'
                          ? 'Next part…'
                          : lessonAudio.audioState === 'paused'
                            ? 'Paused — pick up where you left off'
                            : lessonAudio.audioState === 'completed'
                              ? 'Lesson audio finished'
                              : 'AI-guided lesson'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {lessonAudio.audioState === 'idle' && (
                    <button
                      className="btn btn-o btn-sm"
                      onClick={lessonAudio.listen}
                      disabled={!canListen}
                    >
                      🔊 Listen
                    </button>
                  )}
                  {(lessonAudio.audioState === 'speaking'
                    || lessonAudio.audioState === 'loading'
                    || lessonAudio.audioState === 'transitioning') && (
                    <button className="btn btn-o btn-sm" onClick={lessonAudio.pause}>
                      ⏸ Pause
                    </button>
                  )}
                  {lessonAudio.audioState === 'paused' && (
                    <button className="btn btn-o btn-sm" onClick={lessonAudio.continuePlayback}>
                      ▶ Continue
                    </button>
                  )}
                  {lessonAudio.audioState === 'completed' && (
                    <button className="btn btn-o btn-sm" onClick={lessonAudio.listen} disabled={!canListen}>
                      🔊 Listen Again
                    </button>
                  )}
                  {(lessonAudio.audioState === 'speaking'
                    || lessonAudio.audioState === 'loading'
                    || lessonAudio.audioState === 'transitioning'
                    || lessonAudio.audioState === 'paused'
                    || lessonAudio.audioState === 'completed'
                    || lessonAudio.hasSavedProgress) && (
                    <button
                      className="btn btn-o btn-sm"
                      onClick={lessonAudio.restart}
                      style={{ opacity: 0.9 }}
                    >
                      ↺ Restart Lesson
                    </button>
                  )}
                </div>
                {lessonAudio.ttsError && (
                  <div style={{ fontSize: 10, color: '#ff7070', maxWidth: 220, textAlign: 'right', lineHeight: 1.3 }}>
                    {lessonAudio.ttsError}
                  </div>
                )}
              </div>
            </div>

            {/* Lesson whiteboard — text appears word-by-word as Jassmine speaks */}
            <div className="lesson-whiteboard">
              <div className="lesson-whiteboard__outer">
                <div className="lesson-whiteboard__inner">
                  <div className="lesson-whiteboard__surface">
                    {(() => {
                      const segs = lessonAudio.segments.length ? lessonAudio.segments : paragraphs;
                      const completed = lessonAudio.audioState === 'completed';
                      const cur = lessonAudio.currentSegment;
                      const started = cur >= 0 || completed;

                      if (!started) {
                        return (
                          <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            minHeight: 124, textAlign: 'center', color: '#8a93a3',
                            fontFamily: "var(--font-roboto),'Helvetica Neue',Arial,sans-serif",
                          }}>
                            <div style={{ fontSize: 34, marginBottom: 10 }}>📝</div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>
                              Press <strong style={{ color: '#5B21F5' }}>🔊 Listen</strong> and the lesson will appear here as Jassmine teaches.
                            </div>
                          </div>
                        );
                      }

                      return segs.map((seg, i) => {
                        if (!completed && i > cur) return null;
                        const isCurrent = !completed && i === cur;
                        let content = seg;
                        if (isCurrent) {
                          const words = seg.split(/\s+/).filter(Boolean);
                          const shown = Math.max(0, Math.min(words.length, Math.round(lessonAudio.segmentProgress * words.length)));
                          content = words.slice(0, shown).join(' ');
                        }
                        return (
                          <p key={i} style={{
                            fontFamily: "var(--font-roboto),'Helvetica Neue',Arial,sans-serif",
                            fontSize: 16.5,
                            lineHeight: 1.85,
                            color: '#1f2733',
                            margin: 0,
                            marginBottom: i < segs.length - 1 ? 16 : 0,
                            animation: 'wb-fade .25s ease',
                          }}>
                            {content}
                            {isCurrent && content.length > 0 && (
                              <span style={{ color: '#5B21F5', fontWeight: 700, animation: 'wb-caret 1s steps(1) infinite', marginLeft: 1 }}>▍</span>
                            )}
                          </p>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <style>{`@keyframes wb-fade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@keyframes wb-caret{0%,50%{opacity:1}50.01%,100%{opacity:0}}`}</style>

          {/* AI-generated interactive images — 2 per History lesson */}
          {isHistory && teacherText && (
            <HistoryInteractiveImages unitId={chapter} teacherText={teacherText} />
          )}

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
                        onClick={() => { if (phase !== 'correct') { setAnswer(opt); setAnswerIndex(idx); } }}
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
                    {feedback?.nextAction === 'all_complete' || feedback?.nextAction === 'lesson_complete' ? '🎉 Finish Lesson'
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
          </div>

          <aside className={`teacher-stage${avatarSpeaking ? ' teacher-stage--speaking' : ''}`}>
            <div className="avatar-wrapper">
              <AvatarWidget variant="lesson" />
            </div>
          </aside>
        </div>
      )}

      {/* Complete */}
      {phase === 'complete' && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 60, marginBottom: 18 }}>🎉</div>
          <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 26, marginBottom: 10 }}>Lesson Complete!</div>
          <div style={{ fontSize: 14, color: 'var(--g3)', marginBottom: 36 }}>
            {completeMsg || (
              <>Great work on <strong style={{ color: 'var(--vl)' }}>{subjectLabel}</strong>. Your progress has been saved.</>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {!isHistory && (
              <button className="btn btn-v" onClick={() => {
                setPhase('loading');
                api.session.start(studentId, chapter)
                  .then(r => { if (!r.done) applySession(r); else setPhase('complete'); })
                  .catch(() => setPhase('complete'));
              }}>
                Start Next Unit
              </button>
              )}
              <button className="btn btn-o" onClick={() => { lessonAudio.abort(); router.push(lessonsBackPath); }}>
                ← Back to Lessons
              </button>
            </div>
            {nextLesson && (
              <button className="btn btn-v" onClick={goToNextLesson} style={{ minWidth: 260 }}>
                Next Lesson: {nextLesson.title} →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div>
          <div className="auth-error" style={{ marginBottom: 16 }}>{errorMsg}</div>
          <button className="btn btn-o" onClick={() => router.push(lessonsBackPath)}>← Back to Lessons</button>
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
