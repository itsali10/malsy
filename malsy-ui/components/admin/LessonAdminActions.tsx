'use client';

import { useState } from 'react';
import { adminApi, AdminLessonContent } from '../../lib/admin-api';
import { AdminLessonContentPreview } from './AdminLessonContentPreview';
import { AdminLessonRowActions } from './AdminLessonRowActions';

export function LessonAdminActions({
  chapterId,
  lessonTitle,
  bookProcessed,
  backHref,
}: {
  chapterId: string;
  lessonTitle: string;
  bookProcessed: boolean;
  backHref?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<AdminLessonContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function togglePlan() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (content) return;

    setLoading(true);
    setError('');
    try {
      const loaded = await adminApi.lessons.content(chapterId);
      setContent(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load lesson plan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {bookProcessed && (
          <button
            type="button"
            className="btn btn-o btn-sm"
            disabled={loading}
            onClick={togglePlan}
          >
            {loading ? 'Loading…' : expanded ? 'Hide Plan' : 'View Plan'}
          </button>
        )}
        <AdminLessonRowActions
          chapterId={chapterId}
          lessonTitle={lessonTitle}
          bookProcessed={bookProcessed}
          backHref={backHref}
        />
      </div>
      {error && <div style={{ fontSize: 11, color: 'var(--coral)' }}>{error}</div>}
      {expanded && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(0,0,0,.18)',
            border: '1px solid rgba(255,255,255,.06)',
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
              <div className="modal-spinner" />
            </div>
          ) : content ? (
            <AdminLessonContentPreview content={content} showTitle={false} compact />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--g3)' }}>No stored lesson plan yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
