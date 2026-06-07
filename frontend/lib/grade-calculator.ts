import { SemesterData, SemesterWeights } from '@/models/Semester';
import { AcademicRecord } from '@/models/AcademicRecord';
import { isValidGrade } from '@/utils/grade-validator';
import { round, toPercent } from '@/utils/grade-helpers';

export interface BreakdownEntry {
  value: number | null;
  weight: string;
  contribution: number | null;
}

export interface SemesterResult {
  grade: number | null;
  breakdown: Record<string, BreakdownEntry>;
  hasPartialData: boolean;
}

export interface YearResult {
  yearGrade: number | null;
  sem1: SemesterResult;
  sem2: SemesterResult;
}

export function quizAverage(quiz1: number | null, quiz2: number | null): number | null {
  const valid = [quiz1, quiz2].filter(isValidGrade) as number[];
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

export function semesterGrade(semester: SemesterData): SemesterResult {
  const weights = SemesterWeights;
  const avg = quizAverage(semester.quiz1, semester.quiz2);

  const components = [
    { key: 'quizAverage', value: avg, weight: weights.quizAverage },
    { key: 'assignment', value: semester.assignment, weight: weights.assignment },
    { key: 'midterm', value: semester.midterm, weight: weights.midterm },
    { key: 'participation', value: semester.participation, weight: weights.participation },
    { key: 'finalExam', value: semester.finalExam, weight: weights.finalExam },
  ];

  const present = components.filter((c) => isValidGrade(c.value));
  const missing = components.filter((c) => !isValidGrade(c.value));

  if (present.length === 0) return { grade: null, breakdown: {}, hasPartialData: false };

  const presentWeightTotal = present.reduce((s, c) => s + c.weight, 0);
  const breakdown: Record<string, BreakdownEntry> = {};
  let weightedTotal = 0;

  present.forEach((c) => {
    const normWeight = c.weight / presentWeightTotal;
    const contribution = (c.value as number) * normWeight;
    breakdown[c.key] = {
      value: round(c.value as number),
      weight: toPercent(c.weight),
      contribution: round(contribution),
    };
    weightedTotal += contribution;
  });

  missing.forEach((c) => {
    breakdown[c.key] = { value: null, weight: toPercent(c.weight), contribution: null };
  });

  return { grade: round(weightedTotal), breakdown, hasPartialData: missing.length > 0 };
}

export function yearGrade(record: AcademicRecord): YearResult {
  const sem1 = semesterGrade(record.semester1);
  const sem2 = semesterGrade(record.semester2);
  const grades = [sem1.grade, sem2.grade].filter(isValidGrade) as number[];
  const yg = grades.length > 0 ? round(grades.reduce((s, g) => s + g, 0) / grades.length) : null;
  return { yearGrade: yg, sem1, sem2 };
}
