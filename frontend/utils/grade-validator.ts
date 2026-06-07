import { semesterComponentKeys, SemesterData } from '@/models/Semester';
import { GradeLabels } from '@/models/Grade';

export const GRADE_MIN = 0;
export const GRADE_MAX = 100;

export function isValidGrade(value: unknown): value is number {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= GRADE_MIN && n <= GRADE_MAX;
}

export interface ParseResult {
  ok: boolean;
  value: number | null;
  error: string | null;
}

export function parseGradeInput(raw: unknown): ParseResult {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: true, value: null, error: null };
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return { ok: false, value: null, error: 'Grade must be a number.' };
  }
  if (num < GRADE_MIN || num > GRADE_MAX) {
    return { ok: false, value: null, error: `Grade must be between ${GRADE_MIN} and ${GRADE_MAX}.` };
  }
  return { ok: true, value: num, error: null };
}

export function validateSemester(semester: SemesterData): string[] {
  const errors: string[] = [];
  semesterComponentKeys().forEach((key) => {
    const result = parseGradeInput(semester[key]);
    if (!result.ok) {
      const label = GradeLabels[key] || key;
      errors.push(`${label}: ${result.error}`);
    }
  });
  return errors;
}
