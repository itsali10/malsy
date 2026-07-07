'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ContinueLearningSubjectRead } from '../../lib/api';
import { auth } from '../../lib/auth';
import type { PortalSubject } from '../../lib/studentPortalSubjects';
import { LANGUAGE_LESSON_SECTIONS } from '../../lib/studentLanguageSections';
import {
  type CatalogLesson,
  learnHrefForChapter,
} from '../../lib/studentBookCatalog';
import {
  BookLessonProgressState,
  emptyLessonProgress,
  getCurrentLessonNumber,
  getLessonNumber,
  isLessonCompleted,
  isLessonLocked,
  LOCKED_LESSON_MESSAGE,
} from '../../lib/lessonProgress';

function sectionCardClass(selected: boolean, locked: boolean): string {
  return [
    'picker-card',
    'picker-card--section',
    selected ? 'picker-card--selected' : '',
    locked ? 'picker-card--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function lessonPickerClass(selected: boolean, locked: boolean): string {
  return [
    'picker-card',
    selected ? 'picker-card--selected' : '',
    locked ? 'picker-card--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

interface LanguageBookViewProps {
  bookId: string;
  lessons: CatalogLesson[];
  portalSubject: PortalSubject;
}

export default function LanguageBookView({ bookId, lessons, portalSubject }: LanguageBookViewProps) {
  const router = useRouter();
  const studentId = auth.getUser()?.user_id ?? 'student';
  const [bookProgress, setBookProgress] = useState<BookLessonProgressState>(emptyLessonProgress());
  const [resume, setResume] = useState<ContinueLearningSubjectRead | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<CatalogLesson | null>(null);

  useEffect(() => {
    api.books.lessonProgress(bookId, studentId)
      .then((prog) => {
        setBookProgress({
          max_unlocked_lesson_index: prog.max_unlocked_lesson_index ?? 0,
          completed_lesson_numbers: prog.completed_lesson_numbers ?? [],
        });
      })
      .catch(() => setBookProgress(emptyLessonProgress()));

    api.dashboard.continueLearning()
      .then((data) => {
        const row = (data?.subjects ?? []).find((s) => s.subject_key === portalSubject.subject_key);
        setResume(row ?? null);
      })
      .catch(() => setResume(null));
  }, [bookId, studentId, portalSubject.subject_key]);

  const currentNum = getCurrentLessonNumber(bookProgress, lessons.length);
  const allDone = currentNum === null && lessons.length > 0;

  useEffect(() => {
    const focusNum = currentNum ?? 1;
    const focus = lessons.find((l, i) => getLessonNumber(l, i) === focusNum) ?? lessons[0] ?? null;
    setSelectedLesson(focus);
  }, [lessons, currentNum]);

  const activeLesson = selectedLesson ?? lessons[0] ?? null;
  const activeIndex = activeLesson ? lessons.findIndex((l) => l.id === activeLesson.id) : -1;
  const activeLessonNum = activeLesson && activeIndex >= 0 ? getLessonNumber(activeLesson, activeIndex) : 0;
  const activeLocked = activeLessonNum > 0 && isLessonLocked(bookProgress, activeLessonNum);
  const lessonDone = activeLessonNum > 0 && isLessonCompleted(bookProgress, activeLessonNum);

  const activeChapterId = resume?.chapter_id ?? activeLesson?.fullUnitId ?? '';
  const activeUnitPart = resume?.chapter_id === activeLesson?.fullUnitId
    ? (resume?.unit_part ?? 0)
    : 0;

  function canOpenSection(sectionIndex: number): boolean {
    if (!activeLesson || activeLocked) return false;
    if (resume?.chapter_id !== activeLesson.fullUnitId) {
      return sectionIndex === 0;
    }
    const statuses = resume.section_statuses ?? [];
    const st = statuses.find((s) => s.index === sectionIndex);
    if (st?.completed || st?.active) return true;
    if (sectionIndex === 0) return true;
    const prev = statuses.find((s) => s.index === sectionIndex - 1);
    if (prev?.completed) return true;
    return sectionIndex <= activeUnitPart;
  }

  function openSection(sectionIndex: number) {
    if (!activeLesson || !canOpenSection(sectionIndex)) return;
    router.push(learnHrefForChapter(activeLesson.fullUnitId, activeLesson.name, sectionIndex));
  }

  if (lessons.length === 0) {
    return (
      <div className="card-sub" style={{ padding: 20 }}>
        No published lessons available yet.
      </div>
    );
  }

  if (allDone) {
    return (
      <div className="picker-complete-banner">
        <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mint)' }}>All lessons complete!</div>
        <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 6 }}>
          Great work — check back when new lessons are added.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12,
      }}>
        {lessons.map((lesson, index) => {
          const lessonNum = getLessonNumber(lesson, index);
          const locked = isLessonLocked(bookProgress, lessonNum);
          const completed = isLessonCompleted(bookProgress, lessonNum);
          const selected = activeLesson?.id === lesson.id;
          return (
            <button
              key={lesson.id}
              type="button"
              onClick={() => setSelectedLesson(lesson)}
              className={lessonPickerClass(selected, locked)}
            >
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: selected ? 'var(--vl)' : 'var(--g5)', marginBottom: 4 }}>
                {completed ? '✓ ' : locked ? '🔒 ' : ''}Lesson {lessonNum}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w)', lineHeight: 1.35 }}>{lesson.name}</div>
              {locked && (
                <div style={{ fontSize: 10, color: 'var(--g4)', marginTop: 6, lineHeight: 1.45, fontStyle: 'italic' }}>
                  {LOCKED_LESSON_MESSAGE}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {activeLesson && (
        <div className="picker-detail-panel">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--g4)', marginBottom: 6 }}>
            Lesson {activeLessonNum} of {lessons.length}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--w)', lineHeight: 1.4 }}>{activeLesson.name}</div>
          {activeLesson.description ? (
            <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 6 }}>{activeLesson.description}</div>
          ) : null}
          {lessonDone ? (
            <div style={{ fontSize: 12, color: 'var(--mint)', marginTop: 8, fontWeight: 700 }}>✓ Lesson completed</div>
          ) : null}
          {activeLocked && (
            <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 10, lineHeight: 1.55 }}>
              {LOCKED_LESSON_MESSAGE}
            </div>
          )}
        </div>
      )}

      {!activeLocked && activeLesson && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
        }}>
          {LANGUAGE_LESSON_SECTIONS.map((section, index) => {
            const isActive = activeChapterId === activeLesson.fullUnitId && activeUnitPart === index;
            const isPassed =
              activeChapterId === activeLesson.fullUnitId &&
              (resume?.section_statuses?.find((s) => s.index === index)?.completed ||
                activeUnitPart > index);
            const locked = !canOpenSection(index);

            return (
              <button
                key={section.key}
                type="button"
                onClick={() => openSection(index)}
                disabled={locked}
                className={sectionCardClass(isActive, locked)}
              >
                <div style={{ fontSize: 40 }}>{section.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--w)' }}>{section.title}</div>
                <div style={{ fontSize: 12, color: isPassed ? 'var(--mint)' : 'var(--g3)', lineHeight: 1.5 }}>
                  {isPassed ? '✓ Completed' : isActive ? 'Continue here' : locked ? 'Finish previous section first' : 'Start section'}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
