'use client';

import { useEffect, useState } from 'react';
import { adminApi, AdminPreviewQuiz } from '../../lib/admin-api';
import { lastPartIndex } from '../../lib/lesson-sections';

function QuizBody({ quiz }: { quiz?: AdminPreviewQuiz | null }) {
  if (!quiz) {
    return <p style={{ margin: 0, fontSize: 14, color: 'var(--g3)' }}>No quiz generated for this part yet.</p>;
  }
  const question = String(quiz.question ?? '');
  const options = Array.isArray(quiz.options) ? quiz.options : [];
  const correct = String(quiz.correct_answer ?? '');
  const type = quiz.type ? String(quiz.type) : '';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {type && (
        <div style={{ fontSize: 12, color: 'var(--g3)' }}>
          Type: <span style={{ color: 'var(--vl)' }}>{type}</span>
        </div>
      )}
      {question && (
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--w)', lineHeight: 1.5 }}>{question}</div>
      )}
      {options.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {options.map((opt, idx) => (
            <li
              key={opt}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: opt === correct ? 'rgba(0,229,160,.12)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${opt === correct ? 'rgba(0,229,160,.35)' : 'rgba(255,255,255,.08)'}`,
                fontSize: 14,
                color: opt === correct ? 'var(--mint)' : 'var(--vl)',
                fontWeight: opt === correct ? 700 : 400,
              }}
            >
              <span style={{ opacity: 0.7, marginRight: 8 }}>{String.fromCharCode(65 + idx)}.</span>
              {opt}
              {opt === correct ? ' ✓' : ''}
            </li>
          ))}
        </ul>
      )}
      {quiz.explanation && (
        <div style={{ fontSize: 13, color: 'var(--g3)', lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--vl)' }}>Explanation:</strong> {quiz.explanation}
        </div>
      )}
    </div>
  );
}

export function AdminQuizPreviewModal({
  chapterId,
  lessonTitle,
  unitPart = 0,
  open,
  onClose,
}: {
  chapterId: string;
  lessonTitle: string;
  unitPart?: number;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quiz, setQuiz] = useState<AdminPreviewQuiz | null>(null);
  const [activePart, setActivePart] = useState(unitPart);
  const partCount = chapterId ? lastPartIndex(chapterId) + 1 : 1;

  useEffect(() => {
    if (!open || !chapterId) return;
    setActivePart(unitPart);
  }, [open, chapterId, unitPart]);

  useEffect(() => {
    if (!open || !chapterId) return;
    setLoading(true);
    setError('');
    adminApi.lessons
      .previewQuiz(chapterId, { unitPart: activePart, lessonTitle })
      .then((res) => setQuiz(res.quiz ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load quiz'))
      .finally(() => setLoading(false));
  }, [open, chapterId, activePart, lessonTitle]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box" style={{ maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 18 }}>Preview Quiz</div>
            <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 4 }}>{lessonTitle}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {partCount > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {Array.from({ length: partCount }, (_, p) => (
                <button
                  key={p}
                  type="button"
                  className={activePart === p ? 'btn btn-p btn-sm' : 'btn btn-o btn-sm'}
                  onClick={() => setActivePart(p)}
                >
                  Part {p + 1}
                </button>
              ))}
            </div>
          )}
          {loading && <div className="modal-spinner" style={{ margin: '20px auto' }} />}
          {error && <div style={{ color: 'var(--coral)', marginBottom: 12 }}>{error}</div>}
          {!loading && !error && <QuizBody quiz={quiz} />}
        </div>
      </div>
    </div>
  );
}
