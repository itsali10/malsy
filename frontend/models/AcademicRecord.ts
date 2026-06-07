import { createSemester, SemesterData } from './Semester';

export const SUBJECTS = ['english', 'science', 'socialStudies'] as const;
export type Subject = typeof SUBJECTS[number];

export const SUBJECT_LABELS: Record<string, string> = {
  english: 'English',
  science: 'Science',
  socialStudies: 'Social Studies',
};

export interface AcademicRecord {
  studentId: string;
  subject: string;
  academicYear: number;
  semester1: SemesterData;
  semester2: SemesterData;
}

export function createAcademicRecord(
  studentId: string,
  subject: string,
  academicYear: number,
): AcademicRecord {
  return {
    studentId,
    subject,
    academicYear,
    semester1: createSemester(1),
    semester2: createSemester(2),
  };
}

export function buildRecordKey(studentId: string, subject: string, academicYear: number): string {
  return `${studentId}__${subject}__${academicYear}`;
}
