'use client';

import { getSession, getStudentById, sanitizeStudent, deleteSession } from './database';

const SESSION_KEY = 'currentSession';
const STUDENT_KEY = 'currentStudent';

export interface AuthContext {
  sessionToken: string;
  session: ReturnType<typeof getSession>;
  student: ReturnType<typeof getStudentById>;
}

export function requireActiveStudent(): AuthContext | null {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return null;

  const session = getSession(token);
  if (!session) {
    clearClientSession();
    return null;
  }

  const student = getStudentById(session.studentId);
  if (!student) {
    clearClientSession();
    return null;
  }

  localStorage.setItem(STUDENT_KEY, JSON.stringify(sanitizeStudent(student)));
  return { sessionToken: token, session, student };
}

export function clearClientSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(STUDENT_KEY);
}

export function logout(sessionToken: string): void {
  if (sessionToken) deleteSession(sessionToken);
  clearClientSession();
}

export function getStoredStudent() {
  try {
    const data = localStorage.getItem(STUDENT_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}
