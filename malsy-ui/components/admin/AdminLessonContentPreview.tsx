'use client';

import Link from 'next/link';
import type { AdminGeneratedPlanItem, AdminLessonContent } from '../../lib/admin-api';
import { buildLessonPreviewSections } from '../../lib/admin-lesson-preview';
import { dedupeList } from '../../lib/dedupe-list';
import { isHistorySubject } from '../../lib/history-subject';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--g3)',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function PlanItemsList({ items, showTitles = false }: { items: AdminGeneratedPlanItem[]; showTitles?: boolean }) {
  if (!items.length) return null;
  const labels = dedupeList(
    items.map((item) => {
      const keywords = (item.keywords ?? []).map(String).filter(Boolean);
      return (showTitles && item.title ? item.title : keywords.join(', ') || item.title) ?? '';
    }),
  );
  if (!labels.length) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
      {labels.map((label) => (
        <li key={label} style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--vl)' }}>
          {label}
        </li>
      ))}
    </ul>
  );
}

function QuizPreview({ quiz }: { quiz?: Record<string, unknown> | null }) {
  if (!quiz) return null;
  const question = String(quiz.question ?? quiz.prompt ?? '');
  const options = Array.isArray(quiz.options) ? (quiz.options as string[]) : [];
  const correct = String(quiz.correct_answer ?? '');
  if (!question && options.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {question && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--vl)' }}>{question}</div>}
      {options.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {options.map((opt) => (
            <li
              key={opt}
              style={{
                fontSize: 13,
                color: opt === correct ? 'var(--mint)' : 'var(--g3)',
                fontWeight: opt === correct ? 700 : 400,
              }}
            >
              {opt}
              {opt === correct ? ' ✓' : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminLessonContentPreview({
  content,
  showTitle = true,
  titleOverride,
  detailHref,
  compact = false,
}: {
  content: AdminLessonContent;
  showTitle?: boolean;
  titleOverride?: string;
  detailHref?: string;
  compact?: boolean;
}) {
  const s = buildLessonPreviewSections(content);
  const title = titleOverride?.trim() || s.title;
  const showLessonVideo = isHistorySubject({
    type: null,
    name: content.lesson_meta?.subject_title ?? content.lesson_title,
    subjectKey: content.lesson_meta?.subject_key ?? content.subject_key,
    chapterId: content.chapter_id,
  });

  return (
    <div style={{ display: 'grid', gap: compact ? 12 : 14 }}>
      {showTitle && title && title !== 'Untitled lesson' && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--g3)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              marginBottom: 6,
            }}
          >
            Lesson title
          </div>
          <div style={{ fontSize: compact ? 16 : 18, fontWeight: 800, color: 'var(--w)', lineHeight: 1.35 }}>
            {title}
          </div>
        </div>
      )}
      {s.storageNote && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--amber)', lineHeight: 1.5 }}>{s.storageNote}</p>
      )}

      {(content.language_sections?.length ?? 0) > 0 && (
        <div>
          <SectionLabel>Lesson sections (student view)</SectionLabel>
          <div style={{ display: 'grid', gap: 8 }}>
            {content.language_sections!.map((sec) => (
              <div
                key={sec.key ?? sec.index}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.08)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--w)' }}>
                  {sec.title ?? `Section ${(sec.index ?? 0) + 1}`}
                </div>
                {sec.item_title && (
                  <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 4 }}>{sec.item_title}</div>
                )}
                {(sec.keywords?.length ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--vl)', marginTop: 6 }}>
                    {dedupeList((sec.keywords ?? []).map(String)).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(s.explanationText || s.explanationItems.length > 0) && (
        <div>
          <SectionLabel>Explanation</SectionLabel>
          {s.explanationText ? (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--vl)' }}>{s.explanationText}</p>
          ) : (
            <PlanItemsList items={s.explanationItems} showTitles />
          )}
        </div>
      )}

      {s.objectiveItems.length > 0 && (
        <div>
          <SectionLabel>Objectives</SectionLabel>
          <PlanItemsList items={s.objectiveItems} />
        </div>
      )}

      {s.conceptItems.length > 0 && (
        <div>
          <SectionLabel>Key concepts</SectionLabel>
          <PlanItemsList items={s.conceptItems} showTitles />
        </div>
      )}

      {s.vocabWords.length > 0 && (
        <div>
          <SectionLabel>Vocabulary / key terms</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.vocabWords.map((word) => (
              <span
                key={word}
                style={{
                  fontSize: 13,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,.06)',
                  color: 'var(--vl)',
                }}
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {(s.visualItems.length > 0 || s.images.length > 0 || (showLessonVideo && s.videoFilename)) && (
        <div>
          <SectionLabel>Images / media</SectionLabel>
          {s.visualItems.length > 0 && !s.images.length && <PlanItemsList items={s.visualItems} showTitles />}
          {showLessonVideo && s.videoFilename && (
            <div style={{ fontSize: 13, color: 'var(--g3)', marginBottom: s.images.length ? 10 : 0 }}>
              Video: <code>{s.videoFilename}</code>
            </div>
          )}
          {s.images.length > 0 && (
            <div
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              }}
            >
              {s.images.map((img, i) => {
                const src = img.image_url?.startsWith('http')
                  ? img.image_url
                  : `${API_BASE}${img.image_url ?? ''}`;
                return (
                  <figure key={i} style={{ margin: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={img.caption ?? img.description ?? `Lesson image ${i + 1}`}
                      style={{ width: '100%', borderRadius: 8, display: 'block' }}
                    />
                    {(img.caption || img.description) && (
                      <figcaption style={{ fontSize: 10, color: 'var(--g3)', marginTop: 4 }}>
                        {img.caption ?? img.description}
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          )}
        </div>
      )}

      {s.activityItems.length > 0 && (
        <div>
          <SectionLabel>Activities / experiments</SectionLabel>
          <PlanItemsList items={s.activityItems} showTitles />
        </div>
      )}

      {s.summaryItems.length > 0 && (
        <div>
          <SectionLabel>Summary</SectionLabel>
          <PlanItemsList items={s.summaryItems} />
        </div>
      )}

      {(s.quiz || s.quizPlanItems.length > 0) && (
        <div>
          <SectionLabel>Quiz / questions</SectionLabel>
          {s.quiz ? <QuizPreview quiz={s.quiz} /> : <PlanItemsList items={s.quizPlanItems} showTitles />}
        </div>
      )}

      {detailHref && (
        <Link href={detailHref} style={{ fontSize: 12, color: 'var(--mint)', marginTop: 4 }}>
          Open full lesson detail →
        </Link>
      )}
    </div>
  );
}
