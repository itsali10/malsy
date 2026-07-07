/**
 * Language lesson section order — matches backend language_lesson_sections.py
 * and admin View Plan (Reading → Grammar → Listening → Pronunciation).
 */
export const LANGUAGE_LESSON_SECTIONS = [
  { key: 'reading', title: 'Reading', icon: '📖' },
  { key: 'grammar', title: 'Grammar', icon: '✏️' },
  { key: 'listening', title: 'Listening', icon: '🎧' },
  { key: 'pronunciation', title: 'Pronunciation', icon: '🎤' },
] as const;

export type LanguageSectionKey = (typeof LANGUAGE_LESSON_SECTIONS)[number]['key'];
