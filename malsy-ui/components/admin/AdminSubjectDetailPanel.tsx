'use client';



import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import {
  adminApi,
  BookPlan,
  BookRecord,
  BookStructure,
  RagProgress,
  statusColor,
  statusLabel,
} from '../../lib/admin-api';

import {

  processingStatusLabel,

  scheduleStatusLabel,

  SubjectCardModel,

} from '../../lib/admin-subject-merge';

import {

  groupStructureForDisplay,

  pageRangeLabel,

  structureDisplayCounts,

} from '../../lib/admin-structure-display';

import { AdminPublishStatusBanner } from './AdminPublishStatusBanner';

import { AdminPublishingChecklist } from './AdminPublishingChecklist';

import { AdminPlanGenerationStatus } from './AdminPlanGenerationStatus';

import { AdminSubjectActions } from './AdminSubjectActions';

import { LessonAdminActions } from './LessonAdminActions';



export function AdminSubjectDetailPanel({

  card,

  onBack,

  onRefresh,

}: {

  card: SubjectCardModel;

  onBack: () => void;

  onRefresh: () => void;

}) {

  const fileRef = useRef<HTMLInputElement>(null);

  const initialBook = card.book;

  const bookId = initialBook?.book_id;

  const [book, setBook] = useState<BookRecord | null>(initialBook);

  const [plan, setPlan] = useState<BookPlan | null>(null);

  const [structure, setStructure] = useState<BookStructure | null>(null);

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState('');

  const [error, setError] = useState('');

  const [planFeedback, setPlanFeedback] = useState<'success' | 'error' | null>(null);

  const prevPlanStatusRef = useRef<string | null | undefined>(undefined);
  const [ragJobActive, setRagJobActive] = useState(false);
  const [ragProgress, setRagProgress] = useState<RagProgress | null>(null);



  const backHref = `/admin/books?subject=${encodeURIComponent(card.subject_key)}`;



  const loadBookState = useCallback(async () => {

    if (!bookId) {

      setBook(initialBook);

      setPlan(null);

      return;

    }

    try {

      const [detail, planRes] = await Promise.all([

        adminApi.books.get(bookId),

        adminApi.books.getPlan(bookId).catch(() => null),

      ]);

      setBook(detail.book);

      setPlan(planRes);

    } catch {

      setBook(initialBook);

      setPlan(null);

    }

  }, [bookId, initialBook]);



  const loadStructure = useCallback(async () => {

    if (!bookId) {

      setStructure(null);

      setLoading(false);

      return;

    }

    setLoading(true);

    try {

      const s = await adminApi.books.getStructure(bookId);

      setStructure(s);

    } catch {

      setStructure(null);

    } finally {

      setLoading(false);

    }

  }, [bookId]);



  const refreshAll = useCallback(async () => {

    await Promise.all([loadBookState(), loadStructure()]);

    onRefresh();

  }, [loadBookState, loadStructure, onRefresh]);



  useEffect(() => {

    setBook(initialBook);

  }, [initialBook]);



  useEffect(() => {

    loadBookState();

  }, [loadBookState]);



  useEffect(() => {

    loadStructure();

  }, [loadStructure, book?.structure_status, book?.status]);



  useEffect(() => {
    const planStatus = plan?.plan_status ?? book?.plan_status;
    if (planStatus !== 'generating') return;
    const t = setInterval(() => {
      loadBookState();
    }, 3000);
    return () => clearInterval(t);
  }, [plan?.plan_status, book?.plan_status, loadBookState]);

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
      if (bookId && ragJobActive && book?.status === 'processing') {
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
            await loadBookState();
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
      await refreshAll();
    };

    const t = setInterval(poll, 2000);
    void poll();
    return () => clearInterval(t);
  }, [ragJobActive, book?.structure_status, book?.status, bookId, loadBookState, refreshAll]);



  async function runPlanGeneration(action: 'generate' | 'regen') {
    if (!bookId) return;
    setPlanFeedback(null);
    setError('');
    setBusy(action);
    setBook((prev) =>
      prev ? { ...prev, plan_status: 'generating', plan_error: undefined } : prev,
    );
    setPlan((prev) => ({
      ...(prev || { book_id: bookId, units: [], objectives: [], modules: [] }),
      plan_status: 'generating',
      plan_error: undefined,
    }));
    try {
      if (action === 'generate') {
        await adminApi.books.generatePlan(bookId);
      } else {
        await adminApi.books.regeneratePlan(bookId);
      }
      await loadBookState();
      onRefresh();
    } catch (e) {
      setPlanFeedback('error');
      setError(e instanceof Error ? e.message : 'Plan generation failed');
      await loadBookState();
    } finally {
      setBusy('');
    }
  }

  async function runReprocessRag() {
    if (!bookId) return;
    setError('');
    setBusy('reprocess');
    try {
      const updated = await adminApi.books.reprocess(bookId);
      setBook({ ...updated, plan_status: null, plan_approved_at: undefined, plan_generated_at: undefined });
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
      await refreshAll();
    } catch (e) {
      setRagJobActive(false);
      setRagProgress(null);
      setError(e instanceof Error ? e.message : 'Reprocess failed');
      await loadBookState();
    } finally {
      setBusy('');
    }
  }

  async function runApproveStructure() {
    if (!bookId) return;
    setError('');
    setBusy('approve-rag');
    try {
      const updated = await adminApi.books.approveStructure(bookId);
      setBook(updated);
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
      await refreshAll();
    } catch (e) {
      setRagJobActive(false);
      setRagProgress(null);
      setError(e instanceof Error ? e.message : 'Approve & Run RAG failed');
      await loadBookState();
    } finally {
      setBusy('');
    }
  }

  async function run(action: string, fn: () => Promise<unknown>) {

    setBusy(action);

    setError('');

    try {

      await fn();

      await refreshAll();

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Action failed');

    } finally {

      setBusy('');

    }

  }



  async function handleFile(uploaded: File, replace: boolean) {

    const form = new FormData();

    form.append('title', book?.title ?? `${card.subject_name} Grade ${card.grade}`);

    form.append('grade', String(card.grade));

    form.append('process_now', 'true');

    form.append('replace', String(replace));

    form.append('visible_to_students', 'false');

    form.append('file', uploaded);

    await adminApi.subjects.uploadBook(card.subject_key, form);

    await refreshAll();

  }



  const displayUnits = groupStructureForDisplay(structure?.units ?? [], bookId ?? '');

  const structureStats =

    displayUnits.length > 0

      ? structureDisplayCounts(structure?.units ?? [], bookId ?? '')

      : null;

  const unitCount = structureStats?.unitCount ?? book?.unit_count ?? '—';

  const lessonCount = structureStats?.lessonCount ?? book?.lesson_count ?? '—';

  const hasStructureUnits = displayUnits.length > 0;



  return (

    <div className="page-enter">

      <button

        type="button"

        onClick={onBack}

        style={{

          fontSize: 13,

          color: 'var(--g3)',

          background: 'none',

          border: 'none',

          cursor: 'pointer',

          padding: 0,

          marginBottom: 20,

        }}

      >

        ← Back to subjects

      </button>



      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

          <span style={{ fontSize: 40 }} aria-hidden>{card.icon}</span>

          <div>

            <h1 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>

              {card.subject_name}

            </h1>

            <div style={{ fontSize: 14, color: 'var(--g3)' }}>Grade {card.grade}</div>

          </div>

        </div>

        {book?.status && (

          <span

            style={{

              fontSize: 12,

              fontWeight: 700,

              padding: '6px 14px',

              borderRadius: 99,

              background: 'rgba(255,255,255,.06)',

              color: statusColor(book.status),

            }}

          >

            {statusLabel(book.status)}

          </span>

        )}

      </header>



      {book && (

        <>

          <AdminPublishingChecklist book={book} plan={plan} ragProgress={ragProgress} />
          <AdminPlanGenerationStatus book={book} plan={plan} feedback={planFeedback} />
          <AdminSubjectActions
            book={book}
            plan={plan}
            hasStructureUnits={hasStructureUnits}
            busy={busy}
            subjectName={card.subject_name}
            subjectArchived={card.archived}
            showArchiveSubject={!card.builtin}
            ragProgress={ragProgress}
            ragJobActive={ragJobActive}
            onGeneratePlan={() => runPlanGeneration('generate')}
            onRegeneratePlan={() => runPlanGeneration('regen')}

            onApprovePlan={() => run('approve-plan', () => adminApi.books.approvePlan(bookId!))}

            onApproveStructure={runApproveStructure}

            onReprocessRag={runReprocessRag}

            onToggleVisibility={() =>

              run('vis', () => adminApi.books.setVisibility(bookId!, !book.visible_to_students))

            }

            onArchiveSubject={() =>

              run('subj-arch', () => adminApi.subjects.setArchive(card.subject_key, !card.archived))

            }

          />

          <AdminPublishStatusBanner
            book={book}
            plan={plan}
            busy={busy === 'vis'}

            onToggle={() =>

              run('vis', () => adminApi.books.setVisibility(bookId!, !book.visible_to_students))

            }

          />

        </>

      )}



      {book ? (

        <div className="card" style={{ padding: 18, borderRadius: 16, marginBottom: 24 }}>

          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{book.title}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>

            {[

              ['Units', unitCount],

              ['Lessons', lessonCount],

              ['Processing', processingStatusLabel(book, ragProgress)],

              ['Schedule', scheduleStatusLabel(book)],

            ].map(([k, v]) => (

              <div key={String(k)}>

                <div style={{ fontSize: 10, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</div>

                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{v}</div>

              </div>

            ))}

          </div>

          {(book.plan_error || plan?.plan_error) && (

            <div style={{ fontSize: 12, color: 'var(--coral)', marginTop: 8 }}>

              Plan error: {plan?.plan_error || book.plan_error}

            </div>

          )}

          {book.error_message && (

            <div style={{ fontSize: 12, color: 'var(--coral)', marginTop: 8 }}>{book.error_message}</div>

          )}

        </div>

      ) : (

        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--g3)', marginBottom: 24 }}>

          No book uploaded yet

        </div>

      )}



      {loading ? (

        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>

          <div className="modal-spinner" />

        </div>

      ) : displayUnits.length > 0 ? (

        <section className="card" style={{ padding: 20, borderRadius: 16, marginBottom: 24 }}>

          <h2 style={{ fontFamily: 'var(--fd)', fontSize: 18, fontWeight: 800, margin: '0 0 16px' }}>

            Book structure

          </h2>

          <div style={{ display: 'grid', gap: 14 }}>

            {displayUnits.map((unit) => (

              <article

                key={unit.unit_id}

                style={{

                  padding: '14px 16px',

                  borderRadius: 12,

                  background: 'rgba(0,0,0,.12)',

                  border: '1px solid rgba(255,255,255,.06)',

                }}

              >

                <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: unit.lessons.length ? 12 : 0 }}>

                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--w)', flex: 1 }}>

                    {unit.title}

                  </h3>

                  <span style={{ fontSize: 12, color: 'var(--g3)' }}>{pageRangeLabel(unit.start_page, unit.end_page)}</span>

                </div>

                {unit.lessons.length > 0 ? (

                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>

                    {unit.lessons.map((les) => (

                      <li

                        key={les.lesson_id}

                        style={{

                          display: 'flex',

                          alignItems: 'flex-start',

                          gap: 12,

                          flexWrap: 'wrap',

                          padding: '12px 12px',

                          borderRadius: 10,

                          background: 'rgba(0,0,0,.15)',

                        }}

                      >

                        <div style={{ flex: 1, minWidth: 180 }}>

                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--vl)' }}>

                            {les.title}

                          </div>

                          <div style={{ fontSize: 11, color: 'var(--g3)', marginTop: 4 }}>

                            {pageRangeLabel(les.start_page, les.end_page)}

                          </div>

                        </div>

                        <LessonAdminActions

                          chapterId={les.chapter_id}

                          lessonTitle={les.title}

                          bookProcessed={book?.status === 'processed'}

                          backHref={backHref}

                        />

                      </li>

                    ))}

                  </ul>

                ) : (

                  <div style={{ fontSize: 13, color: 'var(--g3)' }}>No lessons listed</div>

                )}

              </article>

            ))}

          </div>

        </section>

      ) : bookId ? (

        <div className="card" style={{ padding: 20, color: 'var(--g3)', marginBottom: 24 }}>

          Structure not extracted yet. Upload or replace the book to detect units and lessons.

        </div>

      ) : null}



      {error && <div style={{ color: 'var(--coral)', marginBottom: 12 }}>{error}</div>}



      <input

        ref={fileRef}

        type="file"

        accept=".pdf"

        style={{ display: 'none' }}

        onChange={async (e) => {

          const uploaded = e.target.files?.[0];

          if (!uploaded) return;

          setBusy('upload');

          try {

            await handleFile(uploaded, Boolean(card.has_book));

          } catch (err) {

            setError(err instanceof Error ? err.message : 'Upload failed');

          } finally {

            setBusy('');

            e.target.value = '';

          }

        }}

      />



      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

        {bookId && (

          <Link href={`/admin/books/${encodeURIComponent(bookId)}`} className="btn btn-o btn-sm">

            View Details

          </Link>

        )}

        <button type="button" className="btn btn-p btn-sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>

          {busy === 'upload' ? 'Uploading…' : card.has_book ? 'Replace Book' : 'Upload Book'}

        </button>

        {bookId && (book?.status === 'failed' || (book?.status === 'processing' && book.processed_at)) && (

          <button type="button" className="btn btn-o btn-sm" disabled={!!busy} onClick={runReprocessRag}>

            Retry Processing

          </button>

        )}

        {bookId && (

          <button

            type="button"

            className="btn btn-o btn-sm"

            disabled={!!busy}

            onClick={() => {

              const message = book?.archived

                ? 'Restore this book?'

                : 'Archive this book? It will be hidden from students until restored.';

              if (!confirm(message)) return;

              run('arch', () => adminApi.books.setArchive(bookId!, !book?.archived));

            }}

          >

            {book?.archived ? 'Restore Book' : 'Archive Book'}

          </button>

        )}

      </div>

    </div>

  );

}


