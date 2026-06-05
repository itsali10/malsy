export const SemesterWeights: Record<string, number> = {
  quizAverage: 0.20,
  assignment: 0.20,
  midterm: 0.20,
  participation: 0.10,
  finalExam: 0.30,
};

export const SemesterWeightLabels: Record<string, string> = {
  quizAverage: 'Quizzes (avg)',
  assignment: 'Assignment / Project',
  midterm: 'Midterm Exam',
  participation: 'Participation',
  finalExam: 'Final Exam',
};

export interface SemesterData {
  number: number;
  quiz1: number | null;
  quiz2: number | null;
  assignment: number | null;
  midterm: number | null;
  participation: number | null;
  finalExam: number | null;
}

export function createSemester(semesterNumber: number): SemesterData {
  return {
    number: semesterNumber,
    quiz1: null,
    quiz2: null,
    assignment: null,
    midterm: null,
    participation: null,
    finalExam: null,
  };
}

export const semesterComponentKeys = (): (keyof Omit<SemesterData, 'number'>)[] =>
  ['quiz1', 'quiz2', 'assignment', 'midterm', 'participation', 'finalExam'];
