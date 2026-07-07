'use client';



import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import { useParams } from 'next/navigation';

import {

  adminApi,

  AdminLessonContent,

  BookDetailResponse,

  BookPlan,

  RagProgress,

  statusColor,

  statusLabel,

} from '../../../../lib/admin-api';

import {

  AdminNormalizedLesson,

  normalizeAdminLessons,

  resolveLessonDisplayTitle,

} from '../../../../lib/admin-lessons-normalize';

import { AdminLessonAccordionCard } from '../../../../components/admin/AdminLessonAccordionCard';

import { AdminBookStructurePanel } from '../../../../components/admin/AdminBookStructurePanel';

import { AdminPublishingChecklist } from '../../../../components/admin/AdminPublishingChecklist';

import { AdminPlanGenerationStatus } from '../../../../components/admin/AdminPlanGenerationStatus';

import { AdminSubjectActions } from '../../../../components/admin/AdminSubjectActions';

import { AdminPublishStatusBanner } from '../../../../components/admin/AdminPublishStatusBanner';

import {
  canGeneratePlan as canGeneratePlanWorkflow,
  canRegeneratePlan as canRegeneratePlanWorkflow,
  isPlanGenerating,
} from '../../../../lib/admin-book-workflow';



function planStatusLabel(status?: string | null): string {

  switch (status) {

    case 'generating': return 'Generating plan…';

    case 'draft': return 'Draft — review required';

    case 'approved': return 'Plan approved';

    case 'failed': return 'Plan generation failed';

    default: return 'No plan yet';

  }

}



function planStatusColor(status?: string | null): string {

  switch (status) {

    case 'generating': return '#f0ad4e';

    case 'draft': return '#6eb5ff';

    case 'approved': return 'var(--mint)';

    case 'failed': return 'var(--coral)';

    default: return 'var(--g3)';

  }

}



export default function AdminBookDetailPage() {

  const params = useParams();

  const bookId = decodeURIComponent(String(params.id ?? ''));

  const [data, setData] = useState<BookDetailResponse | null>(null);

  const [plan, setPlan] = useState<BookPlan | null>(null);

  const [editedUnits, setEditedUnits] = useState<Record<string, string>>({});

  const [error, setError] = useState('');

  const [busy, setBusy] = useState('');

  const [planFeedback, setPlanFeedback] = useState<'success' | 'error' | null>(null);

  const prevPlanStatusRef = useRef<string | null | undefined>(undefined);
  const [ragJobActive, setRagJobActive] = useState(false);
  const [ragProgress, setRagProgress] = useState<RagProgress | null>(null);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [lessonCache, setLessonCache] = useState<Record<string, AdminLessonContent>>({});

  const [lessonLoading, setLessonLoading] = useState<string | null>(null);

  const [lessonError, setLessonError] = useState<Record<string, string>>({});



  const load = useCallback(() => {

    adminApi.books.get(bookId).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));

    adminApi.books.getPlan(bookId).then((p) => {

      setPlan(p);

      const titles: Record<string, string> = {};

      for (const u of p.units ?? []) titles[u.unit_id] = u.title ?? u.unit_id;

      setEditedUnits(titles);

    }).catch(() => setPlan(null));

  }, [bookId]);



  const book = data?.book;



  useEffect(() => { load(); }, [load]);



  useEffect(() => {
    const planStatus = plan?.plan_status ?? book?.plan_status;
    if (planStatus !== 'generating') return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [plan?.plan_status, book?.plan_status, load]);

  useEffect(() => {
    const current = plan?.plan_status ?? book?.plan_status;
    const prev = prevPlanStatusRef.current;
    if (prev === 'generating' && current === 'draft') {
      setPlanFeedback('success');
    } else if (prev === 'generating' && current === 'failed') {
      setPlanFeedback('error');
      setError(book?.plan_error || plan?.plan_error || 'Lesson plan generation failed.');
    }
    prevPlanStatusRef.current = current;
  }, [plan?.plan_status, book?.plan_status, book?.plan_error, plan?.plan_error]);



  useEffect(() => {
    const shouldPoll = ragJobActive || book?.structure_status === 'extracting';
    if (!shouldPoll) return;

    const poll = async () => {
      if (ragJobActive && book?.status === 'processing') {
        try {
          const st = await adminApi.books.processingStatus(bookId);
          if (st.rag_progress) setRagProgress(st.rag_progress);
          if (st.stale && !st.job_running) {
            setRagJobActive(false);
            setRagProgress(st.rag_progress ?? null);
            setError(
              st.error_message ||
                'RAG processing stopped unexpectedly. Click Reprocess RAG to retry.',
            );
            load();
            return;
          }
          if (st.status === 'processed') {
            setRagJobActive(false);
            setRagProgress(st.rag_progress ?? null);
          } else if (st.status === 'failed') {
            setRagJobActive(false);
            setRagProgress(st.rag_progress ?? null);
            setError(st.error_message || st.rag_progress?.error_message || 'RAG processing failed.');
          }
        } catch {
          // keep polling on transient errors
        }
      }
      load();
    };

    const t = setInterval(poll, 2000);
    void poll();
    return () => clearInterval(t);
  }, [ragJobActive, book?.status, book?.structure_status, bookId, load]);



  async function runReprocessRag() {
    setError('');
    setBusy('reprocess');
    try {
      const updated = await adminApi.books.reprocess(bookId);
      setData((prev) =>
        prev
          ? {
              ...prev,
              book: {
                ...updated,
                plan_status: null,
                plan_approved_at: undefined,
                plan_generated_at: undefined,
              },
            }
          : prev,
      );
      setPlan((prev) => (prev ? { ...prev, plan_status: undefined } : prev));
      setRagJobActive(true);
      setRagProgress({
        stage: 'extracting_pdf',
        stage_label: 'Extracting PDF',
        current: 0,
        total: 0,
        batch_current: 0,
        batch_total: 0,
        detail: 'Extracting PDF',
      });
      load();
    } catch (e) {
      setRagJobActive(false);
      setRagProgress(null);
      setError(e instanceof Error ? e.message : 'Reprocess failed');
      load();
    } finally {
      setBusy('');
    }
  }

  async function runApproveStructure() {
    setError('');
    setBusy('approve-rag');
    try {
      const updated = await adminApi.books.approveStructure(bookId);
      setData((prev) => (prev ? { ...prev, book: updated } : prev));
      setRagJobActive(true);
      setRagProgress({
        stage: 'extracting_pdf',
        stage_label: 'Extracting PDF',
        current: 0,
        total: 0,
        batch_current: 0,
        batch_total: 0,
        detail: 'Extracting PDF',
      });
      load();
    } catch (e) {
      setRagJobActive(false);
      setRagProgress(null);
      setError(e instanceof Error ? e.message : 'Approve & Run RAG failed');
      load();
    } finally {
      setBusy('');
    }
  }



  async function runPlanGeneration(action: 'generate' | 'regen') {
    setPlanFeedback(null);
    setError('');
    setBusy(action);
    setData((prev) =>
      prev?.book
        ? { ...prev, book: { ...prev.book, plan_status: 'generating', plan_error: undefined } }
        : prev,
    );
    setPlan((prev) => ({
      ...(prev || { book_id: bookId, units: [], objectives: [], modules: [] }),
      plan_status: 'generating',
      plan_error: undefined,
    }));
    try {
      if (action === 'generate') await adminApi.books.generatePlan(bookId);
      else await adminApi.books.regeneratePlan(bookId);
      load();
    } catch (e) {
      setPlanFeedback('error');
      setError(e instanceof Error ? e.message : 'Plan generation failed');
      load();
    } finally {
      setBusy('');
    }
  }

  async function run(action: string, fn: () => Promise<unknown>) {

    setBusy(action);

    setError('');

    try {

      await fn();

      load();

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Action failed');

    } finally {

      setBusy('');

    }

  }



  const canEditPlan = plan?.plan_status === 'draft';

  const planStatus = plan?.plan_status ?? book?.plan_status;

  const planGenerating = book ? isPlanGenerating(book, plan) : false;

  const canGeneratePlan =
    book && (canGeneratePlanWorkflow(book, plan) || planGenerating);

  const canRegeneratePlan =
    book &&
    ((canRegeneratePlanWorkflow(book, plan) && !canGeneratePlanWorkflow(book, plan)) ||
      planGenerating);



  const lessons = normalizeAdminLessons(bookId, {

    plan,

    bookDetail: data,

    bookTitle: book?.title,

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



  async function saveTitles() {

    const units = Object.entries(editedUnits).map(([unit_id, title]) => ({ unit_id, title }));

    await run('save', () => adminApi.books.updatePlan(bookId, units));

  }



  return (

    <div className="page-enter" style={{ padding: 28, maxWidth: 960 }}>

      <Link href="/admin/books" style={{ fontSize: 13, color: 'var(--g3)', display: 'inline-block', marginBottom: 20 }}>

        ← Back to Student Content

      </Link>



      {!book ? (

        error ? <div style={{ color: 'var(--coral)' }}>{error}</div> : <div className="modal-spinner" style={{ margin: '40px auto' }} />

      ) : (

        <>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>

            <div>

              <div style={{ fontSize: 11, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>

                Book details

              </div>

              <h1 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>{book.title}</h1>

              <div style={{ fontSize: 14, color: 'var(--vl)' }}>

                {book.subject.charAt(0).toUpperCase() + book.subject.slice(1)} · Grade {book.grade}

              </div>

            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

              <span style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 99, background: 'rgba(255,255,255,.06)', color: statusColor(book.status) }}>

                {statusLabel(book.status)}

              </span>

              {book.status === 'processed' && (

                <span style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 99, background: 'rgba(255,255,255,.06)', color: planStatusColor(plan?.plan_status ?? book.plan_status) }}>

                  {planStatusLabel(plan?.plan_status ?? book.plan_status)}

                </span>

              )}

            </div>

          </div>



          {book.error_message && (

            <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'rgba(255,107,107,.3)', color: 'var(--coral)' }}>

              {book.error_message}

            </div>

          )}

          {(book.plan_error || plan?.plan_error) && (

            <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'rgba(255,107,107,.3)', color: 'var(--coral)' }}>

              Plan error: {plan?.plan_error || book.plan_error}

            </div>

          )}



          <AdminPublishingChecklist book={book} plan={plan} ragProgress={ragProgress} />

          <AdminPlanGenerationStatus book={book} plan={plan} feedback={planFeedback} />

          <AdminSubjectActions
            book={book}
            plan={plan}
            hasStructureUnits={(book.unit_count ?? 0) > 0 || (book.lesson_count ?? 0) > 0}
            busy={busy}
            subjectName={book.title}
            showArchiveSubject={false}
            ragProgress={ragProgress}
            ragJobActive={ragJobActive}
            onGeneratePlan={() => runPlanGeneration('generate')}
            onRegeneratePlan={() => runPlanGeneration('regen')}
            onApprovePlan={() => run('approve-plan', () => adminApi.books.approvePlan(bookId))}
            onApproveStructure={runApproveStructure}
            onReprocessRag={runReprocessRag}
            onToggleVisibility={() => run('vis', () => adminApi.books.setVisibility(bookId, !book.visible_to_students))}
            onArchiveSubject={() => undefined}
          />



          <AdminPublishStatusBanner
            book={book}
            plan={plan}
            busy={busy === 'vis'}
            onToggle={() => run('vis', () => adminApi.books.setVisibility(bookId, !book.visible_to_students))}
          />



          <AdminBookStructurePanel book={book} onRefresh={load} readOnly={book.status === 'processed'} />



          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>

            {[

              ['Units', book.unit_count ?? '—'],

              ['Lessons', book.lesson_count ?? book.unit_count ?? '—'],

              ['Chunks', book.chunk_count ?? '—'],

              ['Visible', book.visible_to_students ? 'Yes' : 'No'],

            ].map(([k, v]) => (

              <div key={k} className="card" style={{ padding: 16, borderRadius: 14 }}>

                <div style={{ fontSize: 10, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{k}</div>

                <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>

              </div>

            ))}

          </div>



          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>

            <button className="btn btn-o btn-sm" disabled={!!busy} onClick={() => run('arch', () => adminApi.books.setArchive(bookId, !book.archived))}>

              {book.archived ? 'Restore Book' : 'Archive Book'}

            </button>

          </div>



          {error && <div style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</div>}



          {book.status === 'processed' && (

            <section style={{ marginBottom: 32 }}>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>

                <div>

                  <h2 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 700, margin: 0 }}>Lesson content</h2>

                  <p style={{ fontSize: 13, color: 'var(--g3)', margin: '6px 0 0' }}>

                    Expand a lesson to preview stored content. Titles match the approved book structure.

                  </p>

                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

                  {canEditPlan && (

                    <button className="btn btn-o btn-sm" disabled={!!busy || planGenerating} onClick={() => saveTitles()}>

                      {busy === 'save' ? 'Saving…' : 'Save plan titles'}

                    </button>

                  )}

                  {canEditPlan && (

                    <button
                      className="btn btn-p btn-sm"
                      disabled={!!busy || planGenerating}
                      onClick={() => run('approve-plan', () => adminApi.books.approvePlan(bookId))}
                    >

                      {busy === 'approve-plan' ? 'Approving…' : 'Approve Plan'}

                    </button>

                  )}

                  {canGeneratePlan && (

                    <button
                      className="btn btn-p btn-sm"
                      disabled={!!busy || planGenerating}
                      onClick={() => runPlanGeneration('generate')}
                    >

                      {planGenerating || busy === 'generate' ? 'Generating lesson plans…' : 'Generate lesson plan'}

                    </button>

                  )}

                  {canRegeneratePlan && !planGenerating && (

                    <button
                      className="btn btn-o btn-sm"
                      disabled={!!busy || planGenerating}
                      onClick={() => runPlanGeneration('regen')}
                    >

                      {busy === 'regen' ? 'Regenerating…' : 'Regenerate plan'}

                    </button>

                  )}

                </div>

              </div>



              {lessons.length === 0 ? (

                <div className="card" style={{ padding: 20, color: 'var(--g3)' }}>

                  No lessons indexed yet.

                </div>

              ) : (

                <div style={{ display: 'grid', gap: 10 }}>

                  {lessons.map((lesson) => {

                    const displayTitle = resolveLessonDisplayTitle(

                      lesson,

                      lessonCache[lesson.key],

                      bookId,

                      book?.title,

                    );

                    return (

                      <AdminLessonAccordionCard

                        key={lesson.key}

                        lesson={lesson}

                        title={displayTitle}

                        expanded={expandedKey === lesson.key}

                        onToggle={() => toggleLesson(lesson)}

                        content={lessonCache[lesson.key]}

                        loading={lessonLoading === lesson.key}

                        error={lessonError[lesson.key]}

                        canEditTitle={canEditPlan && (plan?.units?.some((u) => u.unit_id === lesson.unit_id) ?? false)}

                        editedTitle={editedUnits[lesson.unit_id]}

                        onTitleChange={(t) => setEditedUnits((prev) => ({ ...prev, [lesson.unit_id]: t }))}

                        bookProcessed={book.status === 'processed'}

                        backHref={`/admin/books/${encodeURIComponent(bookId)}`}

                      />

                    );

                  })}

                </div>

              )}

            </section>

          )}



          {book.status !== 'processed' && book.structure_status === 'draft' && (

            <p style={{ fontSize: 13, color: 'var(--g3)', marginTop: 8 }}>

              Review unit and lesson titles above, then click <strong>Approve & run RAG pipeline</strong> to index the book and generate lesson plans.

            </p>

          )}

        </>

      )}

    </div>

  );

}


