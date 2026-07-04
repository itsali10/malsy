'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { learningConfig, Lesson, LinearSubject, SectionsSubject } from '../../../../lib/learning-config';
import { api, HistoryLessonCard, LessonEvaluationRead } from '../../../../lib/api';
import { auth } from '../../../../lib/auth';
import {
  BookLessonProgressState,
  getCurrentLessonNumber,
  getLessonNumber,
  getVisibleLessons,
  isLessonCompleted,
  progressFromEvaluations,
  emptyLessonProgress,
} from '../../../../lib/lessonProgress';

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
  completed,
  buttonLabel = 'Start with AI Teacher →',
}: {
  lesson: CatalogLesson | null;
  sectionKey: string;
  onStartAI: () => void;
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

      <button
        className="auth-submit"
        onClick={onStartAI}
        style={{ marginBottom: 16, padding: '11px 16px', fontSize: 13 }}
      >
        {buttonLabel}
      </button>

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
  completed,
}: {
  lesson: CatalogLesson;
  index: number;
  sectionKey: string;
  selected: boolean;
  onClick: () => void;
  hasVideo?: boolean;
  completed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={card(selected)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: selected ? 'var(--vl)' : 'var(--g5)' }}>
          {completed ? '✓ ' : ''}{sectionKey} · Lesson {index + 1}
        </div>
        {hasVideo && (
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--mint)', textTransform: 'uppercase' }}>Video</span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)', marginBottom: 4, lineHeight: 1.35 }}>{lesson.name}</div>
      <div style={{ fontSize: 11, color: 'var(--g4)', lineHeight: 1.4 }}>{lesson.description}</div>
    </button>
  );
}

function AllLessonsComplete({ sectionTitle }: { sectionTitle?: string }) {
  return (
    <div style={{
      padding: '28px 20px',
      borderRadius: 14,
      border: '1px solid rgba(0,229,160,.22)',
      background: 'rgba(0,229,160,.06)',
      textAlign: 'center',
    }}>
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

// ── English 3-section layout ───────────────────────────────────────

function EnglishView({ cfg, onStartAI, onStartPronunciation }: {
  cfg: SectionsSubject;
  onStartAI: (lesson: CatalogLesson, sectionKey: string) => void;
  onStartPronunciation: (lesson: CatalogLesson) => void;
}) {
  const [evaluations, setEvaluations] = useState<LessonEvaluationRead[]>([]);

  useEffect(() => {
    api.evaluations.mine().then(setEvaluations).catch(() => {});
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
      {cfg.sections.map(section => {
        const isPronunciation = section.key === 'english_speaking';

        if (isPronunciation) {
          return (
            <button
              key={section.key}
              onClick={() => onStartPronunciation(section.lessons[0])}
              style={{
                padding: '36px 24px',
                borderRadius: 20,
                border: '1.5px solid rgba(255,255,255,.09)',
                background: 'rgba(255,255,255,.03)',
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(91,33,245,.5)';
                (e.currentTarget as HTMLButtonElement).style.background  = 'rgba(91,33,245,.08)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,.09)';
                (e.currentTarget as HTMLButtonElement).style.background  = 'rgba(255,255,255,.03)';
              }}
            >
              <div style={{ fontSize: 40 }}>{section.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--w)' }}>{section.title}</div>
              <div style={{ fontSize: 12, color: 'var(--g3)', lineHeight: 1.5 }}>
                Practice anytime<br />New words each session
              </div>
            </button>
          );
        }

        const prog = progressFromEvaluations(section.key, section.lessons, evaluations);
        const visible = getVisibleLessons(section.lessons, prog);
        const currentLesson = visible[0] ?? null;
        const currentNum = getCurrentLessonNumber(prog, section.lessons.length);
        const total = section.lessons.length;
        const completedCount = prog.completed_lesson_numbers.length;
        const allDone = currentNum === null;

        return (
          <div
            key={section.key}
            style={{
              padding: '24px 20px',
              borderRadius: 20,
              border: '1.5px solid rgba(255,255,255,.09)',
              background: 'rgba(255,255,255,.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40 }}>{section.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--w)', marginTop: 8 }}>{section.title}</div>
              <div style={{ fontSize: 12, color: allDone ? 'var(--mint)' : 'var(--g3)', marginTop: 6 }}>
                {allDone ? '✓ All lessons completed' : `Lesson ${currentNum} of ${total}`}
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 99, background: 'rgba(255,255,255,.08)', marginTop: 10 }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: allDone ? 'var(--mint)' : 'var(--vl)',
                  width: `${Math.round((completedCount / total) * 100)}%`,
                  transition: 'width .4s ease',
                }} />
              </div>
            </div>

            {currentLesson ? (
              <LessonCard
                lesson={currentLesson}
                index={(currentNum ?? 1) - 1}
                sectionKey={section.title}
                selected
                onClick={() => onStartAI(currentLesson, section.key)}
              />
            ) : (
              <AllLessonsComplete sectionTitle={section.title} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Linear layout (Science, Math) ─────────────────────────────────

function LinearView({ cfg, subject, onStartAI }: { cfg: LinearSubject; subject: string; onStartAI: (lesson: Lesson) => void }) {
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [bookProgress, setBookProgress] = useState<BookLessonProgressState>(emptyLessonProgress());
  const sectionKey = cfg.title.toLowerCase();
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

  const visibleLessons = getVisibleLessons(cfg.lessons, bookProgress);

  useEffect(() => {
    setSelected(visibleLessons[0] ?? null);
  }, [visibleLessons]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div>
        {visibleLessons.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {visibleLessons.map((lesson) => {
              const i = cfg.lessons.findIndex((l) => l.id === lesson.id);
              const lessonNum = getLessonNumber(lesson, i);
              return (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  index={lessonNum - 1}
                  sectionKey={sectionKey}
                  selected={selected?.id === lesson.id}
                  onClick={() => setSelected(lesson)}
                />
              );
            })}
          </div>
        ) : (
          <AllLessonsComplete sectionTitle={cfg.title} />
        )}
        {visibleLessons.length > 0 && (
          <VideoSection
            title={cfg.title} icon={cfg.icon}
            subject={subject} sectionKey={sectionKey}
            lessons={visibleLessons}
          />
        )}
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
  const [bookProgress, setBookProgress] = useState<Record<string, BookLessonProgressState>>({});
  const studentId = auth.getUser()?.user_id ?? 'student';

  useEffect(() => {
    cfg.sections.forEach((section) => {
      if (section.key === 'history_g6' || section.key.endsWith('_g6')) {
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
      }

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
        .catch(() => {
          setBookProgress(prev => ({ ...prev, [section.key]: emptyLessonProgress() }));
        });
    });
  }, [cfg, studentId]);

  function lessonsForSection(sectionKey: string, fallback: Lesson[]): CatalogLesson[] {
    return catalogLessons[sectionKey]?.length ? catalogLessons[sectionKey] : fallback;
  }

  useEffect(() => {
    if (selected) {
      const section = cfg.sections.find((s) => s.key === selected.sectionKey);
      if (section) {
        const lessons = lessonsForSection(section.key, section.lessons);
        const visible = getVisibleLessons(lessons, bookProgress[section.key]);
        if (visible.some((l) => l.id === selected.lesson.id)) return;
      }
    }
    for (const section of cfg.sections) {
      const lessons = lessonsForSection(section.key, section.lessons);
      const visible = getVisibleLessons(lessons, bookProgress[section.key]);
      if (visible.length > 0) {
        setSelected({ lesson: visible[0], sectionKey: section.key });
        return;
      }
    }
    setSelected(null);
  }, [bookProgress, catalogLessons, cfg.sections, selected]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        {cfg.sections.map((section) => {
          const lessons = lessonsForSection(section.key, section.lessons);
          const prog = bookProgress[section.key];
          const visibleLessons = getVisibleLessons(lessons, prog);
          const currentNum = getCurrentLessonNumber(prog, lessons.length);
          const isHistoryG6 = section.key === 'history_g6';

          return (
          <div key={section.key}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--w)', marginBottom: 14 }}>
              {section.icon} {section.title}
              {currentNum !== null && (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--g4)', marginLeft: 10 }}>
                  Lesson {currentNum} of {lessons.length}
                </span>
              )}
              {isHistoryG6 && catalogLessons[section.key]?.length === 6 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--g4)', marginLeft: 10 }}>
                  Ancient Egypt
                </span>
              )}
            </div>
            {visibleLessons.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {visibleLessons.map((lesson) => {
                  const i = lessons.findIndex((l) => l.id === lesson.id);
                  const lessonNum = getLessonNumber(lesson, i >= 0 ? i : 0);
                  const completed = isLessonCompleted(prog, lessonNum);
                  return (
                    <LessonCard
                      key={`${section.key}-${lesson.id}`}
                      lesson={lesson}
                      index={lessonNum - 1}
                      sectionKey={section.title}
                      selected={selected?.lesson.id === lesson.id && selected?.sectionKey === section.key}
                      onClick={() => setSelected({ lesson, sectionKey: section.key })}
                      hasVideo={Boolean(lesson.videoFilename)}
                      completed={completed}
                    />
                  );
                })}
              </div>
            ) : (
              <AllLessonsComplete sectionTitle={section.title} />
            )}
            {!isHistoryG6 && visibleLessons.length > 0 && (
              <VideoSection
                title={section.title} icon={section.icon}
                subject={subject} sectionKey={section.key}
                lessons={visibleLessons}
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
        completed={
          selected
            ? isLessonCompleted(
                bookProgress[selected.sectionKey],
                typeof selected.lesson.id === 'number' ? selected.lesson.id : 1,
              )
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
