'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '../../../lib/admin-api';

const SUBJECT_LABELS: Record<string, string> = {
  english: 'English',
  science: 'Science',
  history: 'History',
};

function UploadForm() {
  const router = useRouter();
  const params = useSearchParams();
  const presetSubject = params.get('subject') ?? 'english';

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(presetSubject);
  const [grade, setGrade] = useState('6');
  const [file, setFile] = useState<File | null>(null);
  const [processNow, setProcessNow] = useState(true);
  const [replace, setReplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a PDF file'); return; }
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('title', title.trim() || `${SUBJECT_LABELS[subject] ?? subject} Grade ${grade}`);
      form.append('subject', subject);
      form.append('grade', grade);
      form.append('process_now', String(processNow));
      form.append('replace', String(replace));
      form.append('visible_to_students', 'false');
      form.append('file', file);
      const book = await adminApi.books.upload(form);
      router.push('/admin/books');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-enter" style={{ padding: 28, maxWidth: 640 }}>
      <Link href="/admin/books" style={{ fontSize: 13, color: 'var(--g3)', display: 'inline-block', marginBottom: 20 }}>← Back to Student Content</Link>
      <h1 style={{ fontFamily: 'var(--fd)', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Upload Book</h1>
      <p style={{ color: 'var(--g3)', fontSize: 14, marginBottom: 28 }}>
        Upload a PDF for {SUBJECT_LABELS[subject] ?? subject}. Processing uses the existing RAG pipeline.
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ padding: 28, borderRadius: 20 }}>
        <label style={labelStyle}>Subject</label>
        <select className="field-input" value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle}>
          <option value="english">English</option>
          <option value="science">Science</option>
          <option value="history">History</option>
        </select>

        <label style={labelStyle}>Title</label>
        <input className="field-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={`${SUBJECT_LABELS[subject] ?? subject} Grade ${grade}`} style={inputStyle} />

        <label style={labelStyle}>Grade</label>
        <input className="field-input" type="number" min={1} max={12} value={grade} onChange={e => setGrade(e.target.value)} required style={inputStyle} />

        <label style={labelStyle}>PDF File</label>
        <input type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} required style={{ ...inputStyle, padding: 12 }} />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={processNow} onChange={e => setProcessNow(e.target.checked)} />
          Process through RAG pipeline immediately
        </label>

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 20 }}>
          <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />
          Replace existing book for this subject (overwrites {subject}_g{grade})
        </label>

        {error && <div style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

        <button type="submit" className="btn btn-p" disabled={loading}>
          {loading ? 'Uploading…' : 'Upload & Process'}
        </button>
      </form>
    </div>
  );
}

export default function AdminUploadBookPage() {
  return (
    <Suspense fallback={<div style={{ padding: 28 }}><div className="modal-spinner" /></div>}>
      <UploadForm />
    </Suspense>
  );
}

const labelStyle: CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--g3)',
  marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: '.06em',
};
const inputStyle: CSSProperties = { width: '100%', marginBottom: 4 };
