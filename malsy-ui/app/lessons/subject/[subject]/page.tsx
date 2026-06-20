'use client';

import { useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { learningConfig, Lesson, LinearSubject, SectionsSubject } from '../../../../lib/learning-config';

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
}: {
  lesson: Lesson | null;
  sectionKey: string;
  onStartAI: () => void;
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
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--w)', marginBottom: 8, lineHeight: 1.4 }}>{lesson.name}</div>
      <div style={{ fontSize: 12, color: 'var(--g3)', marginBottom: 20, lineHeight: 1.6 }}>{lesson.description}</div>

      <button
        className="auth-submit"
        onClick={onStartAI}
        style={{ marginBottom: 0, padding: '11px 16px', fontSize: 13 }}
      >
        Start with AI Teacher →
      </button>
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
}: {
  lesson: Lesson;
  index: number;
  sectionKey: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={card(selected)}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: selected ? 'var(--vl)' : 'var(--g5)', marginBottom: 5 }}>
        {sectionKey} · Lesson {index + 1}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)', marginBottom: 4, lineHeight: 1.35 }}>{lesson.name}</div>
      <div style={{ fontSize: 11, color: 'var(--g4)', lineHeight: 1.4 }}>{lesson.description}</div>
    </button>
  );
}

// ── Linear layout (English, Science, Math) ─────────────────────────

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

function SectionsView({ cfg, subject, onStartAI }: { cfg: SectionsSubject; subject: string; onStartAI: (lesson: Lesson, sectionKey: string) => void }) {
  const [selected, setSelected] = useState<{ lesson: Lesson; sectionKey: string } | null>(null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        {cfg.sections.map((section) => (
          <div key={section.key}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--w)', marginBottom: 14 }}>
              {section.icon} {section.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {section.lessons.map((lesson, i) => (
                <LessonCard
                  key={`${section.key}-${lesson.id}`}
                  lesson={lesson}
                  index={i}
                  sectionKey={section.title}
                  selected={selected?.lesson.id === lesson.id && selected?.sectionKey === section.key}
                  onClick={() => setSelected({ lesson, sectionKey: section.key })}
                />
              ))}
            </div>
            <VideoSection
              title={section.title} icon={section.icon}
              subject={subject} sectionKey={section.key}
              lessons={section.lessons}
            />
          </div>
        ))}
      </div>
      <DetailPanel
        lesson={selected?.lesson ?? null}
        sectionKey={selected?.sectionKey ?? ''}
        onStartAI={() => selected && onStartAI(selected.lesson, selected.sectionKey)}
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
          ← Back to Lessons
        </button>
      </div>
    );
  }

  function startAI(lesson: Lesson, sectionKey?: string) {
    const bookKey = sectionKey ?? subject;
    const chapter = bookKey + ':unit_' + String(lesson.id).padStart(2, '0');
    const params = new URLSearchParams({
      chapter,
      lesson_title: lesson.name,
      lesson_desc: lesson.description,
    });
    router.push(`/lessons/learn?${params.toString()}`);
  }

  return (
    <div className="page-enter">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button
          className="btn btn-o btn-sm"
          onClick={() => router.push('/lessons')}
        >
          ← Lessons
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
        : <SectionsView cfg={cfg} subject={subject} onStartAI={(lesson, sectionKey) => startAI(lesson, sectionKey)} />
      }
    </div>
  );
}
