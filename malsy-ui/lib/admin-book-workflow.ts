import type { BookPlan, BookRecord, RagProgress } from './admin-api';

export function resolvePlanStatus(book: BookRecord, plan?: BookPlan | null): string | null | undefined {
  return plan?.plan_status ?? book.plan_status;
}

export function isRagProcessing(
  book: BookRecord,
  opts?: { jobRunning?: boolean; ragProgress?: RagProgress | null },
): boolean {
  if (book.status !== 'processing') return false;
  if (opts?.jobRunning === false) return false;
  if (opts?.ragProgress?.stage && opts.ragProgress.stage !== 'completed' && opts.ragProgress.stage !== 'failed') {
    return true;
  }
  return opts?.jobRunning ?? true;
}

export function canGeneratePlan(
  book: BookRecord,
  plan?: BookPlan | null,
  opts?: { ragProcessing?: boolean },
): boolean {
  if (opts?.ragProcessing || isRagProcessing(book)) return false;
  const planStatus = resolvePlanStatus(book, plan);
  return book.status === 'processed' && (!planStatus || planStatus === 'failed');
}

export function canRegeneratePlan(book: BookRecord, plan?: BookPlan | null): boolean {
  const planStatus = resolvePlanStatus(book, plan);
  return book.status === 'processed' && (planStatus === 'draft' || planStatus === 'approved');
}

export function hasGeneratedLessonPlans(book: BookRecord, plan?: BookPlan | null): boolean {
  const planStatus = resolvePlanStatus(book, plan);
  if (book.status === 'processing') return false;
  if (planStatus === 'draft' || planStatus === 'approved') return true;
  return Boolean(book.processing?.lesson_plan_generated);
}

export function canApprovePlan(book: BookRecord, plan?: BookPlan | null): boolean {
  const planStatus = resolvePlanStatus(book, plan);
  return (
    book.status === 'processed' &&
    planStatus === 'draft' &&
    hasGeneratedLessonPlans(book, plan)
  );
}

export function canApproveStructure(book: BookRecord, hasStructureUnits: boolean): boolean {
  return (
    hasStructureUnits &&
    book.structure_status === 'draft' &&
    book.status !== 'processed' &&
    book.status !== 'processing'
  );
}

export function canReprocessRag(book: BookRecord, opts?: { ragProcessing?: boolean }): boolean {
  if (opts?.ragProcessing || isRagProcessing(book, { jobRunning: true })) return false;
  if (book.status === 'processed' || book.status === 'failed') return true;
  if (book.status === 'processing') {
    return Boolean(book.processed_at || book.plan_status);
  }
  return false;
}

export function canPublishBook(
  book: BookRecord,
  plan?: BookPlan | null,
  opts?: { ragProcessing?: boolean },
): boolean {
  if (opts?.ragProcessing || isRagProcessing(book)) return false;
  return (
    book.status === 'processed' &&
    !book.archived &&
    resolvePlanStatus(book, plan) === 'approved'
  );
}

export function isPlanGenerating(book: BookRecord, plan?: BookPlan | null): boolean {
  return resolvePlanStatus(book, plan) === 'generating';
}
