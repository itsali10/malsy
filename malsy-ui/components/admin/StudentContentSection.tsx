'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminApi,
  statusColor,
  statusLabel,
} from '../../lib/admin-api';
import {
  booksFromSubjectContent,
  mergeSubjectCards,
  processingStatusLabel,
  SubjectCardModel,
  visibilityStatusLabel,
} from '../../lib/admin-subject-merge';
import { AdminSubjectDetailPanel } from './AdminSubjectDetailPanel';

const PAGE_VERSION = 'student-content-v8';

const SUBJ_BG: Record<string, string> = {
  english: 'linear-gradient(135deg,rgba(59,191,255,.12),rgba(91,33,245,.06))',
  science: 'linear-gradient(135deg,rgba(0,229,160,.1),rgba(59,191,255,.08))',
  history: 'linear-gradient(135deg,rgba(255,184,48,.1),rgba(200,130,0,.06))',
};

function AddNewSubjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [subjectName, setSubjectName] = useState('');
  const [grade, setGrade] = useState('6');
  const [icon, setIcon] = useState('📚');
  const [visibleWhenProcessed, setVisibleWhenProcessed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const name = subjectName.trim();
    if (!name) {
      setError('Subject name is required');
      return;
    }
    if (!file) {
      setError('Please select a PDF book to upload');
      return;
    }

    setBusy(true);
    try {
      const created = await adminApi.subjects.create({
        subject_name: name,
        grade: Number(grade) || 6,
        icon: icon || '📚',
        visible_to_students: visibleWhenProcessed,
      });

      const form = new FormData();
      form.append('title', `${name} Grade ${grade}`);
      form.append('grade', grade);
      form.append('process_now', 'true');
      form.append('replace', 'true');
      form.append('visible_to_students', String(visibleWhenProcessed));
      form.append('file', file);
      await adminApi.subjects.uploadBook(created.subject_key, form);

      setSubjectName('');
      setGrade('6');
      setIcon('📚');
      setVisibleWhenProcessed(false);
      setFile(null);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subject');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 18 }}>Add New Subject</div>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Subject name</div>
            <input
              className="auth-input"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g. Geography"
              disabled={busy}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Grade</div>
            <input
              className="auth-input"
              type="number"
              min={1}
              max={12}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              disabled={busy}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Icon (emoji)</div>
            <input
              className="auth-input"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              disabled={busy}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Book PDF</div>
            <input type="file" accept=".pdf" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={visibleWhenProcessed}
              onChange={(e) => setVisibleWhenProcessed(e.target.checked)}
              disabled={busy}
            />
            Visible to students after processing completes
          </label>

          {error && <div style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Creating & processing…' : 'Create Subject & Upload Book'}
          </button>
        </form>
      </div>
    </div>
  );
}

function SubjectSummaryCard({
  card,
  onOpen,
}: {
  card: SubjectCardModel;
  onOpen: () => void;
}) {
  const book = card.book;
  const unitCount = book?.unit_count ?? '—';
  const lessonCount = book?.lesson_count ?? '—';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card"
      data-subject={card.subject_key}
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        background: SUBJ_BG[card.subject_key] ?? 'rgba(255,255,255,.03)',
        opacity: card.archived ? 0.72 : 1,
        textAlign: 'left',
        width: '100%',
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,.06)',
        padding: 0,
      }}
    >
      <div style={{ padding: '22px 24px' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }} aria-hidden>{card.icon}</span>
            <div>
              <h2 style={{ fontFamily: 'var(--fd)', fontSize: 20, fontWeight: 800, margin: 0 }}>{card.subject_name}</h2>
              <div style={{ fontSize: 12, color: 'var(--g3)' }}>
                Grade {card.grade}
                {!card.builtin && <span> · Custom</span>}
              </div>
            </div>
          </div>
          {book?.status && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 99,
                background: 'rgba(0,0,0,.2)',
                color: statusColor(book.status),
              }}
            >
              {statusLabel(book.status)}
            </span>
          )}
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            ['Book', card.has_book ? (book?.title ?? 'Uploaded') : 'Not uploaded'],
            ['Visibility', card.archived ? 'Archived' : card.visible_to_students ? 'Visible' : 'Hidden'],
            ['Units', unitCount],
            ['Lessons', lessonCount],
          ].map(([label, val]) => (
            <div key={String(label)} style={{ background: 'rgba(0,0,0,.15)', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--g3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{val}</div>
            </div>
          ))}
        </div>

        {book && (
          <div style={{ fontSize: 12, color: 'var(--g3)' }}>
            {processingStatusLabel(book)} · {visibilityStatusLabel(book)}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: 'var(--mint)' }}>
          Open subject →
        </div>
      </div>
    </button>
  );
}

export default function StudentContentSection({
  initialSubjectKey = null,
}: {
  initialSubjectKey?: string | null;
}) {
  const [cards, setCards] = useState<SubjectCardModel[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialSubjectKey);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    let uploadedBooks: Awaited<ReturnType<typeof adminApi.books.list>> = [];
    let subjectContent: Awaited<ReturnType<typeof adminApi.content.subjects>> = [];

    try {
      uploadedBooks = await adminApi.books.list();
    } catch (err) {
      console.warn('[admin-books] books.list failed:', err);
    }

    try {
      subjectContent = await adminApi.content.subjects();
    } catch (err) {
      console.warn('[admin-books] content.subjects failed:', err);
    }

    if (uploadedBooks.length === 0 && subjectContent.length > 0) {
      uploadedBooks = booksFromSubjectContent(subjectContent);
    }

    setCards(mergeSubjectCards(uploadedBooks, subjectContent));
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setCards(mergeSubjectCards([]));
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    if (!initialSubjectKey) return;
    setSelectedKey(initialSubjectKey);
  }, [initialSubjectKey]);

  const selectedCard = selectedKey ? cards.find((c) => c.subject_key === selectedKey) ?? null : null;

  return (
    <div className="page-enter" style={{ padding: 28 }} data-admin-books-version={PAGE_VERSION}>
      {!selectedCard ? (
        <>
          <header style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
                Student Content
              </h1>
              <p style={{ color: 'var(--g3)', fontSize: 14, margin: 0, maxWidth: 560 }}>
                Select a subject to view its book structure and lesson content.
              </p>
            </div>
            <button type="button" className="btn btn-p" onClick={() => setShowAddSubject(true)}>
              + Add New Subject
            </button>
          </header>

          {error && <div style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</div>}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div className="modal-spinner" />
            </div>
          ) : (
            <section aria-label="Student Content subjects">
              <div
                style={{
                  display: 'grid',
                  gap: 20,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                }}
              >
                {cards.map((card) => (
                  <SubjectSummaryCard
                    key={card.subject_key}
                    card={card}
                    onOpen={() => setSelectedKey(card.subject_key)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <AdminSubjectDetailPanel
          card={selectedCard}
          onBack={() => setSelectedKey(null)}
          onRefresh={load}
        />
      )}

      <AddNewSubjectModal open={showAddSubject} onClose={() => setShowAddSubject(false)} onCreated={load} />
    </div>
  );
}
