'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ListeningActivity, Quiz, SessionAnswerResponse, SessionStartResponse } from '../../../lib/api';
import { auth } from '../../../lib/auth';
import LessonPartVideoPanel from '../../../components/LessonPartVideoPanel';
import HistoryInteractiveImages from '../../../components/HistoryInteractiveImages';
import AvatarWidget from '../../../components/AvatarWidget';
import { unitVideoFilename } from '../../../lib/unit-video';
import { subjectPathFromChapter, nextLessonFromChapter } from '../../../lib/learning-config';
import { useLessonAudioPlayer } from '../../../hooks/useLessonAudioPlayer';
import { attachLipSync, dispatchSpeaking, prepareAudioElement, resolveTtsAudioUrl, verifyTtsAudioUrl } from '../../../lib/lesson-audio';
import LessonSectionNav from '../../../components/LessonSectionNav';
import PronunciationRecorder from '../../../components/PronunciationRecorder';
import {
  clampPartIndex,
  lastPartIndex,
  sectionDef,
  usesLanguageSections,
} from '../../../lib/lesson-sections';
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react';

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
  const resumeSectionRaw = params.get('unit_part') ?? params.get('section');
  const user      = auth.getUser();
  const studentId = user?.user_id ?? 'student';

  const [phase,       setPhase]       = useState<Phase>('loading');
  const [teacherText, setTeacherText] = useState('');
  const [listening,   setListening]   = useState<ListeningActivity | null>(null);
  const [quiz,        setQuiz]        = useState<Quiz | null>(null);
  const [unitPart,    setUnitPart]    = useState(0);
  const [maxUnlocked, setMaxUnlocked] = useState(0);
  const [switching,   setSwitching]   = useState(false);
  const [answer,      setAnswer]      = useState('');
  const [answerIndex, setAnswerIndex] = useState(-1);
  const [feedback,    setFeedback]    = useState<Feedback | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [completeMsg, setCompleteMsg] = useState('');
  const [feedbackSpeaking, setFeedbackSpeaking] = useState(false);
  const [nextLesson, setNextLesson] = useState<{ chapter: string; title: string; description: string } | null>(null);

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

  const isListeningMode = quiz?.type === 'listening';
  const isSpeakingMode = quiz?.type === 'speaking';
  const storyText = (listening?.transcript || listening?.narration_text || teacherText).trim();
  const lessonAudio = useLessonAudioPlayer(chapter, isListeningMode ? storyText : teacherText);

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
      let src = resolveTtsAudioUrl(audio_url, base);
      if (await verifyTtsAudioUrl(src) === 'missing') {
        console.warn('[lesson-audio] feedback audio 404 — regenerating', src);
        const regen = await api.tts.speak(text);
        if (token !== feedbackTokenRef.current) return;
        src = resolveTtsAudioUrl(regen.audio_url, base);
      }
      const el = await prepareAudioElement(src);
      feedbackAudioRef.current = el;
      let stopLipSync: (() => void) | null = attachLipSync(el, text);
      await el.play();
      const stop = () => {
        setFeedbackSpeaking(false);
        stopLipSync?.();
        stopLipSync = null;
        dispatchSpeaking(false, 0);
      };
      el.onended = stop;
      el.onerror = () => {
        console.error('[lesson-audio] feedback playback error', {
          src,
          code: el.error?.code,
          message: el.error?.message,
        });
        stop();
      };
    } catch (err) {
      console.error('[lesson-audio] feedback TTS failed', err);
      if (token === feedbackTokenRef.current) setFeedbackSpeaking(false);
    }
  }

  const avatarSpeaking = lessonAudio.isSpeaking || feedbackSpeaking;

  // ── session ───────────────────────────────────────────────────

  const isHistory = chapter.toLowerCase().includes('history');
  const isLanguageLesson = usesLanguageSections(chapter);
  const videoFilename = isHistory ? unitVideoFilename(chapter) : null;
  const lessonsBackPath = subjectPathFromChapter(chapter);
  const currentSection = isLanguageLesson ? sectionDef(unitPart) : null;

  function applySession(res: SessionStartResponse) {
    setTeacherText(res.teacher_text ?? '');
    setListening(res.listening ?? null);
    setQuiz(res.quiz ?? null);
    setUnitPart(clampPartIndex(chapter, res.unit_part ?? 0));
    setMaxUnlocked(clampPartIndex(chapter, res.max_unlocked_part ?? 0));
    setFeedback(null);
    setAnswer('');
    setAnswerIndex(-1);
    setPhase('active');
  }

  async function goToPart(target: number) {
    const clamped = clampPartIndex(chapter, target);
    if (clamped > maxUnlocked || clamped === unitPart || switching) return;
    lessonAudio.pauseAndSave();
    setSwitching(true);
    setPhase('loading');
    try {
      let res = await api.session.switchPart(studentId, clamped);
      // Session was lost (e.g. server reload) — restart the chapter, then retry the switch.
      if ((res as { need_restart?: boolean }).need_restart) {
        await api.session.start(studentId, chapter, lessonTitle, lessonDesc);
        res = await api.session.switchPart(studentId, clamped);
      }
      if ((res as { error?: string }).error) {
        setErrorMsg((res as { error?: string }).error ?? 'Could not switch part');
        setPhase('error');
        return;
      }
      applySession(res);
      // Switching parts stays within the same unit, so unlock state must never regress.
      setMaxUnlocked(prev => clampPartIndex(chapter, Math.max(prev, res.max_unlocked_part ?? 0)));
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
      .then(async res => {
        if (loadId !== sessionLoadIdRef.current) return;
        if ((res as { error?: string }).error) {
          setErrorMsg((res as { error?: string }).error ?? 'Error');
          setPhase('error');
          return;
        }
        if (res.done) { setPhase('complete'); return; }
        applySession(res);

        const targetSection = resumeSectionRaw != null
          ? clampPartIndex(chapter, parseInt(resumeSectionRaw, 10))
          : null;
        if (targetSection != null && !Number.isNaN(targetSection) && targetSection !== (res.unit_part ?? 0)) {
          try {
            let switched = await api.session.switchPart(studentId, targetSection);
            if ((switched as { need_restart?: boolean }).need_restart) {
              await api.session.start(studentId, chapter, lessonTitle, lessonDesc);
              switched = await api.session.switchPart(studentId, targetSection);
            }
            if (!(switched as { error?: string }).error) {
              applySession(switched);
            }
          } catch {
            /* keep session at default section */
          }
        }
      })
      .catch(e => {
        if (loadId !== sessionLoadIdRef.current) return;
        setErrorMsg(e instanceof Error ? e.message : 'Failed to load lesson');
        setPhase('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  useEffect(() => {
    if (!chapter) return;
    api.books.lessonNav(chapter)
      .then(res => {
        if (res.next_lesson) {
          setNextLesson({
            chapter: res.next_lesson.chapter,
            title: res.next_lesson.title,
            description: res.next_lesson.description,
          });
        } else {
          setNextLesson(nextLessonFromChapter(chapter));
        }
      })
      .catch(() => setNextLesson(nextLessonFromChapter(chapter)));
  }, [chapter]);

  async function submitAnswer(audioBase64?: string) {
    const isSpeaking = quiz?.type === 'speaking';
    if (!isSpeaking && !answer.trim()) return;
    if (isSpeaking && !audioBase64) return;
    lessonAudio.pauseAndSave();
    setPhase('answering');
    try {
      const res: SessionAnswerResponse = await api.session.answer(
        studentId,
        isSpeaking ? (answer.trim() || quiz?.question || '') : answer,
        quiz?.options?.length ? answerIndex : undefined,
        audioBase64,
      );
      setAnswer('');
      setAnswerIndex(-1);
      if (res.correct) {
        const unlocked = clampPartIndex(chapter, Math.max(maxUnlocked, res.max_unlocked_part ?? 0));
        setMaxUnlocked(unlocked);
        if (res.message) setCompleteMsg(res.message);

        if (res.next_action === 'listening_next_question') {
          setQuiz(res.quiz ?? null);
          if (res.listening) setListening(res.listening);
          setFeedback({
            text: res.evaluation?.feedback ?? res.advance_text ?? 'Correct!',
            kind: 'correct',
            nextAction: 'listening_next_question',
          });
          setPhase('active');
          return;
        }

        if (res.next_action === 'listening_activity') {
          setTeacherText(res.teacher_text ?? res.listening?.transcript ?? '');
          if (res.listening) setListening(res.listening);
          setQuiz(res.quiz ?? null);
          setFeedback({
            text: res.message ?? 'Now listen to the story and answer the questions.',
            kind: 'correct',
            nextAction: 'listening_activity',
          });
          setPhase('active');
          return;
        }

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
    if (action === 'listening_next_question' || action === 'listening_activity') {
      setFeedback(null);
      setPhase('active');
      return;
    }
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

  const paragraphs  = lessonParagraphs(isListeningMode ? storyText : teacherText);
  const canListen = paragraphs.length > 0;
  const listeningTitle = listening?.title;
  const listeningQuestionLabel = quiz?.type === 'listening' && quiz.listening_question_total
    ? `Question ${(quiz.listening_question_index ?? 0) + 1} of ${quiz.listening_question_total}`
    : null;

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

  const audioStatusText =
    lessonAudio.audioState === 'loading'
      ? 'Preparing audio…'
      : lessonAudio.audioState === 'speaking'
        ? (isListeningMode ? 'Reading the story aloud…' : 'Reading lesson aloud…')
        : lessonAudio.audioState === 'transitioning'
          ? 'Next part…'
          : lessonAudio.audioState === 'paused'
            ? 'Paused — pick up where you left off'
            : lessonAudio.audioState === 'completed'
              ? 'Lesson audio finished'
              : 'Press Read Aloud to start';

  const segsForProgress = lessonAudio.segments.length ? lessonAudio.segments : paragraphs;
  const lessonProgressPct = (() => {
    if (!segsForProgress.length) return 0;
    if (lessonAudio.audioState === 'completed') return 100;
    if (lessonAudio.currentSegment < 0) return 0;
    const base = lessonAudio.currentSegment / segsForProgress.length;
    const part = lessonAudio.segmentProgress / segsForProgress.length;
    return Math.min(100, Math.round((base + part) * 100));
  })();

  const learningCardTitle = (() => {
    if (isListeningMode) return 'Listening Time';
    if (isSpeakingMode) return 'Pronunciation Time';
    if (isLanguageLesson && currentSection) {
      if (currentSection.key === 'grammar') return 'Grammar Time';
      if (currentSection.key === 'reading') return 'Reading Time';
    }
    return 'Learning Time';
  })();

  const tutorBubbleText =
    hasFeedback && feedback?.kind === 'hint'
      ? "Here's a hint — read it below!"
      : hasFeedback && feedback?.kind === 'correct'
        ? 'Great job! You got it!'
        : quiz && phase === 'active'
          ? "Let's think together! What do you think is the best answer?"
          : avatarSpeaking
            ? audioStatusText
            : "I'm here to help you learn!";

  const continueLabel = (() => {
    if (feedback?.nextAction === 'all_complete' || feedback?.nextAction === 'lesson_complete') {
      return 'Finish Lesson';
    }
    if (feedback?.nextAction === 'continue_unit_part2') {
      if (isLanguageLesson) {
        const next = sectionDef(unitPart + 1);
        return `Continue to ${next.title}`;
      }
      return 'Continue to Part 2';
    }
    return 'Next';
  })();

  // ── render ────────────────────────────────────────────────────

  return (
    <div className="page-enter lesson-page">

      {/* Breadcrumb header */}
      <div className="lesson-page__header">
        <div className="lesson-breadcrumb">
          <button
            type="button"
            className="lesson-breadcrumb__back"
            onClick={() => { lessonAudio.abort(); router.push(lessonsBackPath); }}
          >
            <ChevronLeft size={16} aria-hidden />
            Back to Lessons
          </button>
          <span className="lesson-breadcrumb__sep">/</span>
          <span className="lesson-breadcrumb__subject">{subjectLabel}</span>
          <span className="lesson-breadcrumb__sep">/</span>
          <span className="lesson-breadcrumb__unit">{unitLabel}</span>
        </div>

        {!isHistory && (
          <LessonSectionNav
            chapterId={chapter}
            unitPart={unitPart}
            maxUnlocked={maxUnlocked}
            switching={switching}
            onSelect={goToPart}
          />
        )}
      </div>

      {/* Loading / answering spinner */}
      {(phase === 'loading' || phase === 'answering') && (
        <div className="lesson-loading">
          <div className="modal-spinner" />
          <div className="lesson-loading__text">
            {phase === 'answering' ? 'Checking your answer…' : 'Loading lesson…'}
          </div>
          {phase === 'loading' && (
            <div className="lesson-loading__sub">Connecting to the server…</div>
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
          <div className="lesson-card">
            <div className="lesson-card__header">
              <div className="lesson-card__title-row">
                <div className={`lesson-card__icon${avatarSpeaking ? ' lesson-card__icon--speaking' : ''}`}>
                  <BookOpen size={22} aria-hidden />
                </div>
                <div>
                  <div className="lesson-card__title">
                    {learningCardTitle}
                  </div>
                  <div className="lesson-card__subtitle">{audioStatusText}</div>
                </div>
              </div>
              <div className="lesson-card__controls">
                <div className="lesson-card__control-row">
                  {lessonAudio.audioState === 'idle' && (
                    <button
                      type="button"
                      className="lesson-ctrl-btn"
                      onClick={lessonAudio.listen}
                      disabled={!canListen}
                    >
                      <Volume2 size={16} aria-hidden />
                      Read Aloud
                    </button>
                  )}
                  {(lessonAudio.audioState === 'speaking'
                    || lessonAudio.audioState === 'loading'
                    || lessonAudio.audioState === 'transitioning') && (
                    <button type="button" className="lesson-ctrl-btn" onClick={lessonAudio.pause}>
                      <Pause size={16} aria-hidden />
                      Pause
                    </button>
                  )}
                  {lessonAudio.audioState === 'paused' && (
                    <button type="button" className="lesson-ctrl-btn" onClick={lessonAudio.continuePlayback}>
                      <Play size={16} aria-hidden />
                      Continue
                    </button>
                  )}
                  {lessonAudio.audioState === 'completed' && (
                    <button
                      type="button"
                      className="lesson-ctrl-btn"
                      onClick={lessonAudio.listen}
                      disabled={!canListen}
                    >
                      <Volume2 size={16} aria-hidden />
                      Read Again
                    </button>
                  )}
                  {(lessonAudio.audioState === 'speaking'
                    || lessonAudio.audioState === 'loading'
                    || lessonAudio.audioState === 'transitioning'
                    || lessonAudio.audioState === 'paused'
                    || lessonAudio.audioState === 'completed'
                    || lessonAudio.hasSavedProgress) && (
                    <button type="button" className="lesson-ctrl-btn" onClick={lessonAudio.restart}>
                      <RotateCcw size={16} aria-hidden />
                      Restart
                    </button>
                  )}
                </div>
                {lessonAudio.ttsError && (
                  <div style={{ fontSize: 12, color: 'var(--color-error-text)', maxWidth: 220, textAlign: 'right', lineHeight: 1.3 }}>
                    {lessonAudio.ttsError}
                  </div>
                )}
              </div>
            </div>

            {isListeningMode && listeningTitle && (
              <div className="lesson-listening-banner">
                <div className="lesson-listening-banner__label">Listening Activity</div>
                <div className="lesson-listening-banner__title">{listeningTitle}</div>
              </div>
            )}

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
                          <div className="lesson-reading-empty">
                            <div className="lesson-reading-empty__icon">
                              <BookOpen size={26} aria-hidden />
                            </div>
                            <div className="lesson-reading-empty__text">
                              Press <strong>Read Aloud</strong> and the lesson will appear here as Jasmine teaches.
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
                          let shown = Math.floor(lessonAudio.segmentProgress * words.length);
                          // First word appears with audio — never wait for a later progress tick.
                          if (
                            shown === 0 &&
                            words.length > 0 &&
                            (lessonAudio.audioState === 'speaking' || lessonAudio.segmentProgress > 0)
                          ) {
                            shown = 1;
                          }
                          content = words.slice(0, shown).join(' ');
                        }
                        return (
                          <p key={i} className="lesson-reading-p">
                            {content}
                            {isCurrent && content.length > 0 && (
                              <span className="lesson-reading-caret">▍</span>
                            )}
                          </p>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="lesson-progress-footer">
              <div className="lesson-progress-footer__row">
                <BookOpen size={18} className="lesson-progress-footer__icon" aria-hidden />
                <span className="lesson-progress-footer__text">
                  {lessonProgressPct >= 100
                    ? "Great job! You've finished reading."
                    : "Great job! You're making progress"}
                </span>
              </div>
              <div className="lesson-progress-bar" role="progressbar" aria-valuenow={lessonProgressPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="lesson-progress-bar__fill" style={{ width: `${lessonProgressPct}%` }} />
              </div>
            </div>
          </div>

          {/* AI-generated interactive images — 2 per History lesson */}
          {isHistory && teacherText && !isListeningMode && (
            <HistoryInteractiveImages unitId={chapter} teacherText={teacherText} />
          )}

          {/* Quiz section */}
          {quiz && (
            <div className="lesson-quiz-section">
              <div className="lesson-quiz-divider">
                <div className="lesson-quiz-divider__line" />
                <span className="lesson-quiz-divider__label">
                  {isListeningMode ? 'Listening Questions' : 'Quiz Time'}
                </span>
                <div className="lesson-quiz-divider__line" />
              </div>

              <div className="lesson-quiz-card">
                <div className="lesson-quiz-card__meta">
                  {listeningQuestionLabel ?? 'Question'}
                </div>
                <div className="lesson-quiz-card__question">{quiz.question}</div>
              </div>

              {quiz.options && quiz.options.length > 0 ? (
                <div className="lesson-quiz-options">
                  {quiz.options.map((opt, idx) => {
                    const sel = answer === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => { if (phase !== 'correct') { setAnswer(opt); setAnswerIndex(idx); } }}
                        disabled={phase === 'correct'}
                        className={['lesson-quiz-option', sel ? 'lesson-quiz-option--selected' : ''].filter(Boolean).join(' ')}
                      >
                        <span className="lesson-quiz-option__badge">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="lesson-quiz-option__text">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              ) : isSpeakingMode ? (
                <PronunciationRecorder
                  sentence={quiz.question}
                  disabled={phase === 'correct'}
                  onRecorded={b64 => submitAnswer(b64)}
                />
              ) : (
                <div className="lesson-quiz-open">
                  <textarea
                    rows={4}
                    className="field-input"
                    placeholder="Type your answer here…"
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitAnswer(); }}
                    style={{ resize: 'vertical', display: 'block', width: '100%' }}
                    disabled={phase === 'correct'}
                  />
                  <div className="lesson-quiz-open__hint">Ctrl + Enter to submit</div>
                </div>
              )}

              {hasFeedback && feedback && (
                <div className={`lesson-feedback lesson-feedback--${feedback.kind}`}>
                  <div className="lesson-feedback__label">
                    {feedback.kind === 'correct'
                      ? 'Correct!'
                      : feedback.kind === 'hint'
                        ? `Hint ${(feedback.hintCount ?? 0) + 1}`
                        : 'Let me explain that again'}
                  </div>
                  <div className="lesson-feedback__text">{feedback.text}</div>
                </div>
              )}

              {phase === 'correct' ? (
                <button type="button" className="lesson-submit-btn" onClick={handleNext}>
                  {continueLabel}
                  <ArrowRight size={18} aria-hidden />
                </button>
              ) : !isSpeakingMode ? (
                <button
                  type="button"
                  className="lesson-submit-btn"
                  onClick={() => submitAnswer()}
                  disabled={!answer.trim()}
                >
                  {canRetry ? 'Try Again' : 'Submit Answer'}
                  <ArrowRight size={18} aria-hidden />
                </button>
              ) : null}
            </div>
          )}

          {!quiz && phase === 'active' && (
            <div className="lesson-continue-wrap">
              <button type="button" className="lesson-submit-btn" onClick={handleNext}>
                Continue
                <ArrowRight size={18} aria-hidden />
              </button>
            </div>
          )}
          </div>

          <aside className={`teacher-stage${avatarSpeaking ? ' teacher-stage--speaking' : ''}`}>
            <p className="lesson-tutor__greeting">
              Hi! I&apos;m Jasmine — Your AI Learning Buddy
            </p>
            <div className="lesson-tutor__bubble">{tutorBubbleText}</div>
            <div
              className="avatar-wrapper"
              style={{ width: '100%', maxWidth: 420, height: 400, minHeight: 400 }}
            >
              <AvatarWidget variant="lesson" />
            </div>
          </aside>
        </div>
      )}

      {/* Complete */}
      {phase === 'complete' && (
        <div className="lesson-complete">
          <div className="lesson-complete__emoji" aria-hidden>🎉</div>
          <div className="lesson-complete__title">Lesson Complete!</div>
          <div className="lesson-complete__msg">
            {completeMsg || (
              <>Great work on <strong>{subjectLabel}</strong>. Your progress has been saved.</>
            )}
          </div>
          <div className="lesson-complete__actions">
            <div className="lesson-complete__row">
              {!isHistory && (
              <button
                type="button"
                className="btn btn-v"
                onClick={() => {
                  setPhase('loading');
                  api.session.start(studentId, chapter)
                    .then(r => { if (!r.done) applySession(r); else setPhase('complete'); })
                    .catch(() => setPhase('complete'));
                }}
              >
                Start Next Unit
              </button>
              )}
              <button type="button" className="btn btn-o" onClick={() => { lessonAudio.abort(); router.push(lessonsBackPath); }}>
                Back to Lessons
              </button>
            </div>
            {nextLesson && (
              <button type="button" className="btn btn-v" onClick={goToNextLesson} style={{ minWidth: 260 }}>
                Next Lesson: {nextLesson.title}
                <ArrowRight size={16} style={{ marginLeft: 6 }} aria-hidden />
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
