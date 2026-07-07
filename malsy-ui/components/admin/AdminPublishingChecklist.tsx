'use client';

import type { BookPlan, BookRecord, RagProgress } from '../../lib/admin-api';
import { isPlanGenerating, isRagProcessing, resolvePlanStatus } from '../../lib/admin-book-workflow';

type ChecklistStep = {
  key: string;
  label: string;
  done: boolean;
  pending?: boolean;
};

function buildSteps(
  book: BookRecord,
  plan?: BookPlan | null,
  ragProgress?: RagProgress | null,
): ChecklistStep[] {
  const processing = book.processing ?? {};
  const processed = book.status === 'processed';
  const ragActive = isRagProcessing(book, { ragProgress });
  const planStatus = resolvePlanStatus(book, plan);
  const generating = isPlanGenerating(book, plan);

  let ragStep: ChecklistStep;
  if (ragActive && ragProgress?.stage_label) {
    ragStep = {
      key: 'rag',
      label: ragProgress.detail || ragProgress.stage_label,
      done: false,
      pending: true,
    };
  } else if (book.status === 'failed' && ragProgress?.stage === 'failed') {
    ragStep = {
      key: 'rag',
      label: ragProgress.error_message || 'RAG processing failed',
      done: false,
    };
  } else {
    ragStep = {
      key: 'rag',
      label: 'RAG generated',
      done: Boolean(processing.rag_indexed),
    };
  }

  let lessonPlanStep: ChecklistStep;
  if (ragActive) {
    lessonPlanStep = {
      key: 'lesson_plans',
      label: 'Lesson plans (regenerate after RAG)',
      done: false,
    };
  } else if (generating) {
    lessonPlanStep = {
      key: 'lesson_plans',
      label: 'Generating lesson plans…',
      done: false,
      pending: true,
    };
  } else if (planStatus === 'failed') {
    lessonPlanStep = {
      key: 'lesson_plans',
      label: 'Lesson plan generation failed',
      done: false,
    };
  } else {
    lessonPlanStep = {
      key: 'lesson_plans',
      label: 'Lesson plans generated',
      done: Boolean(processing.lesson_plan_generated),
    };
  }

  let plansApprovedStep: ChecklistStep;
  if (ragActive) {
    plansApprovedStep = {
      key: 'plans_approved',
      label: 'Lesson plans approved',
      done: false,
    };
  } else {
    plansApprovedStep = {
      key: 'plans_approved',
      label: 'Lesson plans approved',
      done: Boolean(processing.plan_approved) || planStatus === 'approved',
    };
  }

  return [
    { key: 'uploaded', label: 'Book uploaded', done: Boolean(processing.pdf_uploaded) },
    {
      key: 'processed',
      label: ragActive ? (ragProgress?.stage_label || 'Processing book') : 'Book processed',
      done: processed,
      pending: ragActive,
    },
    { key: 'units', label: 'Units detected', done: Boolean(processing.units_detected) && !ragActive },
    { key: 'lessons', label: 'Lessons detected', done: Boolean(processing.lessons_detected) && !ragActive },
    ragStep,
    lessonPlanStep,
    plansApprovedStep,
    {
      key: 'visibility',
      label: book.visible_to_students ? 'Published to students' : 'Subject visibility status',
      done: Boolean(processing.visible_to_students),
    },
  ];
}

export function AdminPublishingChecklist({
  book,
  plan,
  ragProgress,
}: {
  book: BookRecord;
  plan?: BookPlan | null;
  ragProgress?: RagProgress | null;
}) {
  const steps = buildSteps(book, plan, ragProgress);

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
      <div style={{ display: 'grid', gap: 8 }}>
        {steps.map((step) => (
          <div
            key={step.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              fontWeight: 600,
              color: step.pending ? '#6eb5ff' : step.done ? 'var(--mint)' : 'var(--g3)',
            }}
          >
            <span aria-hidden style={{ width: 18, textAlign: 'center', flexShrink: 0 }}>
              {step.pending ? (
                <span
                  className="modal-spinner"
                  style={{ width: 14, height: 14, display: 'inline-block', verticalAlign: 'middle' }}
                />
              ) : step.done ? (
                '✓'
              ) : (
                '○'
              )}
            </span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
