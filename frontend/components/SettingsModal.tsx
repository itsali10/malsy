'use client';

import { useState } from 'react';
import { updateStudentPhoto, getStudentById } from '@/lib/database';
import type { Student } from '@/lib/database';
import styles from './SettingsModal.module.css';

interface Props {
  student: Student;
  onPhotoUpdated: (url: string) => void;
  onClose: () => void;
}

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) { height = Math.round((height / width) * maxSize); width = maxSize; }
          else { width = Math.round((width / height) * maxSize); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL('image/jpeg', 0.78)); }
        catch { reject(new Error('Could not process this image.')); }
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function SettingsModal({ student, onPhotoUpdated, onClose }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Photo must be smaller than 5 MB.'); return; }
    try {
      const dataUrl = await resizeImage(file, 200);
      setPreview(dataUrl);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process image.');
    }
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      updateStudentPhoto(student.id, preview);
      onPhotoUpdated(preview);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save photo.');
    } finally {
      setSaving(false);
    }
  }

  const current = getStudentById(student.id)?.picture || student.picture;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Update Profile Photo</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.photoArea}>
            <div className={styles.photoFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current} alt="Current" />
            </div>
            {preview && (
              <>
                <span className={styles.arrow}>→</span>
                <div className={`${styles.photoFrame} ${styles.photoNew}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="New" />
                  <span className={styles.newBadge}>New</span>
                </div>
              </>
            )}
          </div>
          {error && <p style={{ color: '#dc2626', fontSize: '.88rem', textAlign: 'center' }}>{error}</p>}
          <input type="file" accept="image/*" className={styles.fileInput} id="photoInput" onChange={handleFile} />
          <label htmlFor="photoInput" className={styles.chooseBtn}>📷 Choose Photo</label>
          <p className={styles.hint}>JPG or PNG, max 5 MB</p>
          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={handleSave} disabled={!preview || saving}>
              {saving ? 'Saving…' : '✅ Save Photo'}
            </button>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
