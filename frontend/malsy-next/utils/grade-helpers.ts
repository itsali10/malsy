import { isValidGrade } from './grade-validator';

export const PASS_THRESHOLD = 50;

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toPercent(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}

export function letterGrade(value: unknown): string {
  if (!isValidGrade(value)) return '—';
  if (value >= 90) return 'A+';
  if (value >= 85) return 'A';
  if (value >= 80) return 'A-';
  if (value >= 75) return 'B+';
  if (value >= 70) return 'B';
  if (value >= 65) return 'B-';
  if (value >= 60) return 'C+';
  if (value >= 55) return 'C';
  if (value >= 50) return 'C-';
  if (value >= 45) return 'D';
  return 'F';
}

export function passFail(value: unknown): string {
  if (!isValidGrade(value)) return '—';
  return value >= PASS_THRESHOLD ? 'Pass' : 'Fail';
}

export function gradeClass(value: unknown): string {
  if (!isValidGrade(value)) return 'grade-neutral';
  if (value >= 80) return 'grade-excellent';
  if (value >= 60) return 'grade-good';
  if (value >= 50) return 'grade-average';
  return 'grade-fail';
}

export function displayGrade(value: unknown): string {
  if (!isValidGrade(value)) return '—';
  return round(value).toFixed(2);
}

export function remark(value: unknown): string {
  if (!isValidGrade(value)) return 'No grade yet';
  if (value >= 90) return 'Outstanding';
  if (value >= 80) return 'Excellent';
  if (value >= 70) return 'Very Good';
  if (value >= 60) return 'Good';
  if (value >= 50) return 'Satisfactory';
  if (value >= 45) return 'Needs Improvement';
  return 'Failing';
}
