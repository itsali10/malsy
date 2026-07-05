import type { AdminLessonContent, BookDetailResponse, BookPlan, BookPlanUnit } from './admin-api';

export interface AdminNormalizedLesson {
  key: string;
  unit_id: string;
  real_unit_id: string;
  title: string;
  item_count?: number;
  start_page?: number;
  end_page?: number;
  source: 'plan' | 'indexed' | 'merged';
}

const GENERIC_UNIT_RE = /^unit_\d+$/i;
const FULL_UNIT_RE = /^[a-z0-9_]+:unit_\d+$/i;

/** True when title is a book name, raw id, or other non-lesson label. */
export function isGenericLessonTitle(
  title: string | undefined | null,
  bookId?: string,
  bookTitle?: string,
): boolean {
  const t = (title ?? '').trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  if (GENERIC_UNIT_RE.test(t) || FULL_UNIT_RE.test(t)) return true;
  if (bookId && lower === bookId.toLowerCase()) return true;
  if (bookTitle && lower === bookTitle.trim().toLowerCase()) return true;
  if (bookTitle && lower.includes('grade') && bookTitle.toLowerCase().includes(lower.slice(0, 12))) {
    // e.g. "Science Grade 6" as both book and unit title
    if (lower === bookTitle.trim().toLowerCase()) return true;
  }
  return false;
}

function normalizeRealUnitId(bookId: string, raw: string): string {
  let id = (raw || '').trim();
  if (!id) return `${bookId}:unit_01`;
  const prefix = `${bookId}:`;
  while (id.startsWith(prefix + bookId + ':')) {
    id = prefix + id.slice(prefix.length + bookId.length + 1);
  }
  if (!id.includes(':')) {
    return `${bookId}:${id}`;
  }
  return id;
}

function stableLessonKey(bookId: string, realUnitId: string, shortUnitId: string): string {
  return normalizeRealUnitId(bookId, realUnitId || `${bookId}:${shortUnitId}`);
}

function pickTitle(
  candidates: (string | undefined | null)[],
  bookId: string,
  bookTitle?: string,
): string {
  for (const c of candidates) {
    if (c && !isGenericLessonTitle(c, bookId, bookTitle)) {
      return c.trim();
    }
  }
  return 'Untitled lesson';
}

/** Best display title for a lesson row/card (plan, indexed units, or loaded content). */
export function resolveLessonDisplayTitle(
  lesson: AdminNormalizedLesson,
  content: AdminLessonContent | null | undefined,
  bookId: string,
  bookTitle?: string,
): string {
  return pickTitle(
    [content?.lesson_title, lesson.title, content?.unit_plan?.unit_title],
    bookId,
    bookTitle,
  );
}

/**
 * Merge plan units, indexed Chroma units, and optional manifest lessons into one list.
 */
export function normalizeAdminLessons(
  bookId: string,
  options: {
    plan?: BookPlan | null;
    bookDetail?: BookDetailResponse | null;
    bookTitle?: string;
    log?: boolean;
  },
): AdminNormalizedLesson[] {
  const { plan, bookDetail, bookTitle, log = false } = options;
  const planUnits: BookPlanUnit[] = plan?.units ?? [];
  const indexedUnits = bookDetail?.units ?? [];
  const manifestLessons = Array.isArray(bookDetail?.lessons)
    ? (bookDetail!.lessons as { unit_id?: string; title?: string; lesson_id?: string }[])
    : [];

  if (log) {
    console.log('[admin-lessons] raw backend — plan.units:', planUnits);
    console.log('[admin-lessons] raw backend — bookDetail.units:', indexedUnits);
    console.log('[admin-lessons] raw backend — bookDetail.lessons:', manifestLessons);
    console.log('[admin-lessons] raw backend — plan.modules items:', plan?.modules?.map((m) => ({
      key: m.key,
      itemCount: m.items?.length ?? 0,
    })));
  }

  const byKey = new Map<string, AdminNormalizedLesson>();

  for (const u of planUnits) {
    const short = u.unit_id;
    const real = normalizeRealUnitId(bookId, u.real_unit_id ?? `${bookId}:${short}`);
    const key = stableLessonKey(bookId, real, short);
    const title = pickTitle(
      [u.title, u.unit_plan?.unit_title],
      bookId,
      bookTitle,
    );
    byKey.set(key, {
      key,
      unit_id: short,
      real_unit_id: real,
      title,
      item_count: u.unit_plan?.items?.length,
      source: 'plan',
    });
  }

  for (const u of indexedUnits) {
    const real = normalizeRealUnitId(bookId, u.unit_id);
    const short = real.split(':').slice(-1)[0];
    const key = stableLessonKey(bookId, real, short);
    const existing = byKey.get(key);
    const indexedTitle = u.title;

    if (existing) {
      existing.start_page = u.start_page;
      existing.end_page = u.end_page;
      if (isGenericLessonTitle(existing.title, bookId, bookTitle) && !isGenericLessonTitle(indexedTitle, bookId, bookTitle)) {
        existing.title = indexedTitle!.trim();
      }
      existing.source = 'merged';
    } else {
      byKey.set(key, {
        key,
        unit_id: short,
        real_unit_id: real,
        title: pickTitle([indexedTitle], bookId, bookTitle),
        start_page: u.start_page,
        end_page: u.end_page,
        source: 'indexed',
      });
    }
  }

  for (const les of manifestLessons) {
    const real = les.unit_id ?? les.lesson_id ?? '';
    if (!real) continue;
    const short = real.includes(':') ? real.split(':').slice(-1)[0] : real;
    const key = stableLessonKey(bookId, real, short);
    const existing = byKey.get(key);
    if (existing) {
      if (isGenericLessonTitle(existing.title, bookId, bookTitle) && les.title) {
        existing.title = pickTitle([les.title, existing.title], bookId, bookTitle);
      }
      existing.source = 'merged';
    } else if (les.title) {
    byKey.set(key, {
      key,
      unit_id: short,
      real_unit_id: real,
        title: pickTitle([les.title], bookId, bookTitle),
        source: 'indexed',
      });
    }
  }

  const normalized = Array.from(byKey.values()).sort((a, b) => {
    const na = parseInt(a.unit_id.replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(b.unit_id.replace(/\D/g, ''), 10) || 0;
    return na - nb || a.title.localeCompare(b.title);
  });

  // Second pass: dedupe by normalized title (same lesson under book title vs plan title)
  const byTitle = new Map<string, AdminNormalizedLesson>();
  for (const lesson of normalized) {
    const titleKey = lesson.title.toLowerCase();
    const prev = byTitle.get(titleKey);
    if (!prev) {
      byTitle.set(titleKey, lesson);
      continue;
    }
    // Prefer plan-sourced row with item_count
    if ((lesson.item_count ?? 0) > (prev.item_count ?? 0) || lesson.source === 'plan') {
      byTitle.set(titleKey, {
        ...lesson,
        start_page: lesson.start_page ?? prev.start_page,
        end_page: lesson.end_page ?? prev.end_page,
      });
    }
  }

  const deduplicated = Array.from(byTitle.values()).sort((a, b) => {
    const na = parseInt(a.unit_id.replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(b.unit_id.replace(/\D/g, ''), 10) || 0;
    return na - nb || a.title.localeCompare(b.title);
  });

  if (log) {
    console.log('[admin-lessons] normalized lessons array:', normalized);
    console.log('[admin-lessons] deduplicated lessons array:', deduplicated);
  }

  return deduplicated;
}
