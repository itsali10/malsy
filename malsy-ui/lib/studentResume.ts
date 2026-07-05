import type { ContinueLearningSubjectRead } from './api';

/** Build learn-page URL that resumes at the saved lesson + section. */
export function buildContinueLearningHref(resume: ContinueLearningSubjectRead): string | null {
  if (!resume.continue_available || !resume.chapter_id || resume.locked) {
    return null;
  }
  const params = new URLSearchParams({
    chapter: resume.chapter_id,
    lesson_title: resume.lesson_title || '',
    unit_part: String(resume.unit_part ?? 0),
  });
  return `/lessons/learn?${params.toString()}`;
}

export function continueLearningLabel(resume: ContinueLearningSubjectRead): string {
  if (resume.locked) return 'Locked';
  if (resume.continue_available) return 'Continue';
  return 'Start';
}
