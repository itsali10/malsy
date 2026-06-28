'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { learningConfig, Lesson, LinearSubject, SectionsSubject } from '../../../../lib/learning-config';
import { api, HistoryLessonCard } from '../../../../lib/api';
import { auth } from '../../../../lib/auth';

/** Lesson card with optional backend catalog fields (History G6). */
interface CatalogLesson extends Lesson {
  fullUnitId?: string;
  videoFilename?: string | null;
  videoType?: string | null;
}

// ── Shared card styles ─────────────────────────────────────────────

function card(selected: boolean) {
  return {
    padding: '16px 18px',
    borderRadius: 12,
    border: `1.5px solid ${selected ? 'rgba(91,33,245,.6)' : 'rgba(255,255,255,.08)'}`,
    background: selected ? 'rgba(91,33,245,.14)' : 'rgba(255,255,255,.03)',
    cursor: 'pointer',
    transition: 'all .15s',
    textAlign: 'left' as const,
    width: '100%',
  };
}

// ── Detail sidebar ─────────────────────────────────────────────────

function DetailPanel({
  lesson,
  sectionKey,
  onStartAI,
  locked,
  completed,
  buttonLabel = 'Start with AI Teacher →',
}: {
  lesson: CatalogLesson | null;
  sectionKey: string;
  onStartAI: () => void;
  locked?: boolean;
  completed?: boolean;
  buttonLabel?: string;
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
        <div style={{ fontSize: 12, color: 'var(--g4)', lineHeight: 1.6, marginBottom: 16 }}>
          🔒 Pass the previous lesson quiz to unlock this lesson.
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

      {lesson.fullUnitId && lesson.videoType === 'lessonVideo' && !sectionKey.includes('history') && (
        <LessonVideoPanel unitId={lesson.fullUnitId} videoFilename={lesson.videoFilename} />
      )}
      {lesson.fullUnitId && !lesson.videoFilename && !sectionKey.includes('history') && (
        <div style={{ fontSize: 11, color: 'var(--g4)', marginTop: 8 }}>
          No video uploaded for this lesson yet.
        </div>
      )}
      {sectionKey.includes('history') && (
        <div style={{ fontSize: 11, color: 'var(--g4)', marginTop: 8, lineHeight: 1.5 }}>
          Open the lesson to watch or generate its video.
        </div>
      )}
    </div>
  );
}

function LessonVideoPanel({ unitId, videoFilename }: { unitId: string; videoFilename?: string | null }) {
  const [state, setState] = useState<{ loading: boolean; exists: boolean; videoUrl?: string; narration?: string }>({
    loading: true,
    exists: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lesson-video-check?unitId=${encodeURIComponent(unitId)}`)
      .then(r => r.json())
      .then((d: { exists?: boolean; videoUrl?: string; narration?: string }) => {
        if (!cancelled) {
          setState({
            loading: false,
            exists: Boolean(d.exists),
            videoUrl: d.videoUrl,
            narration: d.narration,
          });
        }
      })
      .catch(() => { if (!cancelled) setState({ loading: false, exists: false }); });
    return () => { cancelled = true; };
  }, [unitId]);

  if (state.loading) {
    return <div style={{ fontSize: 11, color: 'var(--g4)' }}>Checking for saved video…</div>;
  }
  if (!state.exists || !state.videoUrl) {
    return (
      <div style={{ fontSize: 11, color: 'var(--g4)' }}>
        Video slot: {videoFilename ?? 'none'} — not uploaded yet.
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={state.videoUrl} controls style={{ width: '100%', display: 'block', background: '#000' }} />
      {state.narration && (
        <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--g3)', lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,.06)' }}>
          {state.narration}
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
            Generating video with Sora…
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
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={`${vs.videoUrl}?_=${Date.now()}`}
            controls
            style={{ width: '100%', display: 'block', background: '#000' }}
          />
          <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--g4)' }}>{title} · AI-generated lesson video</div>
            <button className="btn btn-o btn-sm" style={{ fontSize: 10 }} onClick={generate}>Regenerate</button>
          </div>
          {vs.script && (
            <details style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
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
  locked,
  completed,
}: {
  lesson: CatalogLesson;
  index: number;
  sectionKey: string;
  selected: boolean;
  onClick: () => void;
  hasVideo?: boolean;
  locked?: boolean;
  completed?: boolean;
}) {
  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      style={{
        ...card(selected && !locked),
        opacity: locked ? 0.55 : 1,
        cursor: locked ? 'not-allowed' : 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: selected ? 'var(--vl)' : 'var(--g5)' }}>
          {locked ? '🔒 ' : completed ? '✓ ' : ''}{sectionKey} · Lesson {index + 1}
        </div>
        {hasVideo && !locked && (
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--mint)', textTransform: 'uppercase' }}>Video</span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)', marginBottom: 4, lineHeight: 1.35 }}>{lesson.name}</div>
      <div style={{ fontSize: 11, color: 'var(--g4)', lineHeight: 1.4 }}>
        {locked ? 'Pass the previous lesson quiz to unlock.' : lesson.description}
      </div>
    </button>
  );
}

// ── English 3-section layout ───────────────────────────────────────

function EnglishView({ cfg, onStartAI, onStartPronunciation }: {
  cfg: SectionsSubject;
  onStartAI: (lesson: CatalogLesson, sectionKey: string) => void;
  onStartPronunciation: (lesson: CatalogLesson) => void;
}) {
  const [activeKey, setActiveKey]   = useState<string | null>(null);
  const [selected,  setSelected]    = useState<{ lesson: CatalogLesson; sectionKey: string } | null>(null);

  const activeSection = cfg.sections.find(s => s.key === activeKey) ?? null;
  const isPronunciationSection = selected?.sectionKey === 'english_speaking';

  function selectSection(key: string) {
    setActiveKey(key);
    setSelected(null);
  }

  function handleStart() {
    if (!selected) return;
    if (isPronunciationSection) {
      onStartPronunciation(selected.lesson);
    } else {
      onStartAI(selected.lesson, selected.sectionKey);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div>
        {/* ── 3 category cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 32 }}>
          {cfg.sections.map(section => {
            const active = activeKey === section.key;
            return (
              <button
                key={section.key}
                onClick={() => selectSection(section.key)}
                style={{
                  padding: '28px 20px',
                  borderRadius: 18,
                  border: `1.5px solid ${active ? 'rgba(91,33,245,.6)' : 'rgba(255,255,255,.08)'}`,
                  background: active ? 'rgba(91,33,245,.14)' : 'rgba(255,255,255,.03)',
                  cursor: 'pointer',
                  textAlign: 'center' as const,
                  transition: 'all .15s',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>{section.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--w)', marginBottom: 6 }}>{section.title}</div>
                <div style={{ fontSize: 11, color: active ? 'var(--vl)' : 'var(--g4)' }}>
                  {section.lessons.length} lesson{section.lessons.length !== 1 ? 's' : ''}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── lessons for selected section ── */}
        {activeSection ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)', marginBottom: 14 }}>
              {activeSection.icon} {activeSection.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
              {activeSection.lessons.map((lesson, i) => (
                <LessonCard
                  key={`${activeSection.key}-${lesson.id}`}
                  lesson={lesson}
                  index={i}
                  sectionKey={activeSection.title}
                  selected={selected?.lesson.id === lesson.id && selected?.sectionKey === activeSection.key}
                  onClick={() => setSelected({ lesson, sectionKey: activeSection.key })}
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--g4)', fontSize: 13 }}>
            Choose a category above to see its lessons.
          </div>
        )}
      </div>

      {/* ── detail panel ── */}
      <DetailPanel
        lesson={selected?.lesson ?? null}
        sectionKey={selected?.sectionKey ?? ''}
        onStartAI={handleStart}
        buttonLabel={isPronunciationSection ? 'Practice Pronunciation →' : 'Start with AI Teacher →'}
      />
    </div>
  );
}

// ── Linear layout (Science, Math) ─────────────────────────────────

function LinearView({ cfg, subject, onStartAI }: { cfg: LinearSubject; subject: string; onStartAI: (lesson: Lesson) => void }) {
  const [selected, setSelected] = useState<Lesson | null>(null);
  const sectionKey = cfg.title.toLowerCase();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {cfg.lessons.map((lesson, i) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              index={i}
              sectionKey={sectionKey}
              selected={selected?.id === lesson.id}
              onClick={() => setSelected(lesson)}
            />
          ))}
        </div>
        <VideoSection
          title={cfg.title} icon={cfg.icon}
          subject={subject} sectionKey={sectionKey}
          lessons={cfg.lessons}
        />
      </div>
      <DetailPanel
        lesson={selected}
        sectionKey={sectionKey}
        onStartAI={() => selected && onStartAI(selected)}
      />
    </div>
  );
}

// ── Sections layout (History / Social Studies) ─────────────────────

function SectionsView({ cfg, subject, onStartAI }: { cfg: SectionsSubject; subject: string; onStartAI: (lesson: CatalogLesson, sectionKey: string) => void }) {
  const [selected, setSelected] = useState<{ lesson: CatalogLesson; sectionKey: string } | null>(null);
  const [catalogLessons, setCatalogLessons] = useState<Record<string, CatalogLesson[]>>({});
  const [bookProgress, setBookProgress] = useState<Record<string, { max_unlocked_lesson_index: number; completed_lesson_numbers: number[] }>>({});
  const studentId = auth.getUser()?.user_id ?? 'student';

  useEffect(() => {
    cfg.sections
      .filter(s => s.key === 'history_g6' || s.key.endsWith('_g6'))
      .forEach((section) => {
        api.books.lessons(section.key)
          .then((data) => {
            setCatalogLessons(prev => ({
              ...prev,
              [section.key]: data.lessons.map((l: HistoryLessonCard) => ({
                id: l.lessonNumber,
                name: l.title,
                description: l.shortDescription,
                fullUnitId: l.id,
                videoFilename: l.videoFilename,
                videoType: l.videoType,
              })),
            }));
          })
          .catch(() => { /* fallback to learning-config */ });

        api.books.lessonProgress(section.key, studentId)
          .then((prog) => {
            setBookProgress(prev => ({
              ...prev,
              [section.key]: {
                max_unlocked_lesson_index: prog.max_unlocked_lesson_index ?? 0,
                completed_lesson_numbers: prog.completed_lesson_numbers ?? [],
              },
            }));
          })
          .catch(() => { /* default: lesson 1 only */ });
      });
  }, [cfg, studentId]);

  function lessonsForSection(sectionKey: string, fallback: Lesson[]): CatalogLesson[] {
    return catalogLessons[sectionKey]?.length ? catalogLessons[sectionKey] : fallback;
  }

  function isLessonUnlocked(sectionKey: string, lessonNumber: number): boolean {
    const prog = bookProgress[sectionKey];
    if (!prog) return lessonNumber <= 1;
    return lessonNumber - 1 <= prog.max_unlocked_lesson_index;
  }

  function isLessonCompleted(sectionKey: string, lessonNumber: number): boolean {
    const prog = bookProgress[sectionKey];
    return Boolean(prog?.completed_lesson_numbers?.includes(lessonNumber));
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        {cfg.sections.map((section) => {
          const lessons = lessonsForSection(section.key, section.lessons);
          const isHistoryG6 = section.key === 'history_g6';
          return (
          <div key={section.key}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--w)', marginBottom: 14 }}>
              {section.icon} {section.title}
              {isHistoryG6 && catalogLessons[section.key]?.length === 6 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--g4)', marginLeft: 10 }}>
                  Ancient Egypt · 6 lessons
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {lessons.map((lesson, i) => {
                const lessonNum = typeof lesson.id === 'number' ? lesson.id : i + 1;
                const locked = isHistoryG6 && !isLessonUnlocked(section.key, lessonNum);
                const completed = isHistoryG6 && isLessonCompleted(section.key, lessonNum);
                return (
                <LessonCard
                  key={`${section.key}-${lesson.id}`}
                  lesson={lesson}
                  index={i}
                  sectionKey={section.title}
                  selected={selected?.lesson.id === lesson.id && selected?.sectionKey === section.key}
                  onClick={() => setSelected({ lesson, sectionKey: section.key })}
                  hasVideo={Boolean(lesson.videoFilename)}
                  locked={locked}
                  completed={completed}
                />
              );})}
            </div>
            {!isHistoryG6 && (
              <VideoSection
                title={section.title} icon={section.icon}
                subject={subject} sectionKey={section.key}
                lessons={lessons}
              />
            )}
          </div>
          );
        })}
      </div>
      <DetailPanel
        lesson={selected?.lesson ?? null}
        sectionKey={selected?.sectionKey ?? ''}
        onStartAI={() => selected && onStartAI(selected.lesson, selected.sectionKey)}
        locked={
          selected
            ? !isLessonUnlocked(selected.sectionKey, typeof selected.lesson.id === 'number' ? selected.lesson.id : 1)
            : false
        }
        completed={
          selected
            ? isLessonCompleted(selected.sectionKey, typeof selected.lesson.id === 'number' ? selected.lesson.id : 1)
            : false
        }
      />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function SubjectPage() {
  const router  = useRouter();
  const params  = useParams();
  const subject = (params.subject as string) ?? '';

  const cfg = learningConfig[subject];

  if (!cfg) {
    return (
      <div className="page-enter">
        <div className="auth-error">Subject "{subject}" not found.</div>
        <button className="btn btn-o" onClick={() => router.push('/lessons')} style={{ marginTop: 16 }}>
          ← Back to Subjects
        </button>
      </div>
    );
  }

  function startAI(lesson: CatalogLesson, sectionKey?: string) {
    const bookKey = sectionKey ?? subject;
    const chapter = lesson.fullUnitId ?? (bookKey + ':unit_' + String(lesson.id).padStart(2, '0'));
    const params = new URLSearchParams({
      chapter,
      lesson_title: lesson.name,
      lesson_desc: lesson.description,
    });
    router.push(`/lessons/learn?${params.toString()}`);
  }

  function startPronunciation(lesson: CatalogLesson) {
    const params = new URLSearchParams({
      lesson_title: lesson.name,
    });
    router.push(`/lessons/pronunciation?${params.toString()}`);
  }

  return (
    <div className="page-enter">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button
          className="btn btn-o btn-sm"
          onClick={() => router.push('/lessons')}
        >
          ← Back to Subjects
        </button>
        <span style={{ color: 'var(--g5)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)' }}>{cfg.title}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(91,33,245,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {cfg.icon}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--w)', fontFamily: 'var(--fd)' }}>{cfg.title}</div>
          <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 2 }}>AI-guided lessons with Jassmine</div>
        </div>
      </div>

      {/* Content */}
      {cfg.kind === 'linear'
        ? <LinearView cfg={cfg} subject={subject} onStartAI={(lesson) => startAI(lesson)} />
        : subject === 'english'
          ? <EnglishView cfg={cfg as SectionsSubject} onStartAI={(lesson, sectionKey) => startAI(lesson, sectionKey)} onStartPronunciation={startPronunciation} />
          : <SectionsView cfg={cfg} subject={subject} onStartAI={(lesson, sectionKey) => startAI(lesson, sectionKey)} />
      }
    </div>
  );
}
