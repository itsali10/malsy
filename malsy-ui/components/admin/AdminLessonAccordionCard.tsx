'use client';

import type { AdminLessonContent } from '../../lib/admin-api';
import type { AdminNormalizedLesson } from '../../lib/admin-lessons-normalize';
import { AdminLessonContentPreview } from './AdminLessonContentPreview';
import { AdminLessonRowActions } from './AdminLessonRowActions';

function pageRange(lesson: AdminNormalizedLesson): string | null {
  if (lesson.start_page == null && lesson.end_page == null) return null;
  return `Pages ${lesson.start_page ?? '?'}–${lesson.end_page ?? '?'}`;
}

export function AdminLessonAccordionCard({
  lesson,
  title,
  expanded,
  onToggle,
  content,
  loading,
  error,
  showDetailLink = true,
  bookVisible,
  onToggleVisibility,
  visibilityBusy,
  canEditTitle,
  editedTitle,
  onTitleChange,
  bookProcessed,
  backHref,
}: {
  lesson: AdminNormalizedLesson;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  content?: AdminLessonContent | null;
  loading?: boolean;
  error?: string;
  showDetailLink?: boolean;
  bookVisible?: boolean;
  onToggleVisibility?: () => void;
  visibilityBusy?: boolean;
  canEditTitle?: boolean;
  editedTitle?: string;
  onTitleChange?: (title: string) => void;
  bookProcessed?: boolean;
  backHref?: string;
}) {
  const resolvedTitle = (canEditTitle ? editedTitle ?? title : title).trim() || 'Untitled lesson';
  const pages = pageRange(lesson);

  return (
    <article
      className="card"
      style={{
        borderRadius: 14,
        background: 'rgba(0,0,0,.18)',
        border: expanded ? '1px solid rgba(110,181,255,.25)' : '1px solid rgba(255,255,255,.06)',
        overflow: 'hidden',
      }}
    >
      {canEditTitle && onTitleChange ? (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Edit lesson title
          </div>
          <input
            value={editedTitle ?? title}
            onChange={(e) => onTitleChange(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,.12)',
              background: 'rgba(0,0,0,.2)',
              color: 'inherit',
              fontSize: 15,
              fontWeight: 700,
            }}
          />
          {pages && <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 6 }}>{pages}</div>}
          <button
            type="button"
            className="btn btn-o btn-sm"
            style={{ marginTop: 12 }}
            onClick={onToggle}
            disabled={loading}
          >
            {loading ? 'Loading…' : expanded ? 'Hide lesson plan' : 'View lesson plan'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={loading}
          aria-expanded={expanded}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            padding: '14px 16px',
            border: 'none',
            background: expanded ? 'rgba(110,181,255,.06)' : 'transparent',
            color: 'inherit',
            textAlign: 'left',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          <span
            aria-hidden
            style={{
              fontSize: 12,
              color: 'var(--mint)',
              flexShrink: 0,
              width: 16,
              transition: 'transform .2s',
              transform: expanded ? 'rotate(90deg)' : 'none',
            }}
          >
            ▶
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontSize: 17,
                fontWeight: 800,
                lineHeight: 1.35,
                color: 'var(--w)',
              }}
            >
              {loading ? 'Loading…' : resolvedTitle}
            </span>
            {pages && (
              <span style={{ display: 'block', fontSize: 12, color: 'var(--g3)', marginTop: 4 }}>
                {pages}
              </span>
            )}
          </span>
          {!loading && (
            <span style={{ fontSize: 11, color: 'var(--g3)', flexShrink: 0 }}>
              {expanded ? 'Hide' : 'View plan'}
            </span>
          )}
        </button>
      )}

      {bookProcessed && lesson.real_unit_id && (
        <div style={{ padding: '0 16px 12px' }}>
          <AdminLessonRowActions
            chapterId={lesson.real_unit_id}
            lessonTitle={resolvedTitle}
            bookProcessed={bookProcessed}
            backHref={backHref}
          />
        </div>
      )}

      {error && <div style={{ color: 'var(--coral)', fontSize: 12, padding: '0 16px 12px' }}>{error}</div>}

      {expanded && (
        <div
          style={{
            padding: '0 16px 16px',
            borderTop: '1px solid rgba(255,255,255,.06)',
          }}
        >
          {(bookVisible != null || onToggleVisibility) && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                padding: '12px 0',
              }}
            >
              {bookVisible != null && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 99,
                    background: bookVisible ? 'rgba(0,229,160,.12)' : 'rgba(255,255,255,.06)',
                    color: bookVisible ? 'var(--mint)' : 'var(--g3)',
                  }}
                >
                  {bookVisible ? 'Visible to students' : 'Hidden from students'}
                </span>
              )}
              {onToggleVisibility && (
                <button
                  type="button"
                  className="btn btn-o btn-sm"
                  disabled={visibilityBusy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility();
                  }}
                >
                  {visibilityBusy ? '…' : bookVisible ? 'Hide book' : 'Show book'}
                </button>
              )}
            </div>
          )}

          {content ? (
            <AdminLessonContentPreview
              content={content}
              showTitle={false}
              compact
              detailHref={
                showDetailLink
                  ? `/admin/lessons/${encodeURIComponent(content.chapter_id)}`
                  : undefined
              }
            />
          ) : loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <div className="modal-spinner" />
            </div>
          ) : (
            <div style={{ color: 'var(--g3)', fontSize: 13, padding: '8px 0' }}>
              No stored lesson content yet.
            </div>
          )}
        </div>
      )}
    </article>
  );
}
