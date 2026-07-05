'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  adminApi,
  AdminLessonContent,
  BookDetailResponse,
  BookPlan,
  BookRecord,
} from '../../lib/admin-api';
import { AdminNormalizedLesson, normalizeAdminLessons, resolveLessonDisplayTitle } from '../../lib/admin-lessons-normalize';
import { AdminLessonAccordionCard } from './AdminLessonAccordionCard';

function planStatusLabel(status?: string | null): string {
  switch (status) {
    case 'generating':
      return 'Generating plan…';
    case 'draft':
      return 'Draft — review required';
    case 'approved':
      return 'Plan approved';
    case 'failed':
      return 'Plan generation failed';
    default:
      return 'No plan yet';
  }
}

function planStatusColor(status?: string | null): string {
  switch (status) {
    case 'generating':
      return '#f0ad4e';
    case 'draft':
      return '#6eb5ff';
    case 'approved':
      return 'var(--mint)';
    case 'failed':
      return 'var(--coral)';
    default:
      return 'var(--g3)';
  }
}

export function AdminBookLessonsPanel({
  book,
  compact = false,
  onRefresh,
  showDetailLinks = true,
  showPlanActions = false,
}: {
  book: BookRecord;
  compact?: boolean;
  onRefresh?: () => void;
  showDetailLinks?: boolean;
  showPlanActions?: boolean;
}) {
  const bookId = book.book_id;
  const [data, setData] = useState<BookDetailResponse | null>(null);
  const [plan, setPlan] = useState<BookPlan | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [lessonCache, setLessonCache] = useState<Record<string, AdminLessonContent>>({});
  const [lessonLoading, setLessonLoading] = useState<string | null>(null);
  const [lessonError, setLessonError] = useState<Record<string, string>>({});
  const [visBusy, setVisBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [detail, planRes] = await Promise.all([
        adminApi.books.get(bookId),
        adminApi.books.getPlan(bookId).catch(() => null),
      ]);
      setData(detail);
      setPlan(planRes);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load book lessons');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    if (book.status !== 'processed' && book.status !== 'processing') {
      setLoading(false);
      return;
    }
    setLessonCache({});
    setExpandedKey(null);
    load();
  }, [book.status, book.unit_count, book.processed_at, book.visible_to_students, load]);

  useEffect(() => {
    const status = plan?.plan_status ?? book.plan_status;
    if (status !== 'generating') return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [plan?.plan_status, book.plan_status, load]);

  const planStatus = plan?.plan_status ?? book.plan_status;
  const lessons = normalizeAdminLessons(bookId, {
    plan,
    bookDetail: data,
    bookTitle: book.title ?? data?.book?.title,
    log: false,
  });

  async function toggleLesson(lesson: AdminNormalizedLesson) {
    if (expandedKey === lesson.key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(lesson.key);
    if (lessonCache[lesson.key]) return;

    setLessonLoading(lesson.key);
    setLessonError((prev) => ({ ...prev, [lesson.key]: '' }));
    try {
      const content = await adminApi.lessons.content(lesson.real_unit_id);
      setLessonCache((prev) => ({ ...prev, [lesson.key]: content }));
    } catch (e) {
      setLessonError((prev) => ({
        ...prev,
        [lesson.key]: e instanceof Error ? e.message : 'Failed to load lesson',
      }));
    } finally {
      setLessonLoading(null);
    }
  }

  async function toggleVisibility() {
    setVisBusy(true);
    try {
      await adminApi.books.setVisibility(bookId, !book.visible_to_students);
      onRefresh?.();
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Visibility update failed');
    } finally {
      setVisBusy(false);
    }
  }

  if (book.status !== 'processed' && book.status !== 'processing') {
    return (
      <div style={{ background: 'rgba(0,0,0,.1)', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--g3)' }}>
          Process the book to generate lessons and the AI lesson plan.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ background: 'rgba(0,0,0,.1)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            AI lesson plan
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 99,
              background: 'rgba(0,0,0,.2)',
              color: planStatusColor(planStatus),
            }}
          >
            {planStatusLabel(planStatus)}
          </span>
        </div>

        {planStatus === 'generating' && (
          <div style={{ fontSize: 13, color: 'var(--g3)', marginBottom: 8 }}>
            AI is analyzing the book and building a subject-specific lesson plan…
          </div>
        )}

        {(plan?.objectives?.length ?? 0) > 0 && (
          <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: 'var(--vl)' }}>
            {plan!.objectives.slice(0, compact ? 3 : undefined).map((o, i) => (
              <li key={i}>{o}</li>
            ))}
            {compact && (plan!.objectives.length ?? 0) > 3 && (
              <li style={{ color: 'var(--g3)', listStyle: 'none', marginLeft: -18 }}>
                +{plan!.objectives.length - 3} more
              </li>
            )}
          </ul>
        )}

        {showPlanActions && !compact && (
          <Link
            href={`/admin/books/${encodeURIComponent(bookId)}`}
            style={{ fontSize: 12, color: 'var(--mint)' }}
          >
            Manage plan & processing →
          </Link>
        )}
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--g3)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            marginBottom: 10,
          }}
        >
          Lessons {lessons.length > 0 ? `(${lessons.length})` : ''}
        </div>

        {loading && lessons.length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <div className="modal-spinner" />
          </div>
        )}

        {loadError && <div style={{ color: 'var(--coral)', fontSize: 12, marginBottom: 10 }}>{loadError}</div>}

        {!loading && lessons.length === 0 && (
          <div
            style={{
              padding: '16px',
              borderRadius: 12,
              background: 'rgba(0,0,0,.12)',
              fontSize: 13,
              color: 'var(--g3)',
            }}
          >
            {planStatus === 'generating'
              ? 'Lessons will appear once the AI lesson plan is ready.'
              : 'No lessons yet. Process the book to generate content.'}
          </div>
        )}

        {lessons.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {lessons.map((lesson) => {
              const cached = lessonCache[lesson.key];
              const displayTitle = resolveLessonDisplayTitle(
                lesson,
                cached,
                bookId,
                book.title ?? data?.book?.title,
              );
              return (
              <AdminLessonAccordionCard
                key={lesson.key}
                lesson={lesson}
                title={displayTitle}
                bookVisible={Boolean(data?.book?.visible_to_students ?? book.visible_to_students)}
                onToggleVisibility={planStatus === 'approved' && !book.archived ? toggleVisibility : undefined}
                visibilityBusy={visBusy}
                expanded={expandedKey === lesson.key}
                onToggle={() => toggleLesson(lesson)}
                content={cached}
                loading={lessonLoading === lesson.key}
                error={lessonError[lesson.key]}
                showDetailLink={showDetailLinks}
              />
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
