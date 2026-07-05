'use client';

import type { BookRecord } from '../../lib/admin-api';

const STEPS: { key: keyof NonNullable<BookRecord['processing']>; label: string }[] = [
  { key: 'pdf_uploaded', label: 'Uploaded' },
  { key: 'rag_indexed', label: 'Processed & RAG indexed' },
  { key: 'structure_approved', label: 'Structure approved' },
  { key: 'lesson_plan_generated', label: 'Lesson plan generated' },
  { key: 'plan_approved', label: 'Lesson plan approved' },
  { key: 'visible_to_students', label: 'Visible to students' },
  { key: 'student_sessions_created', label: 'Added to schedule' },
];

export function AdminBookProcessingChecklist({ book }: { book: BookRecord }) {
  const processing = book.processing ?? {};

  return (
    <div className="card" style={{ padding: 16, marginBottom: 24, borderRadius: 14 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--g3)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          marginBottom: 12,
        }}
      >
        Publishing checklist
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {STEPS.map((step) => {
          const done = Boolean(processing[step.key]);
          return (
            <div
              key={step.key}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 99,
                background: done ? 'rgba(110,181,255,.12)' : 'rgba(255,255,255,.04)',
                color: done ? 'var(--mint)' : 'var(--g3)',
                border: `1px solid ${done ? 'rgba(110,181,255,.25)' : 'rgba(255,255,255,.08)'}`,
              }}
            >
              {done ? '✓' : '○'} {step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
