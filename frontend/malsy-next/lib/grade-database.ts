'use client';

import { AcademicRecord, buildRecordKey, createAcademicRecord } from '@/models/AcademicRecord';
import { SemesterData } from '@/models/Semester';

const STORAGE_KEY = 'malsy_grades';

function getRaw(): Record<string, AcademicRecord> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveRaw(data: Record<string, AcademicRecord>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getRecord(studentId: string, subject: string, year: number): AcademicRecord | null {
  return getRaw()[buildRecordKey(studentId, subject, year)] || null;
}

export function saveRecord(record: AcademicRecord): AcademicRecord {
  const all = getRaw();
  all[buildRecordKey(record.studentId, record.subject, record.academicYear)] = record;
  saveRaw(all);
  return record;
}

export function getStudentRecords(studentId: string): AcademicRecord[] {
  return Object.values(getRaw()).filter((r) => r.studentId === studentId);
}

export function getOrCreate(studentId: string, subject: string, year: number): AcademicRecord {
  return getRecord(studentId, subject, year) || createAcademicRecord(studentId, subject, year);
}

export function saveSemesterGrades(
  studentId: string,
  subject: string,
  year: number,
  semesterNumber: 1 | 2,
  semesterData: Partial<SemesterData>,
): AcademicRecord {
  const record = getOrCreate(studentId, subject, year);
  const key = `semester${semesterNumber}` as 'semester1' | 'semester2';
  record[key] = { ...record[key], ...semesterData, number: semesterNumber };
  return saveRecord(record);
}

export function clearAllGrades(): void {
  localStorage.removeItem(STORAGE_KEY);
}
