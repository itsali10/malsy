export const GradeTypes = {
  QUIZ_1: 'quiz1',
  QUIZ_2: 'quiz2',
  ASSIGNMENT: 'assignment',
  MIDTERM: 'midterm',
  PARTICIPATION: 'participation',
  FINAL_EXAM: 'finalExam',
} as const;

export const GradeLabels: Record<string, string> = {
  quiz1: 'Quiz 1',
  quiz2: 'Quiz 2',
  assignment: 'Assignment / Project',
  midterm: 'Midterm Exam',
  participation: 'Participation',
  finalExam: 'Final Exam',
};

export interface GradeEntry {
  type: string;
  label: string;
  value: number | null;
}

export function createGrade(type: string, value: number | null = null): GradeEntry {
  return { type, label: GradeLabels[type] || type, value };
}
