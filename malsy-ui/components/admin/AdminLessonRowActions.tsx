'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AdminQuizPreviewModal } from './AdminQuizPreviewModal';

export function AdminLessonRowActions({
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
  const [quizOpen, setQuizOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState('');

  if (!bookProcessed) return null;

  const previewParams = new URLSearchParams({
    chapter: chapterId,
    title: lessonTitle,
  });
  if (backHref) previewParams.set('back', backHref);

  async function handleRegenerate() {
    if (!confirm(`Regenerate AI content for "${lessonTitle}"? Student progress will not be affected.`)) {
      return;
    }
    setRegenBusy(true);
    setRegenError('');
    try {
      const { adminApi } = await import('../../lib/admin-api');
      await adminApi.lessons.regenerate(chapterId, { lessonTitle });
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : 'Regeneration failed');
    } finally {
      setRegenBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Link
          href={`/admin/preview?${previewParams.toString()}`}
          className="btn btn-p btn-sm"
        >
          View as Student
        </Link>
        <button type="button" className="btn btn-o btn-sm" onClick={() => setQuizOpen(true)}>
          Preview Quiz
        </button>
        <button
          type="button"
          className="btn btn-o btn-sm"
          disabled={regenBusy}
          onClick={handleRegenerate}
        >
          {regenBusy ? 'Regenerating…' : 'Regenerate Lesson'}
        </button>
      </div>
      {regenError && (
        <div style={{ fontSize: 11, color: 'var(--coral)', marginTop: 4, width: '100%' }}>{regenError}</div>
      )}
      <AdminQuizPreviewModal
        chapterId={chapterId}
        lessonTitle={lessonTitle}
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
      />
    </>
  );
}
