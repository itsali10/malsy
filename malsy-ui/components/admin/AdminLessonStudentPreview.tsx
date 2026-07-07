'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi, AdminPreviewSessionResponse } from '../../lib/admin-api';
import type { ListeningActivity, Quiz } from '../../lib/api';
import LessonPartVideoPanel from '../LessonPartVideoPanel';
import HistoryInteractiveImages from '../HistoryInteractiveImages';
import AvatarWidget from '../AvatarWidget';
import LessonSectionNav from '../LessonSectionNav';
import { unitVideoFilename } from '../../lib/unit-video';
import { isHistorySubject } from '../../lib/history-subject';
import { useLessonAudioPlayer } from '../../hooks/useLessonAudioPlayer';
import {
  clampPartIndex,
  sectionDef,
  usesLanguageSections,
} from '../../lib/lesson-sections';
import {
  BookOpen,
  ChevronLeft,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react';

const LESSON_SECTION_HEADING = /^\d+\.\s*(Hook|Explanation|Historical Example|Real-Life Connection|Quick Recap|Transition to Quiz)\s*$/i;

function lessonParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p && !LESSON_SECTION_HEADING.test(p));
}

function AdminLessonPreviewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const chapter = params.get('chapter') ?? '';
  const lessonTitle = params.get('title') ?? '';
  const backHref = params.get('back') ?? '/admin/books';

  const [phase, setPhase] = useState<'loading' | 'active' | 'error'>('loading');
  const [teacherText, setTeacherText] = useState('');
  const [listening, setListening] = useState<ListeningActivity | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [unitPart, setUnitPart] = useState(0);
  const [maxUnlocked, setMaxUnlocked] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const sessionLoadIdRef = useRef(0);

  const isHistory = isHistorySubject({
    type: null,
    name: subjectLabel,
    subjectKey: chapter.split(':')[0],
    chapterId: chapter,
  });
  const isLanguageLesson = usesLanguageSections(chapter);
  const videoFilename = isHistory ? unitVideoFilename(chapter) : null;
  const currentSection = isLanguageLesson ? sectionDef(unitPart) : null;

  const [subjectLabel, unitLabel] = (() => {
    const cap = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (lessonTitle) {
      const p = chapter.split(':');
      return [cap(p[0] ?? 'Lesson'), lessonTitle];
    }
    const p = chapter.split(':');
    return [cap(p[0] ?? 'Lesson'), cap(p[1] ?? chapter)];
  })();

  const isListeningMode = quiz?.type === 'listening';
  const storyText = (listening?.transcript || listening?.narration_text || teacherText).trim();
  const lessonAudio = useLessonAudioPlayer(chapter, isListeningMode ? storyText : teacherText);

  function applySession(res: AdminPreviewSessionResponse) {
    setTeacherText(res.teacher_text ?? '');
    setListening((res.listening as ListeningActivity) ?? null);
    setQuiz((res.quiz as Quiz) ?? null);
    setUnitPart(clampPartIndex(chapter, res.unit_part ?? 0));
    setMaxUnlocked(clampPartIndex(chapter, res.max_unlocked_part ?? 0));
    setPhase('active');
  }

  async function goToPart(target: number) {
    const clamped = clampPartIndex(chapter, target);
    if (clamped === unitPart || switching) return;
    lessonAudio.pauseAndSave();
    setSwitching(true);
    setPhase('loading');
    try {
      const res = await adminApi.lessons.switchPreviewPart(chapter, clamped);
      applySession(res);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not switch part');
      setPhase('error');
    } finally {
      setSwitching(false);
    }
  }

  useEffect(() => {
    if (!chapter) {
      router.replace('/admin/books');
      return;
    }

    const loadId = ++sessionLoadIdRef.current;
    setPhase('loading');
    setErrorMsg('');

    adminApi.lessons
      .previewSession(chapter, { lessonTitle })
      .then((res) => {
        if (loadId !== sessionLoadIdRef.current) return;
        if (res.error) {
          setErrorMsg(res.error);
          setPhase('error');
          return;
        }
        applySession(res);
      })
      .catch((e) => {
        if (loadId !== sessionLoadIdRef.current) return;
        setErrorMsg(e instanceof Error ? e.message : 'Failed to load preview');
        setPhase('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  const paragraphs = lessonParagraphs(isListeningMode ? storyText : teacherText);
  const canListen = paragraphs.length > 0;
  const listeningTitle = listening?.title;

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
    if (isLanguageLesson && currentSection) {
      if (currentSection.key === 'grammar') return 'Grammar Time';
      if (currentSection.key === 'reading') return 'Reading Time';
      if (currentSection.key === 'pronunciation') return 'Pronunciation Time';
      if (currentSection.key === 'listening') return 'Listening Time';
    }
    return 'Learning Time';
  })();

  const avatarSpeaking = lessonAudio.isSpeaking;

  return (
    <div className="page-enter lesson-page">
      <div
        style={{
          marginBottom: 16,
          padding: '10px 14px',
          borderRadius: 12,
          background: 'rgba(91,33,245,.12)',
          border: '1px solid rgba(91,33,245,.25)',
          fontSize: 13,
          color: 'var(--vl)',
        }}
      >
        <strong>Admin preview</strong> — same lesson rendering as students. No progress, schedules, or student data are modified.
      </div>

      <div className="lesson-page__header">
        <div className="lesson-breadcrumb">
          <Link href={backHref} className="lesson-breadcrumb__back" onClick={() => lessonAudio.abort()}>
            <ChevronLeft size={16} aria-hidden />
            Back to Student Content
          </Link>
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

      {(phase === 'loading' || switching) && (
        <div className="lesson-loading">
          <div className="modal-spinner" />
          <div className="lesson-loading__text">Loading lesson preview…</div>
          <div className="lesson-loading__sub">Generating content via the student lesson pipeline</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="card" style={{ padding: 24, color: 'var(--coral)', marginTop: 16 }}>
          {errorMsg || 'Could not load preview'}
        </div>
      )}

      {phase === 'active' && !switching && (
        <div className="lesson-main">
          <div className="lesson-column">
            {isHistory && (
              <LessonPartVideoPanel
                unitId={chapter}
                lessonTitle={unitLabel}
                videoFilename={videoFilename}
              />
            )}

            <div className="lesson-card">
              <div className="lesson-card__header">
                <div className="lesson-card__title-row">
                  <div className={`lesson-card__icon${avatarSpeaking ? ' lesson-card__icon--speaking' : ''}`}>
                    <BookOpen size={22} aria-hidden />
                  </div>
                  <div>
                    <div className="lesson-card__title">{learningCardTitle}</div>
                    <div className="lesson-card__subtitle">{audioStatusText}</div>
                  </div>
                </div>
                <div className="lesson-card__controls">
                  <div className="lesson-card__control-row">
                    {lessonAudio.audioState === 'idle' && (
                      <button type="button" className="lesson-ctrl-btn" onClick={lessonAudio.listen} disabled={!canListen}>
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
                      <button type="button" className="lesson-ctrl-btn" onClick={lessonAudio.listen} disabled={!canListen}>
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
                      ? "Preview complete — students see this same flow"
                      : 'Progress preview (read-only)'}
                  </span>
                </div>
                <div
                  className="lesson-progress-bar"
                  role="progressbar"
                  aria-valuenow={lessonProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="lesson-progress-bar__fill" style={{ width: `${lessonProgressPct}%` }} />
                </div>
              </div>
            </div>

            {isHistory && teacherText && !isListeningMode && (
              <HistoryInteractiveImages unitId={chapter} teacherText={teacherText} />
            )}

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
                  <div className="lesson-quiz-card__meta">Preview — answers not submitted</div>
                  <div className="lesson-quiz-card__question">{quiz.question}</div>
                </div>
                {quiz.options && quiz.options.length > 0 && (
                  <div className="lesson-quiz-options">
                    {quiz.options.map((opt, idx) => (
                      <div key={opt} className="lesson-quiz-option">
                        <span className="lesson-quiz-option__badge">{String.fromCharCode(65 + idx)}</span>
                        <span className="lesson-quiz-option__text">{opt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className={`teacher-stage${avatarSpeaking ? ' teacher-stage--speaking' : ''}`}>
            <p className="lesson-tutor__greeting">Hi! I&apos;m Jasmine — Your AI Learning Buddy</p>
            <div className="lesson-tutor__bubble">
              {quiz ? "Here's the quiz students will answer after this section." : audioStatusText}
            </div>
            <div className="avatar-wrapper" style={{ width: '100%', maxWidth: 420, height: 400, minHeight: 400 }}>
              <AvatarWidget variant="lesson" />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function AdminLessonStudentPreview() {
  return (
    <Suspense fallback={<div className="modal-spinner" style={{ margin: '48px auto' }} />}>
      <AdminLessonPreviewInner />
    </Suspense>
  );
}
