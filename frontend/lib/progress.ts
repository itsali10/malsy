'use client';

import { markLessonComplete } from './database';
import type { Student } from './database';

export function getProgressPercent(student: Student, subject: string): number {
  if (!student?.progress) return 0;

  if (subject === 'socialStudies') {
    const ss = student.progress.socialStudies;
    const totals = ss.sectionTotals.history + ss.sectionTotals.geography;
    if (totals === 0) return 0;
    return Math.round((ss.lessonsCompleted / totals) * 100);
  }

  const sub = student.progress[subject as 'english' | 'science'];
  if (!sub?.totalLessons) return 0;
  return Math.round((sub.lessonsCompleted / sub.totalLessons) * 100);
}

export function isLinearLessonLocked(completedLessons: number[], lessonNumber: number): boolean {
  if (lessonNumber === 1) return false;
  return !completedLessons.includes(lessonNumber - 1);
}

export function isSocialLessonLocked(sectionLessons: number[], lessonNumber: number): boolean {
  if (lessonNumber === 1) return false;
  return !sectionLessons.includes(lessonNumber - 1);
}

export function completeLesson(
  studentId: string,
  subject: string,
  lessonNumber: number,
  section: string | null = null,
) {
  return markLessonComplete(studentId, subject, lessonNumber, section);
}
