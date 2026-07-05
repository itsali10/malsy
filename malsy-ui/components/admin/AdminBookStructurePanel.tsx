'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, BookRecord, BookStructure, BookStructureUnit } from '../../lib/admin-api';

function pageLabel(start?: number, end?: number): string {
  if (start == null && end == null) return '';
  return `Pages ${start ?? '?'}–${end ?? '?'}`;
}

function structureStatusLabel(status?: string | null): string {
  switch (status) {
    case 'extracting':
      return 'Extracting structure…';
    case 'draft':
      return 'Review required';
    case 'approved':
      return 'Structure approved';
    case 'pending':
      return 'Pending extraction';
    default:
      return 'Saved';
  }
}

function displayLessonTitle(les: { title?: string; lesson_id?: string }): string {
  const t = (les.title ?? '').trim();
  if (!t || /^lesson_\d+$/i.test(t) || /^unit_\d+$/i.test(t)) {
    return t || 'Untitled lesson';
  }
  return t;
}

function displayUnitTitle(unit: BookStructureUnit): string {
  const t = (unit.title ?? '').trim();
  if (!t || /^unit_\d+$/i.test(t)) return t || 'Untitled unit';
  return t;
}

export function AdminBookStructurePanel({
  book,
  onRefresh,
  readOnly = false,
}: {
  book: BookRecord;
  onRefresh?: () => void;
  readOnly?: boolean;
}) {
  const bookId = book.book_id;
  const isReadOnly = readOnly || book.status === 'processed';
  const [structure, setStructure] = useState<BookStructure | null>(null);
  const [editedUnits, setEditedUnits] = useState<BookStructureUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await adminApi.books.getStructure(bookId);
      setStructure(s);
      setEditedUnits(JSON.parse(JSON.stringify(s.units ?? [])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load structure');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load, book.structure_status, book.status]);

  useEffect(() => {
    if (book.structure_status !== 'extracting') return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [book.structure_status, load]);

  if (book.structure_status === 'approved' && book.status === 'processing') {
    return (
      <div
        className="card"
        style={{ padding: 16, marginBottom: 16, fontSize: 13, color: 'var(--g3)', borderRadius: 14 }}
      >
        Structure approved — RAG indexing and lesson plan generation in progress…
      </div>
    );
  }

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError('');
    try {
      await fn();
      await load();
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy('');
    }
  }

  function updateUnitTitle(unitId: string, title: string) {
    setEditedUnits((prev) => prev.map((u) => (u.unit_id === unitId ? { ...u, title } : u)));
  }

  function updateLessonTitle(unitId: string, lessonId: string, title: string) {
    setEditedUnits((prev) =>
      prev.map((u) => {
        if (u.unit_id !== unitId) return u;
        return {
          ...u,
          lessons: (u.lessons ?? []).map((l) =>
            l.lesson_id === lessonId ? { ...l, title } : l,
          ),
        };
      }),
    );
  }

  const canEdit = !isReadOnly && (structure?.structure_status === 'draft' || structure?.structure_status === 'pending');
  const canApprove = !isReadOnly && structure?.structure_status === 'draft' && editedUnits.length > 0;
  const hasToc = structure?.structure_detection_method === 'table_of_contents';

  return (
    <section className="card" style={{ padding: 20, marginBottom: 24, borderRadius: 16 }}>
      <header style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--g3)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            marginBottom: 8,
          }}
        >
          Book structure
        </div>
        <h2 style={{ fontFamily: 'var(--fd)', fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>
          {structure?.title ?? book.title}
        </h2>
        <div style={{ fontSize: 14, color: 'var(--vl)' }}>
          {(structure?.subject ?? book.subject).charAt(0).toUpperCase() +
            (structure?.subject ?? book.subject).slice(1)}{' '}
          · Grade {structure?.grade ?? book.grade}
          {structure?.page_count ? ` · ${structure.page_count} pages` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 99,
              background: 'rgba(0,0,0,.2)',
              color: hasToc ? 'var(--mint)' : 'var(--g3)',
            }}
          >
            {hasToc ? 'Table of contents found' : 'Headings / page-based detection'}
          </span>
          {!isReadOnly && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 99,
                background: 'rgba(0,0,0,.2)',
                color: book.structure_status === 'draft' ? '#6eb5ff' : 'var(--g3)',
              }}
            >
              {structureStatusLabel(structure?.structure_status ?? book.structure_status)}
            </span>
          )}
        </div>
      </header>

      {(structure?.structure_warning || book.structure_warning) && !isReadOnly && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(255,184,48,.1)',
            border: '1px solid rgba(255,184,48,.25)',
            color: 'var(--amber)',
            fontSize: 13,
            lineHeight: 1.55,
            marginBottom: 14,
          }}
        >
          {structure?.structure_warning || book.structure_warning}
        </div>
      )}

      {error && <div style={{ color: 'var(--coral)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {loading || book.structure_status === 'extracting' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0' }}>
          <div className="modal-spinner" />
          <span style={{ color: 'var(--g3)', fontSize: 13 }}>Reading PDF and detecting structure…</span>
        </div>
      ) : editedUnits.length === 0 ? (
        <div style={{ color: 'var(--g3)', fontSize: 13, padding: '12px 0' }}>
          No units detected yet.{' '}
          {!isReadOnly && (
            <button
              type="button"
              className="btn btn-o btn-sm"
              disabled={!!busy}
              onClick={() => run('detect', () => adminApi.books.extractStructure(bookId))}
            >
              Extract structure
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {hasToc ? 'Table of contents' : 'Detected units & lessons'}
          </div>
          {editedUnits.map((unit, ui) => {
            const unitTitle = displayUnitTitle(unit);
            const hasLessons = (unit.lessons?.length ?? 0) > 0;
            return (
              <article
                key={unit.unit_id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'rgba(0,0,0,.15)',
                  border: '1px solid rgba(255,255,255,.06)',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mint)', minWidth: 52 }}>
                    Unit {ui + 1}
                  </span>
                  {canEdit ? (
                    <input
                      value={unit.title ?? ''}
                      onChange={(e) => updateUnitTitle(unit.unit_id, e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 220,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,.12)',
                        background: 'rgba(0,0,0,.2)',
                        color: 'inherit',
                        fontSize: 15,
                        fontWeight: 700,
                      }}
                    />
                  ) : (
                    <h3 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--w)', lineHeight: 1.35 }}>
                      {unitTitle}
                    </h3>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--g3)' }}>
                    {pageLabel(unit.start_page, unit.end_page)}
                  </span>
                </div>

                {hasLessons ? (
                  <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                    {unit.lessons!.map((les, li) => (
                      <li
                        key={les.lesson_id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          paddingLeft: 64,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--g3)', minWidth: 72 }}>
                          Lesson {li + 1}
                        </span>
                        {canEdit ? (
                          <input
                            value={les.title ?? ''}
                            onChange={(e) => updateLessonTitle(unit.unit_id, les.lesson_id, e.target.value)}
                            style={{
                              flex: 1,
                              minWidth: 180,
                              padding: '6px 10px',
                              borderRadius: 8,
                              border: '1px solid rgba(255,255,255,.1)',
                              background: 'rgba(0,0,0,.15)',
                              color: 'inherit',
                              fontSize: 14,
                              fontWeight: 600,
                            }}
                          />
                        ) : (
                          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--vl)' }}>
                            {displayLessonTitle(les)}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--g3)' }}>
                          {pageLabel(les.start_page, les.end_page)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !hasLessons && !isReadOnly && (
                    <div style={{ marginTop: 10, paddingLeft: 64, fontSize: 12, color: 'var(--g3)' }}>
                      One lesson in this unit
                    </div>
                  )
                )}
              </article>
            );
          })}
        </div>
      )}

      {!isReadOnly && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-o btn-sm"
            disabled={!!busy}
            onClick={() => run('detect', () => adminApi.books.extractStructure(bookId))}
          >
            {busy === 'detect' ? 'Re-detecting…' : 'Re-detect structure'}
          </button>
          {canEdit && editedUnits.length > 0 && (
            <button
              type="button"
              className="btn btn-o btn-sm"
              disabled={!!busy}
              onClick={() => run('save', () => adminApi.books.updateStructure(bookId, editedUnits))}
            >
              {busy === 'save' ? 'Saving…' : 'Save edits'}
            </button>
          )}
          {canApprove && (
            <button
              type="button"
              className="btn btn-p btn-sm"
              disabled={!!busy}
              onClick={() =>
                run('approve', async () => {
                  await adminApi.books.updateStructure(bookId, editedUnits);
                  await adminApi.books.approveStructure(bookId);
                })
              }
            >
              {busy === 'approve' ? 'Publishing…' : 'Approve & run RAG pipeline'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
