import type { ContinueLearningSubjectRead, LessonEvaluationRead } from './api';

export interface EarnedAchievement {
  id: string;
  icon: string;
  label: string;
  description: string;
  bg: string;
  color: string;
}

const DEFS = {
  first_lesson: {
    id: 'first_lesson',
    icon: '🌟',
    label: 'First Lesson',
    description: 'Completed your first lesson.',
    bg: 'linear-gradient(135deg,#5B21F5,#8B55FF)',
    color: 'var(--vl)',
  },
  great_reader: {
    id: 'great_reader',
    icon: '📖',
    label: 'Great Reader',
    description: 'Finished a Reading section.',
    bg: 'linear-gradient(135deg,#0A6090,#3BBFFF)',
    color: 'var(--sky)',
  },
  grammar_star: {
    id: 'grammar_star',
    icon: '✏️',
    label: 'Grammar Star',
    description: 'Completed a Grammar section.',
    bg: 'linear-gradient(135deg,#D4A017,#FFB830)',
    color: 'var(--amber)',
  },
  listening_hero: {
    id: 'listening_hero',
    icon: '🎧',
    label: 'Listening Hero',
    description: 'Completed a Listening section.',
    bg: 'linear-gradient(135deg,#00B87E,#00E5A0)',
    color: 'var(--mint)',
  },
  pronunciation_star: {
    id: 'pronunciation_star',
    icon: '🎤',
    label: 'Pronunciation Star',
    description: 'Completed a Pronunciation section.',
    bg: 'linear-gradient(135deg,#E85D75,#FF8FA3)',
    color: 'var(--coral)',
  },
  three_day_streak: {
    id: 'three_day_streak',
    icon: '🔥',
    label: '3 Day Streak',
    description: 'Studied three days in a row.',
    bg: 'linear-gradient(135deg,#FF6B35,#FFB347)',
    color: 'var(--amber)',
  },
} as const;

/** Language section order: Reading → Grammar → Listening → Pronunciation */
const SECTION_INDEX: Record<string, number> = {
  reading: 0,
  grammar: 1,
  listening: 2,
  pronunciation: 3,
};

/** Language lessons expose reading/grammar/listening/pronunciation section keys. */
function languageResumes(resumes: ContinueLearningSubjectRead[]): ContinueLearningSubjectRead[] {
  return resumes.filter((r) =>
    (r.section_statuses ?? []).some((s) => s.key === 'reading'),
  );
}

/**
 * A section is earned only after the student moves past it (unit_part > section index).
 * Unlocked-but-not-finished sections must not count. Non-language subjects are ignored.
 */
function sectionPassed(resumes: ContinueLearningSubjectRead[], sectionKey: string): boolean {
  const index = SECTION_INDEX[sectionKey];
  if (index === undefined) return false;
  return languageResumes(resumes).some((r) => r.continue_available && r.unit_part > index);
}

function hasCompletedLesson(evals: LessonEvaluationRead[]): boolean {
  return evals.some((e) => e.lesson_completed);
}

function grammarEarned(_evals: LessonEvaluationRead[], resumes: ContinueLearningSubjectRead[]): boolean {
  return sectionPassed(resumes, 'grammar');
}

function pronunciationEarned(
  evals: LessonEvaluationRead[],
  resumes: ContinueLearningSubjectRead[],
): boolean {
  if (sectionPassed(resumes, 'pronunciation')) return true;
  return evals.some(
    (e) => e.lesson_completed && e.pronunciation_score != null,
  );
}

/** Derive earned badges from this student's evaluations, resume progress, and streak only. */
export function computeEarnedAchievements(
  evals: LessonEvaluationRead[],
  resumeSubjects: ContinueLearningSubjectRead[],
  streak: number,
): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];

  if (hasCompletedLesson(evals)) {
    earned.push({ ...DEFS.first_lesson });
  }
  if (sectionPassed(resumeSubjects, 'reading')) {
    earned.push({ ...DEFS.great_reader });
  }
  if (grammarEarned(evals, resumeSubjects)) {
    earned.push({ ...DEFS.grammar_star });
  }
  if (sectionPassed(resumeSubjects, 'listening')) {
    earned.push({ ...DEFS.listening_hero });
  }
  if (pronunciationEarned(evals, resumeSubjects)) {
    earned.push({ ...DEFS.pronunciation_star });
  }
  if (streak >= 3) {
    earned.push({ ...DEFS.three_day_streak });
  }

  return earned;
}
