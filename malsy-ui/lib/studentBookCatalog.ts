import type { HistoryLessonCard, HistoryLessonsResponse } from './api';
import type { Lesson } from './learning-config';

/** Lesson card backed by GET /books/{book_id}/lessons (published catalog). */
export interface CatalogLesson extends Lesson {
  fullUnitId: string;
  lessonNumber: number;
  startPage?: number;
  endPage?: number;
  videoFilename?: string | null;
  videoType?: string | null;
}

export function mapBookLessonsResponse(data: HistoryLessonsResponse): CatalogLesson[] {
  return (data.lessons ?? []).map((row: HistoryLessonCard, index) => ({
    id: row.lessonNumber ?? index + 1,
    name: row.title,
    description: row.shortDescription || '',
    fullUnitId: row.id,
    lessonNumber: row.lessonNumber ?? index + 1,
    startPage: row.start_page,
    endPage: row.end_page,
    videoFilename: row.videoFilename,
    videoType: row.videoType,
  }));
}

export function isLanguageBook(partCount?: number): boolean {
  return (partCount ?? 0) >= 4;
}

export function learnHrefForChapter(
  chapterId: string,
  lessonTitle: string,
  unitPart: number,
): string {
  const params = new URLSearchParams({
    chapter: chapterId,
    lesson_title: lessonTitle,
    unit_part: String(unitPart),
  });
  return `/lessons/learn?${params.toString()}`;
}
