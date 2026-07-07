export interface BookLessonProgressState {
  max_unlocked_lesson_index: number;
  completed_lesson_numbers: number[];
}

export interface LessonEvaluationLike {
  lesson_completed: boolean;
  content_id: string;
}

export function getLessonNumber(lesson: { id: number | string }, index: number): number {
  return typeof lesson.id === 'number' ? lesson.id : index + 1;
}

export function isLessonUnlocked(
  prog: BookLessonProgressState | undefined,
  lessonNumber: number,
): boolean {
  if (!prog) return lessonNumber <= 1;
  return lessonNumber - 1 <= prog.max_unlocked_lesson_index;
}

export function isLessonCompleted(
  prog: BookLessonProgressState | undefined,
  lessonNumber: number,
): boolean {
  return Boolean(prog?.completed_lesson_numbers?.includes(lessonNumber));
}

export function isLessonLocked(
  prog: BookLessonProgressState | undefined,
  lessonNumber: number,
): boolean {
  return !isLessonUnlocked(prog, lessonNumber);
}

export const LOCKED_LESSON_MESSAGE =
  'Finish the previous lesson to unlock this lesson.';

/** @deprecated Intentionally shows only the current lesson — prefer listing all lessons with lock state. */
export function getVisibleLessons<T extends { id: number | string }>(
  lessons: T[],
  prog: BookLessonProgressState | undefined,
): T[] {
  const current = getCurrentLessonNumber(prog, lessons.length);
  if (current === null) return [];
  return lessons.filter((lesson, i) => getLessonNumber(lesson, i) === current);
}

/** First incomplete unlocked lesson; null when all lessons are done. */
export function getCurrentLessonNumber(
  prog: BookLessonProgressState | undefined,
  totalLessons: number,
): number | null {
  for (let n = 1; n <= totalLessons; n++) {
    if (isLessonCompleted(prog, n)) continue;
    if (isLessonUnlocked(prog, n)) return n;
  }
  return null;
}

/** Build book-style progress from evaluation records (English grammar/comprehension). */
export function progressFromEvaluations(
  sectionKey: string,
  lessons: { id: number }[],
  evaluations: LessonEvaluationLike[],
): BookLessonProgressState {
  const completed: number[] = [];
  for (const lesson of lessons) {
    const contentId = `${sectionKey}:unit_${String(lesson.id).padStart(2, '0')}`;
    if (evaluations.some((e) => e.lesson_completed && e.content_id === contentId)) {
      completed.push(lesson.id);
    }
  }
  completed.sort((a, b) => a - b);
  return {
    max_unlocked_lesson_index: completed.length > 0 ? Math.max(...completed) : 0,
    completed_lesson_numbers: completed,
  };
}

export function emptyLessonProgress(): BookLessonProgressState {
  return { max_unlocked_lesson_index: 0, completed_lesson_numbers: [] };
}
