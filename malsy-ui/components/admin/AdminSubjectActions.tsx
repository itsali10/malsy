'use client';

import type { BookPlan, BookRecord, RagProgress } from '../../lib/admin-api';
import {
  canApprovePlan,
  canApproveStructure,
  canGeneratePlan,
  canPublishBook,
  canRegeneratePlan,
  canReprocessRag,
  isPlanGenerating,
  isRagProcessing,
} from '../../lib/admin-book-workflow';

export function AdminSubjectActions({
  book,
  plan,
  hasStructureUnits,
  busy,
  onGeneratePlan,
  onRegeneratePlan,
  onApprovePlan,
  onApproveStructure,
  onReprocessRag,
  onToggleVisibility,
  onArchiveSubject,
  subjectArchived,
  subjectName,
  showArchiveSubject = true,
  ragProgress,
  ragJobActive = false,
}: {
  book: BookRecord;
  plan?: BookPlan | null;
  hasStructureUnits: boolean;
  busy: string;
  onGeneratePlan: () => void;
  onRegeneratePlan: () => void;
  onApprovePlan: () => void;
  onApproveStructure: () => void;
  onReprocessRag: () => void;
  onToggleVisibility: () => void;
  onArchiveSubject: () => void;
  subjectArchived?: boolean;
  subjectName: string;
  showArchiveSubject?: boolean;
  ragProgress?: RagProgress | null;
  ragJobActive?: boolean;
}) {
  const published = Boolean(book.visible_to_students) && !book.archived;
  const planGenerating = isPlanGenerating(book, plan);
  const ragProcessing = isRagProcessing(book, { jobRunning: ragJobActive, ragProgress });
  const actionsLocked = planGenerating || ragProcessing || !!busy;

  const showGenerate = canGeneratePlan(book, plan, { ragProcessing }) || planGenerating;
  const showRegenerate = (canRegeneratePlan(book, plan) && !canGeneratePlan(book, plan, { ragProcessing })) || planGenerating;
  const showApprovePlan = canApprovePlan(book, plan);
  const showApproveStructure = canApproveStructure(book, hasStructureUnits);
  const showReprocess = canReprocessRag(book, { ragProcessing }) || ragProcessing;
  const showPublish = book.status === 'processed' && !book.archived;

  function handleArchiveSubject() {
    const message = subjectArchived
      ? `Restore "${subjectName}" for admin use?`
      : `Archive "${subjectName}"? The subject will be hidden from admin lists until restored. Student progress and schedules are not deleted.`;
    if (!confirm(message)) return;
    onArchiveSubject();
  }

  return (
    <section className="card" style={{ padding: 18, borderRadius: 16, marginBottom: 24 }}>
      <h2 style={{ fontFamily: 'var(--fd)', fontSize: 16, fontWeight: 800, margin: '0 0 14px' }}>
        Admin actions
      </h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {showGenerate && (
          <button
            type="button"
            className="btn btn-p btn-sm"
            disabled={actionsLocked}
            onClick={onGeneratePlan}
          >
            {planGenerating || busy === 'generate' ? 'Generating lesson plans…' : 'Generate Plan'}
          </button>
        )}
        {showRegenerate && !planGenerating && (
          <button
            type="button"
            className="btn btn-o btn-sm"
            disabled={actionsLocked}
            onClick={onRegeneratePlan}
          >
            {busy === 'regen' ? 'Regenerating…' : 'Regenerate Plan'}
          </button>
        )}
        {showApproveStructure && (
          <button
            type="button"
            className="btn btn-p btn-sm"
            disabled={actionsLocked}
            onClick={onApproveStructure}
          >
            {busy === 'approve-rag' || (ragProcessing && busy !== 'reprocess')
              ? 'Processing…'
              : 'Approve & Run RAG Pipeline'}
          </button>
        )}
        {showApprovePlan && (
          <button
            type="button"
            className="btn btn-p btn-sm"
            disabled={actionsLocked}
            title="Review each lesson with View Plan before approving"
            onClick={onApprovePlan}
          >
            {busy === 'approve-plan' ? 'Approving…' : 'Approve Plan'}
          </button>
        )}
        {showReprocess && (
          <button
            type="button"
            className="btn btn-o btn-sm"
            disabled={actionsLocked}
            onClick={onReprocessRag}
          >
            {busy === 'reprocess' || ragProcessing ? 'Reprocessing RAG…' : 'Reprocess RAG'}
          </button>
        )}
        {showPublish && (
          <button
            type="button"
            className={published ? 'btn btn-o btn-sm' : 'btn btn-p btn-sm'}
            disabled={actionsLocked || (!published && !canPublishBook(book, plan, { ragProcessing }))}
            title={
              ragProcessing
                ? 'Wait for RAG processing to finish'
                : planGenerating
                ? 'Wait for lesson plan generation to finish'
                : !published && !canPublishBook(book, plan, { ragProcessing })
                  ? 'Approve the lesson plan before publishing'
                  : undefined
            }
            onClick={onToggleVisibility}
          >
            {busy === 'vis'
              ? 'Updating…'
              : published
                ? 'Hide from Students'
                : 'Publish to Students'}
          </button>
        )}
        {showArchiveSubject && (
          <button
            type="button"
            className="btn btn-o btn-sm"
            disabled={actionsLocked}
            onClick={handleArchiveSubject}
          >
            {busy === 'subj-arch'
              ? 'Updating…'
              : subjectArchived
                ? 'Restore Subject'
                : 'Archive Subject'}
          </button>
        )}
      </div>
    </section>
  );
}
