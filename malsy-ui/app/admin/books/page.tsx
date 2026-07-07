'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import StudentContentSection from '../../../components/admin/StudentContentSection';

function AdminBooksInner() {
  const params = useSearchParams();
  const subjectKey = params.get('subject');
  return <StudentContentSection initialSubjectKey={subjectKey} />;
}

/** Admin Books — merged subject cards only (no separate uploaded-books list). */
export default function AdminBooksPage() {
  return (
    <Suspense
      fallback={
        <div className="page-enter" style={{ padding: 28, display: 'flex', justifyContent: 'center' }}>
          <div className="modal-spinner" />
        </div>
      }
    >
      <AdminBooksInner />
    </Suspense>
  );
}
