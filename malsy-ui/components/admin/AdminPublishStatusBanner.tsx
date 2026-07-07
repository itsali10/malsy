'use client';

import type { BookPlan, BookRecord } from '../../lib/admin-api';
import { isPlanGenerating, resolvePlanStatus } from '../../lib/admin-book-workflow';

export function AdminPublishStatusBanner({
  book,
  plan,
  busy,
  onToggle,
}: {
  book: BookRecord;
  plan?: BookPlan | null;
  busy?: boolean;
  onToggle: () => void;
}) {
  const published = Boolean(book.visible_to_students) && !book.archived;
  const planGenerating = isPlanGenerating(book, plan);
  const planStatus = resolvePlanStatus(book, plan);
  const canPublish =
    book.status === 'processed' &&
    !book.archived &&
    (planStatus === 'approved' || book.processing?.plan_approved);

  return (
    <div
      className="card"
      style={{
        padding: '16px 20px',
        borderRadius: 16,
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        border: published
          ? '1px solid rgba(0,229,160,.25)'
          : '1px solid rgba(255,255,255,.08)',
        background: published ? 'rgba(0,229,160,.06)' : 'rgba(255,255,255,.03)',
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
          Current Status
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--w)' }}>
          {published ? '🟢 Published to Students' : '⚪ Hidden from Students'}
        </div>
        {planGenerating && (
          <div style={{ fontSize: 12, color: '#6eb5ff', marginTop: 6 }}>
            Lesson plans are being generated — publishing is temporarily disabled.
          </div>
        )}
        {!planGenerating && !canPublish && !published && book.status === 'processed' && planStatus !== 'approved' && (
          <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>
            Approve the lesson plan before publishing.
          </div>
        )}
      </div>
      {book.status === 'processed' && !book.archived && (
        <button
          type="button"
          className={published ? 'btn btn-o' : 'btn btn-p'}
          disabled={busy || planGenerating || (!published && !canPublish)}
          onClick={onToggle}
        >
          {busy ? 'Updating…' : published ? 'Hide from Students' : 'Publish to Students'}
        </button>
      )}
    </div>
  );
}
