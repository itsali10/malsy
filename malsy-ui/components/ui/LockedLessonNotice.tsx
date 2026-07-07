'use client';

import { useEffect } from 'react';
import { Lock } from 'lucide-react';

interface LockedLessonNoticeProps {
  open: boolean;
  message: string;
  onClose: () => void;
}

export default function LockedLessonNotice({ open, message, onClose }: LockedLessonNoticeProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="locked-lesson-title"
      onClick={onClose}
    >
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Lock size={18} strokeWidth={2.5} aria-hidden style={{ color: 'var(--color-primary-strong)' }} />
            <h2 id="locked-lesson-title" className="modal-title">Lesson locked</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
          <button type="button" className="btn btn-v" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
