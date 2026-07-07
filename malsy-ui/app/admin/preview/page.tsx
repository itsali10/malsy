import { Suspense } from 'react';
import AdminLessonStudentPreview from '../../../components/admin/AdminLessonStudentPreview';

export default function AdminPreviewPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div className="modal-spinner" />
        </div>
      }
    >
      <AdminLessonStudentPreview />
    </Suspense>
  );
}
