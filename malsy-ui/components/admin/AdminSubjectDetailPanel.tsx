'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  adminApi,
  BookStructure,
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
} from '../../lib/admin-structure-display';
import { AdminPublishStatusBanner } from './AdminPublishStatusBanner';
import { AdminLessonRowActions } from './AdminLessonRowActions';

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
  const book = card.book;
  const bookId = book?.book_id;
  const [structure, setStructure] = useState<BookStructure | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const backHref = `/admin/books?subject=${encodeURIComponent(card.subject_key)}`;

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

  useEffect(() => {
    loadStructure();
  }, [loadStructure, book?.structure_status, book?.status]);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError('');
    try {
      await fn();
      onRefresh();
      await loadStructure();
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
    onRefresh();
    await loadStructure();
  }

  const displayUnits = groupStructureForDisplay(structure?.units ?? [], bookId ?? '');
  const unitCount = book?.unit_count ?? displayUnits.length;
  const lessonCount =
    book?.lesson_count ??
    displayUnits.reduce((n, u) => n + u.lessons.length, 0);

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
        <AdminPublishStatusBanner
          book={book}
          busy={busy === 'vis'}
          onToggle={() =>
            run('vis', () => adminApi.books.setVisibility(bookId!, !book.visible_to_students))
          }
        />
      )}

      {book ? (
        <div className="card" style={{ padding: 18, borderRadius: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{book.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
            {[
              ['Units', unitCount],
              ['Lessons', lessonCount],
              ['Processing', processingStatusLabel(book)],
              ['Schedule', scheduleStatusLabel(book)],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <div style={{ fontSize: 10, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
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
                        <AdminLessonRowActions
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
          Structure not extracted yet. Open book details to extract and review.
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
        {bookId && book?.status === 'failed' && (
          <button type="button" className="btn btn-o btn-sm" disabled={!!busy} onClick={() => run('process', () => adminApi.books.process(bookId!))}>
            Retry Processing
          </button>
        )}
        {bookId && (
          <button type="button" className="btn btn-o btn-sm" disabled={!!busy} onClick={() => run('arch', () => adminApi.books.setArchive(bookId!, !book?.archived))}>
            {book?.archived ? 'Restore Book' : 'Archive Book'}
          </button>
        )}
        {!card.builtin && (
          <button type="button" className="btn btn-o btn-sm" disabled={!!busy} onClick={() => run('subj-arch', () => adminApi.subjects.setArchive(card.subject_key, !card.archived))}>
            {card.archived ? 'Restore Subject' : 'Archive Subject'}
          </button>
        )}
      </div>
    </div>
  );
}
