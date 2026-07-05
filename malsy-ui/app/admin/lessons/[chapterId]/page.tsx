'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  adminApi,
  AdminGeneratedPlanItem,
  AdminLessonContent,
  AdminListeningQuestion,
  AdminLessonPart,
} from '../../../../lib/admin-api';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function ContentBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 20, borderRadius: 16, marginBottom: 16 }}>
      <h2 style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text = 'Not available in stored content.' }: { text?: string }) {
  return <div style={{ color: 'var(--g3)', fontSize: 13 }}>{text}</div>;
}

function Paragraphs({ text }: { text?: string }) {
  if (!text?.trim()) return <Empty />;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
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

function asPlanItems(raw: unknown[] | undefined): AdminGeneratedPlanItem[] {
  return (raw ?? []).filter((i): i is AdminGeneratedPlanItem => typeof i === 'object' && i !== null);
}

function titleMatches(item: AdminGeneratedPlanItem, pattern: RegExp): boolean {
  return pattern.test(String(item.title ?? ''));
}

function keywordsFromItems(items: AdminGeneratedPlanItem[]): string[] {
  const words: string[] = [];
  for (const item of items) {
    for (const kw of item.keywords ?? []) {
      const w = String(kw).trim();
      if (w && !words.includes(w)) words.push(w);
    }
  }
  return words;
}

function PlanItemsBody({ items, showTitles = false }: { items: AdminGeneratedPlanItem[]; showTitles?: boolean }) {
  if (!items.length) return <Empty />;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {items.map((item, i) => {
        const keywords = (item.keywords ?? []).map(String).filter(Boolean);
        return (
          <div key={item.id ?? `${item.title}-${i}`}>
            {showTitles && item.title && (
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: keywords.length ? 8 : 0 }}>{item.title}</div>
            )}
            {keywords.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                {keywords.map((kw) => (
                  <li key={kw} style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--vl)' }}>
                    {kw}
                  </li>
                ))}
              </ul>
            ) : item.title ? (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--vl)' }}>{item.title}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function QuizView({ quiz }: { quiz?: Record<string, unknown> | null }) {
  if (!quiz) return <Empty />;
  const question = String(quiz.question ?? quiz.prompt ?? '');
  const options = Array.isArray(quiz.options) ? (quiz.options as string[]) : [];
  const correct = String(quiz.correct_answer ?? '');
  const sentence = quiz.sentence ? String(quiz.sentence) : '';
  const type = quiz.type ? String(quiz.type) : '';

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {type && (
        <div style={{ fontSize: 11, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {type}
        </div>
      )}
      {sentence && (
        <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--vl)' }}>&ldquo;{sentence}&rdquo;</div>
      )}
      {question && <div style={{ fontSize: 15, fontWeight: 700 }}>{question}</div>}
      {options.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
          {options.map((opt) => (
            <li
              key={opt}
              style={{
                fontSize: 14,
                color: opt === correct ? 'var(--mint)' : 'var(--vl)',
                fontWeight: opt === correct ? 700 : 400,
              }}
            >
              {opt}
              {opt === correct ? ' ✓' : ''}
            </li>
          ))}
        </ul>
      )}
      {correct && !options.includes(correct) && (
        <div style={{ fontSize: 13, color: 'var(--mint)' }}>
          <strong>Answer:</strong> {correct}
        </div>
      )}
      {Array.isArray(quiz.expected_points) && quiz.expected_points.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--g3)' }}>
          <strong>Expected points:</strong>{' '}
          {(quiz.expected_points as string[]).join(' ')}
        </div>
      )}
    </div>
  );
}

function ListeningQuestions({ questions }: { questions?: AdminListeningQuestion[] }) {
  if (!questions?.length) return <Empty />;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {questions.map((q, i) => (
        <div key={q.id ?? i} style={{ padding: '12px 0', borderTop: i ? '1px solid rgba(255,255,255,.06)' : undefined }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{q.question}</div>
          {q.options?.map((opt) => (
            <div
              key={opt}
              style={{
                fontSize: 13,
                padding: '4px 0',
                color: opt === q.correct_answer ? 'var(--mint)' : 'var(--g3)',
                fontWeight: opt === q.correct_answer ? 700 : 400,
              }}
            >
              {opt}
              {opt === q.correct_answer ? ' ✓' : ''}
            </div>
          ))}
          {q.explanation && (
            <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 8 }}>{q.explanation}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function PartBlock({ part }: { part: AdminLessonPart }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--g3)', marginBottom: 10 }}>
        Part {part.part + 1}
      </div>
      <Paragraphs text={part.teacher_text} />
      {part.quiz && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Quiz</div>
          <QuizView quiz={part.quiz as Record<string, unknown>} />
        </div>
      )}
    </div>
  );
}

export default function AdminLessonContentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const chapterId = decodeURIComponent(String(params.chapterId ?? ''));
  const studentId = searchParams.get('student') ?? undefined;
  const moduleKey = searchParams.get('module') ?? undefined;
  const backHref = studentId ? `/admin/students/${encodeURIComponent(studentId)}` : '/admin/books';
  const [data, setData] = useState<AdminLessonContent | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminApi.lessons
      .content(chapterId, studentId, moduleKey)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load lesson'))
      .finally(() => setLoading(false));
  }, [chapterId, studentId, moduleKey]);

  const meta = data?.lesson_meta;
  const view = data?.student_view;
  const gen = data?.generated_content;
  const title = data?.lesson_title ?? meta?.name ?? chapterId;
  const media = view?.media;
  const images = media?.interactive_images ?? [];
  const supportsListening = data?.supports_listening ?? false;

  const explanationSource = asPlanItems(gen?.explanation_items);
  const objectiveItems = explanationSource.filter((i) => titleMatches(i, /objectives?/i));
  const conceptItems = [
    ...asPlanItems(gen?.concepts),
    ...explanationSource.filter((i) => titleMatches(i, /concept/i)),
  ];
  const explanationItems = explanationSource.filter(
    (i) =>
      !titleMatches(i, /objectives?/i) &&
      !titleMatches(i, /concept/i) &&
      !titleMatches(i, /summary|wrap-up|wrap up/i),
  );
  const vocabWords =
    (view?.vocabulary?.length ? view.vocabulary : keywordsFromItems(asPlanItems(gen?.vocabulary))) ?? [];
  const quizPlanMeta = asPlanItems(gen?.quiz);
  const experimentItems = quizPlanMeta.filter((i) => titleMatches(i, /experiment/i));
  const quizPlanItems = quizPlanMeta.filter(
    (i) => titleMatches(i, /quiz|review/i) && !titleMatches(i, /experiment/i),
  );
  const activityPool = [...asPlanItems(gen?.activities), ...experimentItems];
  const visualItems = activityPool.filter((i) => i.type === 'visual' || titleMatches(i, /diagram|image/i));
  const activityItems = activityPool.filter(
    (i) => i.type !== 'visual' && !titleMatches(i, /diagram|image|quiz|review/i),
  );
  const summaryItems = asPlanItems(gen?.summary).concat(
    explanationSource.filter((i) => titleMatches(i, /summary|wrap-up|wrap up/i)),
  );

  const hasExplanation = Boolean(view?.teacher_text?.trim()) || explanationItems.length > 0 || conceptItems.length > 0;
  const hasObjectives = objectiveItems.length > 0;
  const hasVocabulary = vocabWords.length > 0;
  const hasActivities = activityItems.length > 0;
  const hasSummary = summaryItems.length > 0;
  const hasQuiz = Boolean(view?.quiz) || quizPlanItems.length > 0;
  const hasImages = images.length > 0 || visualItems.length > 0;

  return (
    <div className="page-enter" style={{ padding: 28, maxWidth: 960 }}>
      <Link href={backHref} style={{ fontSize: 13, color: 'var(--g3)', display: 'inline-block', marginBottom: 20 }}>
        ← Back
      </Link>

      <h1 style={{ fontFamily: 'var(--fd)', fontSize: 26, fontWeight: 800, marginBottom: 6 }}>{title}</h1>
      <p style={{ color: 'var(--g3)', fontSize: 14, marginBottom: 8 }}>
        {meta ? `${meta.subject_title} · ${meta.module_title}` : chapterId}
      </p>
      {meta?.description && <p style={{ color: 'var(--vl)', fontSize: 14, marginBottom: 12 }}>{meta.description}</p>}
      {moduleKey && (
        <p style={{ color: 'var(--g3)', fontSize: 13, marginBottom: 12 }}>
          Module: {meta?.module_title ?? moduleKey.replace('english_', '').replace('_', ' ')}
        </p>
      )}
      {view?.storage_note && (
        <p style={{ color: 'var(--amber)', fontSize: 13, marginBottom: 16 }}>{view.storage_note}</p>
      )}
      {view?.session_student_id && (
        <p style={{ color: 'var(--g3)', fontSize: 12, marginBottom: 16 }}>
          Stored session from student {view.session_student_id}
        </p>
      )}

      {error && <div style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</div>}
      {loading && <div className="modal-spinner" style={{ margin: '40px auto' }} />}

      {data && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 10,
              marginBottom: 24,
            }}
          >
            {[
              ['Explanation', data.summary.has_teacher_text ? 'Yes' : 'No'],
              ...(supportsListening ? [['Listening', data.summary.has_listening ? 'Yes' : 'No'] as const] : []),
              ['Stored session', data.summary.has_stored_session ? 'Yes' : 'No'],
              ['Book content', data.summary.has_book_content ? 'Yes' : 'No'],
            ].map(([label, val]) => (
              <div key={String(label)} className="card" style={{ padding: 14, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--g3)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{val}</div>
              </div>
            ))}
          </div>

          {(view?.module_items?.length ?? 0) > 0 && (
            <ContentBlock title="Module content">
              <div style={{ display: 'grid', gap: 10 }}>
                {(view?.module_items as { title?: string; type?: string; keywords?: string[] }[]).map((item, i) => (
                  <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid rgba(255,255,255,.06)' : undefined }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.title ?? item.type}</div>
                    {item.keywords?.length ? (
                      <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 6 }}>
                        {item.keywords.join(', ')}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </ContentBlock>
          )}

          {(view?.parts?.length ?? 0) > 1 ? (
            <ContentBlock title="Explanation">
              {view?.parts?.map((part) => <PartBlock key={part.part} part={part} />)}
            </ContentBlock>
          ) : hasExplanation ? (
            <ContentBlock title="Explanation">
              {view?.teacher_text?.trim() ? (
                <Paragraphs text={view.teacher_text} />
              ) : (
                <PlanItemsBody items={[...explanationItems, ...conceptItems]} showTitles />
              )}
            </ContentBlock>
          ) : null}

          {hasObjectives && (
            <ContentBlock title="Objectives">
              <PlanItemsBody items={objectiveItems} />
            </ContentBlock>
          )}

          {conceptItems.length > 0 && view?.teacher_text?.trim() && (
            <ContentBlock title="Key concepts">
              <PlanItemsBody items={conceptItems} showTitles />
            </ContentBlock>
          )}

          {hasVocabulary && (
            <ContentBlock title="Vocabulary">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {vocabWords.map((word) => (
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
            </ContentBlock>
          )}

          {hasImages && (
            <ContentBlock title="Images / diagrams">
              {visualItems.length > 0 && !images.length && <PlanItemsBody items={visualItems} showTitles />}
              {images.length > 0 && (
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  {images.map((img, i) => {
                    const src = img.image_url?.startsWith('http')
                      ? img.image_url
                      : `${API_BASE}${img.image_url ?? ''}`;
                    return (
                      <figure key={i} style={{ margin: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={img.caption ?? img.description ?? `Lesson image ${i + 1}`}
                          style={{ width: '100%', borderRadius: 10, display: 'block' }}
                        />
                        {(img.caption || img.description) && (
                          <figcaption style={{ fontSize: 11, color: 'var(--g3)', marginTop: 6 }}>
                            {img.caption ?? img.description}
                          </figcaption>
                        )}
                      </figure>
                    );
                  })}
                </div>
              )}
            </ContentBlock>
          )}

          {hasActivities && (
            <ContentBlock title="Activities / experiments">
              <PlanItemsBody items={activityItems} showTitles />
            </ContentBlock>
          )}

          {hasSummary && (
            <ContentBlock title="Summary">
              <PlanItemsBody items={summaryItems} />
            </ContentBlock>
          )}

          {supportsListening && (
            <>
              <ContentBlock title="Listening story">
                <Paragraphs text={view?.listening?.transcript || view?.listening?.narration_text} />
              </ContentBlock>

              <ContentBlock title="Listening questions">
                <ListeningQuestions questions={view?.listening?.questions} />
              </ContentBlock>
            </>
          )}

          {hasQuiz && (
            <ContentBlock title="Quiz">
              {view?.quiz ? <QuizView quiz={view.quiz} /> : <PlanItemsBody items={quizPlanItems} showTitles />}
            </ContentBlock>
          )}

          {data.book_unit_content?.text && (
            <ContentBlock title="Textbook content (stored)">
              <Paragraphs text={String(data.book_unit_content.text)} />
            </ContentBlock>
          )}

          {media?.video_filename && (
            <ContentBlock title="Media">
              <div style={{ fontSize: 13, color: 'var(--vl)' }}>
                Lesson video: <code>{media.video_filename}</code>
              </div>
            </ContentBlock>
          )}
        </>
      )}
    </div>
  );
}
