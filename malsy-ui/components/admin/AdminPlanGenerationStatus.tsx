'use client';

import type { BookPlan, BookRecord } from '../../lib/admin-api';
import { isPlanGenerating, resolvePlanStatus } from '../../lib/admin-book-workflow';

export function AdminPlanGenerationStatus({
  book,
  plan,
  feedback,
}: {
  book: BookRecord;
  plan?: BookPlan | null;
  feedback?: 'success' | 'error' | null;
}) {
  const planStatus = resolvePlanStatus(book, plan);
  const generating = isPlanGenerating(book, plan);
  const planError = plan?.plan_error || book.plan_error;

  if (generating) {
    return (
      <div
        className="card"
        style={{
          padding: '16px 20px',
          borderRadius: 14,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          border: '1px solid rgba(110,181,255,.25)',
          background: 'rgba(110,181,255,.08)',
        }}
        role="status"
        aria-live="polite"
      >
        <div className="modal-spinner" aria-hidden />
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--w)', marginBottom: 4 }}>
            Generating lesson plans…
          </div>
          <div style={{ fontSize: 13, color: 'var(--g3)', lineHeight: 1.5 }}>
            AI is building lesson plans for each lesson in this book. This may take a few minutes.
          </div>
        </div>
      </div>
    );
  }

  if (feedback === 'success' && planStatus === 'draft') {
    return (
      <div
        className="card"
        style={{
          padding: '14px 18px',
          borderRadius: 14,
          marginBottom: 24,
          border: '1px solid rgba(0,229,160,.25)',
          background: 'rgba(0,229,160,.08)',
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--mint)',
        }}
        role="status"
        aria-live="polite"
      >
        Lesson plans generated successfully.
      </div>
    );
  }

  if (feedback === 'error' || planStatus === 'failed') {
    return (
      <div
        className="card"
        style={{
          padding: '14px 18px',
          borderRadius: 14,
          marginBottom: 24,
          border: '1px solid rgba(255,107,107,.3)',
          background: 'rgba(255,107,107,.08)',
          fontSize: 14,
          color: 'var(--coral)',
          lineHeight: 1.5,
        }}
        role="alert"
      >
        <div style={{ fontWeight: 800, marginBottom: planError ? 6 : 0 }}>
          Lesson plan generation failed.
        </div>
        {planError && <div style={{ fontSize: 13 }}>{planError}</div>}
      </div>
    );
  }

  return null;
}
