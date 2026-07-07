'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Lesson } from '../../../../lib/learning-config';
import { api, type HistoryLessonsResponse } from '../../../../lib/api';
import { auth } from '../../../../lib/auth';
import LanguageBookView from '../../../../components/student/LanguageBookView';
import { usePortalSubjects, type PortalSubject } from '../../../../lib/studentPortalSubjects';
import { isLanguageBook, mapBookLessonsResponse, type CatalogLesson } from '../../../../lib/studentBookCatalog';
import {
  BookLessonProgressState,
  getLessonNumber,
  getCurrentLessonNumber,
  isLessonUnlocked,
  isLessonCompleted,
  isLessonLocked,
  LOCKED_LESSON_MESSAGE,
  emptyLessonProgress,
} from '../../../../lib/lessonProgress';
import { isHistorySubject } from '../../../../lib/history-subject';

// ── Shared card styles ─────────────────────────────────────────────

function cardClass(selected: boolean, locked?: boolean): string {
  return [
    'picker-card',
    selected ? 'picker-card--selected' : '',
    locked ? 'picker-card--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// ── Detail sidebar ─────────────────────────────────────────────────

function DetailPanel({
  lesson,
  sectionKey,
  onStartAI,
  completed,
  locked,
  buttonLabel = 'Start with AI Teacher →',
  showLessonVideo = false,
}: {
  lesson: CatalogLesson | null;
  sectionKey: string;
  onStartAI: () => void;
  completed?: boolean;
  locked?: boolean;
  buttonLabel?: string;
  showLessonVideo?: boolean;
}) {
  if (!lesson) {
    return (
      <div style={sideboxStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)', marginBottom: 8 }}>Lesson Panel</div>
        <div style={{ fontSize: 12, color: 'var(--g3)', lineHeight: 1.6 }}>Select any lesson to view details and start learning.</div>
      </div>
    );
  }

  return (
    <div style={sideboxStyle}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--g4)', marginBottom: 6 }}>
        {sectionKey.toUpperCase()} · LESSON {lesson.id}
        {completed && <span style={{ marginLeft: 8, color: 'var(--mint)' }}>✓ Done</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--w)', marginBottom: 8, lineHeight: 1.4 }}>{lesson.name}</div>
      <div style={{ fontSize: 12, color: 'var(--g3)', marginBottom: 20, lineHeight: 1.6 }}>{lesson.description}</div>

      {locked ? (
        <div style={{
          fontSize: 12,
          color: 'var(--g3)',
          lineHeight: 1.6,
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,.08)',
          background: 'rgba(255,255,255,.03)',
          marginBottom: 16,
        }}>
          {LOCKED_LESSON_MESSAGE}
        </div>
      ) : (
        <button
          className="auth-submit"
          onClick={onStartAI}
          style={{ marginBottom: 16, padding: '11px 16px', fontSize: 13 }}
        >
          {buttonLabel}
        </button>
      )}

      {showLessonVideo && !locked && lesson && (
        <div style={{ fontSize: 11, color: 'var(--g4)', marginTop: 8, lineHeight: 1.5 }}>
          Open the lesson to watch or generate its video.
        </div>
      )}
    </div>
  );
}

const sideboxStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 14,
  padding: '22px 20px',
  position: 'sticky',
  top: 24,
};

// ── Video section (with Sora generation) ──────────────────────────

interface VideoState {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  videoUrl: string | null;
  script: string | null;
  error: string | null;
}

function VideoSection({
  title, icon, subject, sectionKey,
  lessons,
}: {
  title: string;
  icon: string;
  subject: string;
  sectionKey: string;
  lessons: Lesson[];
}) {
  const [vs, setVs] = useState<VideoState>({ status: 'idle', videoUrl: null, script: null, error: null });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const outputFilename = `${subject}_${sectionKey}.mp4`;

  // Build lesson content from config
  const lessonTitle   = `${title} — ${lessons.map(l => l.name).join(', ')}`;
  const lessonDesc    = lessons.map(l => `${l.name}: ${l.description}`).join('. ');

  const pollStatus = useCallback((jobId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/lesson-video-status/${jobId}`);
        const d = await r.json() as { status: string; videoUrl?: string; script?: string; error?: string };
        if (d.status === 'generating') {
          setVs(p => ({ ...p, status: 'generating' }));
          pollStatus(jobId);
        } else if (d.status === 'completed') {
          setVs({ status: 'completed', videoUrl: d.videoUrl ?? null, script: d.script ?? null, error: null });
        } else {
          setVs({ status: 'failed', videoUrl: null, script: null, error: d.error ?? 'Generation failed.' });
        }
      } catch {
        setVs({ status: 'failed', videoUrl: null, script: null, error: 'Network error while polling.' });
      }
    }, 5000);
  }, []);

  async function generate() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setVs({ status: 'generating', videoUrl: null, script: null, error: null });
    try {
      const res = await fetch('/api/generate-lesson-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, lessonTitle, lessonDescription: lessonDesc, outputFilename }),
      });
      const d = await res.json() as { jobId?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Request failed');
      pollStatus(d.jobId!);
    } catch (e) {
      setVs({ status: 'failed', videoUrl: null, script: null, error: (e as Error).message });
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)', marginBottom: 12 }}>
        {icon} {title} Videos
      </div>

      {vs.status === 'idle' && (
        <div style={{
          background: 'rgba(255,255,255,.02)',
          border: '1.5px dashed rgba(255,255,255,.10)',
          borderRadius: 12, padding: '28px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🎬</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g3)', marginBottom: 14 }}>
            Generate an AI lesson video for {title} using OpenAI Sora
          </div>
          <button className="btn btn-v" style={{ fontSize: 12, padding: '9px 20px' }} onClick={generate}>
            Generate Lesson Video
          </button>
        </div>
      )}

      {vs.status === 'generating' && (
        <div style={{
          background: 'rgba(91,33,245,.08)', border: '1px solid rgba(91,33,245,.2)',
          borderRadius: 12, padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--vl)', marginBottom: 4 }}>
            Creating your lesson video…
          </div>
          <div style={{ fontSize: 11, color: 'var(--g4)' }}>
            This can take several minutes. The page will update automatically.
          </div>
        </div>
      )}

      {vs.status === 'failed' && (
        <div style={{
          background: 'rgba(255,60,60,.07)', border: '1px solid rgba(255,60,60,.2)',
          borderRadius: 12, padding: '20px',
        }}>
          <div style={{ fontSize: 12, color: '#ff7070', marginBottom: 12 }}>
            {vs.error}
          </div>
          <button className="btn btn-o btn-sm" onClick={generate}>Try Again</button>
        </div>
      )}

      {vs.status === 'completed' && vs.videoUrl && (
        <div className="lesson-video-panel">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={`${vs.videoUrl}?_=${Date.now()}`}
            controls
            style={{ width: '100%', display: 'block', background: '#000' }}
          />
          <div className="lesson-video-panel__footer">
            <div style={{ fontSize: 11, color: 'var(--g4)' }}>{title} · AI lesson video</div>
            <button type="button" className="btn btn-o btn-sm" style={{ fontSize: 10 }} onClick={generate}>Regenerate</button>
          </div>
          {vs.script && (
            <details className="lesson-video-panel__script">
              <summary style={{ fontSize: 11, color: 'var(--g4)', cursor: 'pointer', marginBottom: 8 }}>View lesson script</summary>
              <div style={{ fontSize: 12, color: 'var(--g3)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{vs.script}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Lesson card ────────────────────────────────────────────────────

function LessonCard({
  lesson,
  index,
  sectionKey,
  selected,
  onClick,
  hasVideo,
  completed,
  locked,
}: {
  lesson: CatalogLesson;
  index: number;
  sectionKey: string;
  selected: boolean;
  onClick: () => void;
  hasVideo?: boolean;
  completed?: boolean;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cardClass(selected, locked)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: selected ? 'var(--vl)' : 'var(--g5)' }}>
          {completed ? '✓ ' : locked ? '🔒 ' : ''}{sectionKey} · Lesson {index + 1}
        </div>
        {hasVideo && !locked && (
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--mint)', textTransform: 'uppercase' }}>Video</span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)', marginBottom: 4, lineHeight: 1.35 }}>{lesson.name}</div>
      <div style={{ fontSize: 11, color: 'var(--g4)', lineHeight: 1.4 }}>{lesson.description}</div>
      {locked && (
        <div style={{ fontSize: 10, color: 'var(--g4)', marginTop: 8, lineHeight: 1.45, fontStyle: 'italic' }}>
          {LOCKED_LESSON_MESSAGE}
        </div>
      )}
    </button>
  );
}

function AllLessonsComplete({ sectionTitle }: { sectionTitle?: string }) {
  return (
    <div className="picker-complete-banner">
      <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mint)' }}>
        {sectionTitle ? `${sectionTitle} complete!` : 'All lessons complete!'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 6 }}>
        Great work — check back when new lessons are added.
      </div>
    </div>
  );
}

// ── Linear layout (Science, History, non-language books) ───────────

function LinearView({
  lessons,
  subject,
  title,
  onStartAI,
  showVideoGeneration,
}: {
  lessons: CatalogLesson[];
  subject: string;
  title: string;
  onStartAI: (lesson: CatalogLesson) => void;
  showVideoGeneration: boolean;
}) {
  const [selected, setSelected] = useState<CatalogLesson | null>(null);
  const [bookProgress, setBookProgress] = useState<BookLessonProgressState>(emptyLessonProgress());
  const sectionKey = title.toLowerCase();
  const studentId = auth.getUser()?.user_id ?? 'student';

  useEffect(() => {
    api.books.lessonProgress(subject, studentId)
      .then((prog) => {
        setBookProgress({
          max_unlocked_lesson_index: prog.max_unlocked_lesson_index ?? 0,
          completed_lesson_numbers: prog.completed_lesson_numbers ?? [],
        });
      })
      .catch(() => setBookProgress(emptyLessonProgress()));
  }, [subject, studentId]);

  const currentLessonNum = getCurrentLessonNumber(bookProgress, lessons.length);
  const allComplete = currentLessonNum === null && lessons.length > 0;

  useEffect(() => {
    const focusNum = currentLessonNum ?? 1;
    const focus = lessons.find((l, i) => getLessonNumber(l, i) === focusNum) ?? lessons[0] ?? null;
    setSelected(focus);
  }, [lessons, currentLessonNum]);

  const unlockedLessons = lessons.filter((lesson, i) =>
    isLessonUnlocked(bookProgress, getLessonNumber(lesson, i)),
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div>
        {allComplete ? (
          <AllLessonsComplete sectionTitle={title} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {lessons.map((lesson) => {
              const i = lessons.findIndex((l) => l.id === lesson.id);
              const lessonNum = getLessonNumber(lesson, i);
              const locked = isLessonLocked(bookProgress, lessonNum);
              const completed = isLessonCompleted(bookProgress, lessonNum);
              return (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  index={lessonNum - 1}
                  sectionKey={sectionKey}
                  selected={selected?.id === lesson.id}
                  locked={locked}
                  completed={completed}
                  onClick={() => setSelected(lesson)}
                />
              );
            })}
          </div>
        )}
        {!allComplete && showVideoGeneration && unlockedLessons.length > 0 && (
          <VideoSection
            title={title} icon="📖"
            subject={subject} sectionKey={sectionKey}
            lessons={unlockedLessons}
          />
        )}
      </div>
      <DetailPanel
        lesson={selected}
        sectionKey={sectionKey}
        locked={selected ? isLessonLocked(bookProgress, getLessonNumber(selected, lessons.findIndex((l) => l.id === selected.id))) : false}
        completed={selected ? isLessonCompleted(bookProgress, getLessonNumber(selected, lessons.findIndex((l) => l.id === selected.id))) : false}
        onStartAI={() => selected && onStartAI(selected)}
        showLessonVideo={showVideoGeneration}
      />
    </div>
  );
}

// ── Published book catalog (admin source of truth) ─────────────────

function BookSubjectContent({
  portalSubject,
  onStartAI,
}: {
  portalSubject: PortalSubject;
  onStartAI: (lesson: CatalogLesson) => void;
}) {
  const bookId = portalSubject.primary_book_id;
  const [catalog, setCatalog] = useState<HistoryLessonsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.books
      .lessons(bookId)
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (loading) {
    return <div className="card-sub" style={{ padding: 20 }}>Loading published lessons…</div>;
  }
  if (loadError || !catalog || !bookId) {
    return (
      <div className="auth-error" style={{ marginTop: 8 }}>
        Published lesson content is not available for this subject.
      </div>
    );
  }

  const lessons = mapBookLessonsResponse(catalog);
  const partCount = catalog.partCount ?? 2;
  const showVideoGeneration = isHistorySubject({
    type: portalSubject.subject_type,
    name: portalSubject.subject_name,
    subjectKey: portalSubject.subject_key,
  });

  if (isLanguageBook(partCount)) {
    return <LanguageBookView bookId={bookId} lessons={lessons} portalSubject={portalSubject} />;
  }

  return (
    <LinearView
      lessons={lessons}
      subject={bookId}
      title={portalSubject.subject_name}
      onStartAI={onStartAI}
      showVideoGeneration={showVideoGeneration}
    />
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function SubjectPage() {
  const router = useRouter();
  const params = useParams();
  const subjectKey = (params.subject as string) ?? '';
  const { subjects, loading } = usePortalSubjects();

  const portalSubject = subjects.find(
    (s) => s.subject_key === subjectKey || s.subject_key === subjectKey.split('_')[0],
  );

  function startAI(lesson: CatalogLesson) {
    const chapter = lesson.fullUnitId ?? `${portalSubject?.primary_book_id}:unit_${String(lesson.id).padStart(2, '0')}`;
    const params = new URLSearchParams({
      chapter,
      lesson_title: lesson.name,
      lesson_desc: lesson.description,
    });
    router.push(`/lessons/learn?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="page-enter">
        <div className="card-sub" style={{ padding: 24 }}>Loading subject…</div>
      </div>
    );
  }

  if (!portalSubject?.primary_book_id) {
    return (
      <div className="page-enter">
        <div className="auth-error">
          This subject is not published or is not available to your account.
        </div>
        <button className="btn btn-o" onClick={() => router.push('/lessons')} style={{ marginTop: 16 }}>
          ← Back to Subjects
        </button>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button className="btn btn-o btn-sm" onClick={() => router.push('/lessons')}>
          ← Back to Subjects
        </button>
        <span style={{ color: 'var(--g5)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)' }}>{portalSubject.subject_name}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(91,33,245,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {portalSubject.icon}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--w)', fontFamily: 'var(--fd)' }}>
            {portalSubject.subject_name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 2 }}>AI-guided lessons with Jassmine</div>
        </div>
      </div>

      <BookSubjectContent portalSubject={portalSubject} onStartAI={startAI} />
    </div>
  );
}
