import { SUBJECTS, SUBJECT_LABELS, createAcademicRecord } from '@/models/AcademicRecord';
import { SemesterWeightLabels } from '@/models/Semester';
import { yearGrade, SemesterResult } from './grade-calculator';
import { getRecord } from './grade-database';
import { isValidGrade } from '@/utils/grade-validator';
import { letterGrade, passFail, round } from '@/utils/grade-helpers';
import type { Student } from './database';

export interface SubjectReport {
  subject: string;
  label: string;
  yearGrade: number | null;
  letterGrade: string;
  status: string;
  sem1: SemesterResult;
  sem2: SemesterResult;
}

export interface FullReport {
  student: Pick<Student, 'id' | 'name'>;
  year: number;
  overallAverage: number | null;
  overallLetter: string;
  overallStatus: string;
  subjects: SubjectReport[];
}

export function generateFullReport(student: Pick<Student, 'id' | 'name'>, year: number): FullReport {
  const subjects = SUBJECTS.map((subject) => {
    const record = getRecord(student.id, subject, year) || createAcademicRecord(student.id, subject, year);
    const result = yearGrade(record);
    return {
      subject,
      label: SUBJECT_LABELS[subject],
      yearGrade: result.yearGrade,
      letterGrade: letterGrade(result.yearGrade),
      status: passFail(result.yearGrade),
      sem1: result.sem1,
      sem2: result.sem2,
    };
  });

  const validGrades = subjects.map((r) => r.yearGrade).filter(isValidGrade) as number[];
  const overallAverage = validGrades.length > 0
    ? round(validGrades.reduce((s, g) => s + g, 0) / validGrades.length)
    : null;

  return {
    student,
    year,
    overallAverage,
    overallLetter: letterGrade(overallAverage),
    overallStatus: passFail(overallAverage),
    subjects,
  };
}

export interface SemesterRow {
  key: string;
  label: string;
  weight: string;
  value: number | string;
  contribution: number | string;
}

export function semesterRows(semResult: SemesterResult | null): SemesterRow[] {
  if (!semResult?.breakdown) return [];
  return Object.entries(semResult.breakdown).map(([key, data]) => ({
    key,
    label: SemesterWeightLabels[key] || key,
    weight: data.weight,
    value: data.value !== null ? data.value : '—',
    contribution: data.contribution !== null ? data.contribution : '—',
  }));
}
