import { Suspense } from 'react';

export default function AdminLessonLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ padding: 28 }}><div className="modal-spinner" /></div>}>
      {children}
    </Suspense>
  );
}
