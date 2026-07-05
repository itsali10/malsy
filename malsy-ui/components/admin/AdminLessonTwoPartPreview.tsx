'use client';

import { useEffect, useState } from 'react';
import type { AdminLessonContent, AdminLessonPart } from '../../lib/admin-api';
import { adminApi } from '../../lib/admin-api';
import { buildLessonPreviewSections } from '../../lib/admin-lesson-preview';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function Paragraphs({ text }: { text?: string }) {
  if (!text?.trim()) return <p style={{ margin: 0, fontSize: 13, color: 'var(--g3)' }}>No content stored for this part.</p>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {text
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--vl)' }}>
            {p}
          </p>
        ))}
    </div>
  );
}

function QuizBlock({ quiz }: { quiz?: Record<string, unknown> | null }) {
  if (!quiz) return null;
  const question = String(quiz.question ?? quiz.prompt ?? '');
  const options = Array.isArray(quiz.options) ? (quiz.options as string[]) : [];
  const correct = String(quiz.correct_answer ?? '');
  if (!question && options.length === 0) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
        Quiz / questions
      </div>
      {question && <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--vl)' }}>{question}</div>}
      {options.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {options.map((opt) => (
            <li key={opt} style={{ fontSize: 13, color: opt === correct ? 'var(--mint)' : 'var(--g3)', fontWeight: opt === correct ? 700 : 400 }}>
              {opt}{opt === correct ? ' ✓' : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SharedSections({ content }: { content: AdminLessonContent }) {
  const s = buildLessonPreviewSections(content);
  return (
    <>
      {s.vocabWords.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Vocabulary / key terms
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.vocabWords.map((w) => (
              <span key={w} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.06)', color: 'var(--vl)' }}>
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
      {s.activityItems.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Activities / experiments
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {s.activityItems.map((item, i) => (
              <li key={item.id ?? i} style={{ fontSize: 13, color: 'var(--vl)' }}>
                {item.title ?? item.keywords?.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.conceptItems.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Key concepts
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {s.conceptItems.map((item, i) => (
              <li key={item.id ?? i} style={{ fontSize: 13, color: 'var(--vl)' }}>
                {item.title ?? item.keywords?.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {content.book_unit_content?.text && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Textbook content
          </div>
          <Paragraphs text={String(content.book_unit_content.text).slice(0, 4000)} />
        </div>
      )}
      {s.images.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
          {s.images.map((img, i) => {
            const src = img.image_url?.startsWith('http') ? img.image_url : `${API_BASE}${img.image_url ?? ''}`;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={img.caption ?? ''} style={{ width: '100%', borderRadius: 8 }} />
            );
          })}
        </div>
      )}
    </>
  );
}

function PartPanel({ part, label }: { part: AdminLessonPart; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mint)', marginBottom: 12 }}>{label}</div>
      <Paragraphs text={part.teacher_text} />
      <QuizBlock quiz={part.quiz} />
    </div>
  );
}

export function AdminLessonTwoPartPreview({
  chapterId,
  lessonTitle,
  open,
  onClose,
}: {
  chapterId: string;
  lessonTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const [content, setContent] = useState<AdminLessonContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activePart, setActivePart] = useState<0 | 1>(0);

  useEffect(() => {
    if (!open || !chapterId) return;
    setLoading(true);
    setError('');
    setActivePart(0);
    adminApi.lessons
      .content(chapterId)
      .then(setContent)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load lesson'))
      .finally(() => setLoading(false));
  }, [open, chapterId]);

  if (!open) return null;

  const view = content?.student_view;
  const parts = view?.parts ?? [];
  const hasTwoParts = parts.length >= 2;
  const title = content?.lesson_title ?? lessonTitle;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box" style={{ maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 18 }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 4 }}>
              Admin preview — same Part 1 → quiz → Part 2 flow as students (both parts unlocked)
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <div className="modal-spinner" style={{ margin: '24px auto' }} />}
          {error && <div style={{ color: 'var(--coral)', marginBottom: 12 }}>{error}</div>}

          {content && !loading && (
            <>
              {hasTwoParts && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {([0, 1] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={activePart === p ? 'btn btn-p btn-sm' : 'btn btn-o btn-sm'}
                      onClick={() => setActivePart(p)}
                    >
                      Part {p + 1}
                      {p === 1 && <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 10 }}>(unlocked for admin)</span>}
                    </button>
                  ))}
                </div>
              )}

              {hasTwoParts ? (
                <PartPanel part={parts[activePart]} label={`Part ${activePart + 1} content`} />
              ) : (
                <>
                  <PartPanel
                    part={{ part: 0, teacher_text: view?.teacher_text, quiz: view?.quiz }}
                    label="Part 1 content"
                  />
                  {view?.quiz && !view?.teacher_text && (
                    <p style={{ fontSize: 12, color: 'var(--g3)', marginTop: 8 }}>
                      Single-part lesson — quiz shown above when explanation is generated.
                    </p>
                  )}
                </>
              )}

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <SharedSections content={content} />
              </div>

              {content.supports_listening && view?.listening && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Listening
                  </div>
                  <Paragraphs text={view.listening.transcript || view.listening.narration_text} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
