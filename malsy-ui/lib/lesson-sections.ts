/** Four-section language lesson model (shared with backend language_lesson_sections.py). */

export const LANGUAGE_LESSON_SECTIONS = [
  { key: 'reading', type: 'reading', title: 'Reading', icon: '📖' },
  { key: 'grammar', type: 'grammar', title: 'Grammar', icon: '✏' },
  { key: 'listening', type: 'listening', title: 'Listening', icon: '🎧' },
  { key: 'pronunciation', type: 'speaking', title: 'Pronunciation', icon: '🗣' },
] as const;

export type LanguageSectionKey = (typeof LANGUAGE_LESSON_SECTIONS)[number]['key'];
export type LanguageSectionIndex = 0 | 1 | 2 | 3;

export const LANGUAGE_SECTION_COUNT = LANGUAGE_LESSON_SECTIONS.length;
export const LANGUAGE_LAST_SECTION_INDEX = LANGUAGE_SECTION_COUNT - 1;

/** Books/subjects that use four skill sections instead of two page halves. */
const LANGUAGE_SUBJECT_PREFIXES = [
  'english', 'french', 'spanish', 'arabic', 'german', 'mandarin', 'chinese', 'esl', 'efl',
];

export function usesLanguageSections(chapterId: string): boolean {
  const bookId = (chapterId || '').split(':')[0].toLowerCase();
  const subject = bookId.split('_')[0] || bookId;
  if (bookId.includes('history')) return false;
  return LANGUAGE_SUBJECT_PREFIXES.some(p => subject === p || bookId.startsWith(`${p}_`));
}

export function lastPartIndex(chapterId: string): number {
  return usesLanguageSections(chapterId) ? LANGUAGE_LAST_SECTION_INDEX : 1;
}

export function clampPartIndex(chapterId: string, part: number): number {
  return Math.max(0, Math.min(lastPartIndex(chapterId), part));
}

export function sectionDef(index: number) {
  const i = Math.max(0, Math.min(LANGUAGE_LAST_SECTION_INDEX, index));
  return LANGUAGE_LESSON_SECTIONS[i];
}

export function sectionProgressPercent(unitPart: number, _maxUnlocked: number): number {
  const done = Math.min(unitPart, LANGUAGE_SECTION_COUNT);
  return Math.min(100, Math.round((done / LANGUAGE_SECTION_COUNT) * 100));
}

export interface SectionStatus {
  key: string;
  type: string;
  title: string;
  icon: string;
  index: number;
  completed: boolean;
  active: boolean;
  unlocked: boolean;
  locked: boolean;
}

export function buildSectionStatuses(unitPart: number, maxUnlocked: number): SectionStatus[] {
  return LANGUAGE_LESSON_SECTIONS.map((sec, i) => ({
    ...sec,
    index: i,
    completed: i < unitPart,
    active: i === unitPart,
    unlocked: i <= maxUnlocked,
    locked: i > maxUnlocked,
  }));
}
