import type { BookStructureUnit } from './admin-api';

export interface DisplayLesson {
  lesson_id: string;
  title: string;
  start_page?: number;
  end_page?: number;
  chapter_id: string;
}

export interface DisplayUnit {
  unit_id: string;
  title: string;
  start_page?: number;
  end_page?: number;
  lessons: DisplayLesson[];
}

function cleanTitle(raw?: string | null): string {
  const t = (raw ?? '').trim();
  if (!t || /^unit_\d+(_lesson_\d+)?$/i.test(t)) return '';
  if (/^[a-z0-9_]+:unit_/i.test(t)) return '';
  return t;
}

function unitPrefix(unitId: string): string {
  const m = unitId.match(/^(unit_\d+)(?:_lesson_\d+)?$/i);
  return m ? m[1] : unitId;
}

function unitDisplayTitle(prefix: string, hint?: string): string {
  const cleaned = cleanTitle(hint);
  if (cleaned) return cleaned;
  const num = prefix.match(/unit_(\d+)/i)?.[1];
  return num ? `Unit ${parseInt(num, 10)}` : prefix;
}

/** Build nested units + lessons for admin display (handles flat post-ingest manifests). */
export function groupStructureForDisplay(
  units: BookStructureUnit[],
  bookId: string,
): DisplayUnit[] {
  if (!units.length) return [];

  const hasNested = units.some((u) => (u.lessons?.length ?? 0) > 0);
  if (hasNested) {
    return units.map((u) => ({
      unit_id: u.unit_id,
      title: unitDisplayTitle(u.unit_id, u.title),
      start_page: u.start_page,
      end_page: u.end_page,
      lessons: (u.lessons ?? []).map((les) => ({
        lesson_id: les.lesson_id,
        title: cleanTitle(les.title) || 'Untitled lesson',
        start_page: les.start_page,
        end_page: les.end_page,
        chapter_id: resolveLessonChapterId(bookId, u.unit_id, les.lesson_id),
      })),
    }));
  }

  const groups = new Map<string, DisplayUnit>();
  for (const row of units) {
    const prefix = unitPrefix(row.unit_id);
    if (!groups.has(prefix)) {
      groups.set(prefix, {
        unit_id: prefix,
        title: unitDisplayTitle(prefix, row.unit_id === prefix ? row.title : undefined),
        start_page: row.start_page,
        end_page: row.end_page,
        lessons: [],
      });
    }
    const group = groups.get(prefix)!;
    group.lessons.push({
      lesson_id: row.unit_id,
      title: cleanTitle(row.title) || 'Untitled lesson',
      start_page: row.start_page,
      end_page: row.end_page,
      chapter_id: resolveLessonChapterId(bookId, prefix, row.unit_id),
    });
    if (row.start_page != null) {
      group.start_page = group.start_page == null ? row.start_page : Math.min(group.start_page, row.start_page);
    }
    if (row.end_page != null) {
      group.end_page = group.end_page == null ? row.end_page : Math.max(group.end_page, row.end_page);
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.unit_id.localeCompare(b.unit_id));
}

export function resolveLessonChapterId(
  bookId: string,
  unitId: string,
  lessonId: string,
): string {
  if (lessonId.includes(':')) return lessonId;
  if (/_lesson_/i.test(lessonId)) return `${bookId}:${lessonId}`;
  if (/^unit_\d+$/i.test(unitId) && /^lesson_/i.test(lessonId)) {
    return `${bookId}:${unitId}_${lessonId}`;
  }
  const short = lessonId.includes(':') ? lessonId.split(':').pop()! : lessonId;
  return `${bookId}:${short}`;
}

export function pageRangeLabel(start?: number, end?: number): string {
  if (start == null && end == null) return '';
  return `Pages ${start ?? '?'}–${end ?? '?'}`;
}

/** Unit/lesson totals matching the grouped Book structure tree (admin summary cards). */
export function structureDisplayCounts(
  units: BookStructureUnit[],
  bookId: string,
): { unitCount: number; lessonCount: number } {
  const displayUnits = groupStructureForDisplay(units, bookId);
  return {
    unitCount: displayUnits.length,
    lessonCount: displayUnits.reduce((total, unit) => total + unit.lessons.length, 0),
  };
}
