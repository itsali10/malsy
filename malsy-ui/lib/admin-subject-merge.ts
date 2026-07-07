import type { BookRecord, SubjectContent } from './admin-api';

export type SubjectKey = string;

export interface SubjectCardModel {
  subject_key: SubjectKey;
  subject_name: string;
  icon: string;
  grade: number;
  student_session_count: number;
  generated_content_count: number;
  uploaded_book_count: number;
  has_book: boolean;
  book: BookRecord | null;
  books: BookRecord[];
  visible_to_students: boolean;
  archived: boolean;
  builtin: boolean;
}

export const SUBJECT_DEFS: Record<string, { subject_name: string; icon: string; grade: number }> = {
  english: { subject_name: 'English', icon: '📖', grade: 6 },
  science: { subject_name: 'Science', icon: '🔬', grade: 6 },
  history: { subject_name: 'History', icon: '🏛️', grade: 6 },
};

export const SUBJECT_ORDER: SubjectKey[] = ['english', 'science', 'history'];

/** Normalize any subject/book label to a known subject key */
export function normalizeSubjectKey(...candidates: (string | undefined | null)[]): SubjectKey | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const v = raw.toLowerCase().trim();

    if (v === 'english' || v === 'eng' || v.startsWith('english_') || v.startsWith('english-')) return 'english';
    if (v === 'history' || v === 'hist' || v.startsWith('history_') || v.startsWith('history-')) return 'history';
    if (v === 'science' || v === 'sci' || v.startsWith('science_') || v.startsWith('science-')) return 'science';
    if (v === 'chemistry' || v === 'chem' || v.includes('chemistry')) return 'science';

    if (v.includes('english') || v.includes('grade 6 english')) return 'english';
    if (v.includes('history') || v.includes('world history') || v.includes('ancient egypt')) return 'history';
    if (v.includes('science') || v.includes('chemistry') || v.includes('chem lab')) return 'science';

    const base = v.split('_')[0]?.split('-')[0];
    if (base && /^[a-z][a-z0-9_]*$/.test(base)) return base;
  }
  return null;
}

export interface SessionHints {
  student_session_count?: number;
  generated_lesson_count?: number;
}

function summaryToBookRecord(
  summary: NonNullable<SubjectContent['book']>,
  subjectKey: SubjectKey,
  grade: number,
): BookRecord {
  return {
    book_id: summary.book_id ?? `${subjectKey}_g${grade}`,
    title: summary.title ?? `${subjectKey} Grade ${grade}`,
    subject: subjectKey,
    grade,
    status: (summary.status as BookRecord['status']) ?? 'uploaded',
    visible_to_students: Boolean(summary.visible_to_students),
    archived: Boolean(summary.archived),
    unit_count: summary.unit_count,
    lesson_count: summary.lesson_count,
    chunk_count: summary.chunk_count,
    error_message: summary.error_message,
    uploaded_at: summary.uploaded_at,
  };
}

/** Fallback: pull book records out of /admin/content/subjects when /admin/books fails */
export function booksFromSubjectContent(subjectContent: SubjectContent[]): BookRecord[] {
  const out: BookRecord[] = [];
  for (const card of subjectContent) {
    const key = card.subject_key;
    for (const b of card.books ?? []) {
      if (b?.book_id || b?.title) out.push(summaryToBookRecord(b, key, card.grade));
    }
    if (card.book && !out.some((x) => x.book_id === card.book?.book_id)) {
      out.push(summaryToBookRecord(card.book, key, card.grade));
    }
  }
  return out;
}

function bookRecordsForSubject(
  subjectKey: SubjectKey,
  grade: number,
  uploadedBooks: BookRecord[],
  subjectContent?: SubjectContent,
): BookRecord[] {
  const fromUploads = uploadedBooks.filter((book) => {
    const norm = normalizeSubjectKey(book.subject, book.book_id, book.title);
    return norm === subjectKey || book.subject === subjectKey;
  });
  if (fromUploads.length > 0) return fromUploads;
  const fromApi = (subjectContent?.books ?? [])
    .filter((b) => b?.book_id || b?.title)
    .map((b) => summaryToBookRecord(b, subjectKey, grade));
  if (fromApi.length > 0) return fromApi;
  if (subjectContent?.book) return [summaryToBookRecord(subjectContent.book, subjectKey, grade)];
  return [];
}

/** Build subject cards from API subject list + uploaded books */
export function mergeSubjectCards(
  uploadedBooks: BookRecord[],
  subjectContent: SubjectContent[] = [],
): SubjectCardModel[] {
  if (subjectContent.length > 0) {
    return subjectContent.map((s) => {
      const books = bookRecordsForSubject(s.subject_key, s.grade, uploadedBooks, s);
      const primary =
        books.find((b) => b.book_id === `${s.subject_key}_g${s.grade}`) ??
        books.find((b) => !b.archived) ??
        books[0] ??
        null;

      return {
        subject_key: s.subject_key,
        subject_name: s.subject_name,
        icon: s.icon,
        grade: s.grade,
        student_session_count: s.student_session_count,
        generated_content_count: s.generated_lesson_count,
        uploaded_book_count: books.length || s.uploaded_book_count,
        has_book: Boolean(primary || s.has_book),
        book: primary,
        books,
        visible_to_students: Boolean(s.visible_to_students),
        archived: Boolean(s.archived),
        builtin: Boolean((s as SubjectContent & { builtin?: boolean }).builtin),
      } satisfies SubjectCardModel;
    });
  }

  const buckets: Record<string, BookRecord[]> = {};
  for (const book of uploadedBooks) {
    const norm = normalizeSubjectKey(book.title, book.subject, book.book_id);
    if (!norm) continue;
    (buckets[norm] = buckets[norm] ?? []).push(book);
  }

  return SUBJECT_ORDER.map((key) => {
    const books = buckets[key] ?? [];
    const def = SUBJECT_DEFS[key];
    const primary =
      books.find((b) => b.book_id === `${key}_g6`) ??
      books.find((b) => !b.archived) ??
      books[0] ??
      null;

    return {
      subject_key: key,
      subject_name: def.subject_name,
      icon: def.icon,
      grade: def.grade,
      student_session_count: 0,
      generated_content_count: 0,
      uploaded_book_count: books.length,
      has_book: books.length > 0,
      book: primary,
      books,
      visible_to_students: true,
      archived: false,
      builtin: true,
    } satisfies SubjectCardModel;
  });
}

export function visibilityStatusLabel(book: BookRecord | null): string {
  if (!book) return '';
  if (book.archived) return 'Archived / Hidden';
  if (book.visible_to_students) return 'Published to Students';
  return 'Hidden from Students';
}

import type { BookRecord, RagProgress } from './admin-api';

export function processingStatusLabel(
  book: BookRecord | null,
  ragProgress?: RagProgress | null,
): string {
  if (!book) return '';
  if (book.status === 'processing' && ragProgress?.detail) {
    return ragProgress.detail;
  }
  if (book.status === 'processing' && ragProgress?.stage_label) {
    return ragProgress.stage_label;
  }
  if (book.status === 'failed' && ragProgress?.error_message) {
    return `Failed — ${ragProgress.error_message}`;
  }
  return book.status.charAt(0).toUpperCase() + book.status.slice(1);
}

export function combinedStatusLabel(book: BookRecord | null): string {
  if (!book) return '';
  return `${visibilityStatusLabel(book)} / ${processingStatusLabel(book)}`;
}

export function scheduleStatusLabel(book: BookRecord | null): string {
  if (!book) return 'Not visible in schedule yet';
  if (book.schedule_in_student_portal) return 'Visible in student schedule';
  if (
    book.status === 'processed' &&
    book.visible_to_students &&
    !book.archived &&
    book.plan_status === 'approved'
  ) {
    return 'Syncing to student schedule…';
  }
  return 'Not visible in schedule yet';
}
