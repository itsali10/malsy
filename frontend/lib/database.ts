'use client';

export interface StudentProgress {
  english: {
    totalLessons: number;
    completedLessons: number[];
    lessonsCompleted: number;
    score: number;
  };
  science: {
    totalLessons: number;
    completedLessons: number[];
    lessonsCompleted: number;
    chemistryLabVisited: boolean;
    score: number;
  };
  socialStudies: {
    sections: { history: number[]; geography: number[] };
    sectionTotals: { history: number; geography: number };
    lessonsCompleted: number;
    score: number;
  };
}

export interface StudentGames {
  hangman: { gamesPlayed: number; bestScore: number };
  spellingBee: { gamesPlayed: number; bestScore: number };
}

export interface Student {
  id: string;
  name: string;
  email: string;
  password: string;
  picture: string;
  createdAt?: string;
  progress: StudentProgress;
  games: StudentGames;
}

export interface Session {
  studentId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

const STORAGE_KEY = 'malsy_students';
const SESSIONS_KEY = 'malsy_sessions';

const BLUEPRINT = {
  english: { totalLessons: 9 },
  science: { totalLessons: 9 },
  socialStudies: { sections: { history: 4, geography: 4 } },
};

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }
  return hash.toString();
}

function generateToken(): string {
  return `token_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
}

function createDefaultProgress(): StudentProgress {
  return {
    english: {
      totalLessons: BLUEPRINT.english.totalLessons,
      completedLessons: [],
      lessonsCompleted: 0,
      score: 0,
    },
    science: {
      totalLessons: BLUEPRINT.science.totalLessons,
      completedLessons: [],
      lessonsCompleted: 0,
      chemistryLabVisited: false,
      score: 0,
    },
    socialStudies: {
      sections: { history: [], geography: [] },
      sectionTotals: BLUEPRINT.socialStudies.sections,
      lessonsCompleted: 0,
      score: 0,
    },
  };
}

function legacyCountToArray(count: unknown, max: number): number[] {
  const safe = Math.min(Math.max(Number(count) || 0, 0), max);
  return Array.from({ length: safe }, (_, i) => i + 1);
}

function normalizeLinearProgress(
  progress: Partial<StudentProgress['english']> | undefined,
  totalLessons: number,
  includeLabFlag = false,
): StudentProgress['english'] | StudentProgress['science'] {
  let completedLessons = Array.isArray(progress?.completedLessons)
    ? progress!.completedLessons
    : legacyCountToArray(progress?.lessonsCompleted, totalLessons);

  completedLessons = [...new Set(
    completedLessons
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= totalLessons),
  )].sort((a, b) => a - b);

  const base = {
    totalLessons,
    completedLessons,
    lessonsCompleted: completedLessons.length,
    score: Number(progress?.score) || 0,
  };

  if (includeLabFlag) {
    return {
      ...base,
      chemistryLabVisited: Boolean((progress as StudentProgress['science'])?.chemistryLabVisited),
    } as StudentProgress['science'];
  }
  return base;
}

function normalizeSectionLessons(
  arr: unknown,
  legacy: unknown,
  total: number,
): number[] {
  const from = Array.isArray(arr) ? arr : legacyCountToArray(legacy, total);
  return [...new Set(
    from.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= total),
  )].sort((a, b) => a - b);
}

export function normalizeStudent(student: Partial<Student>): Student {
  const raw = (student.progress as unknown as Record<string, unknown>) || {};
  const rawSocial = (raw.socialStudies as Partial<StudentProgress['socialStudies']>) || {};

  const history = normalizeSectionLessons(
    rawSocial.sections?.history,
    rawSocial.lessonsCompleted,
    BLUEPRINT.socialStudies.sections.history,
  );
  const geography = normalizeSectionLessons(
    rawSocial.sections?.geography,
    0,
    BLUEPRINT.socialStudies.sections.geography,
  );

  const name = student.name || 'Student';
  const initial = encodeURIComponent((name.charAt(0) || 'S').toUpperCase());

  return {
    id: student.id!,
    name,
    email: student.email || '',
    password: student.password || '',
    picture: student.picture || `https://via.placeholder.com/150/667eea/ffffff?text=${initial}`,
    createdAt: student.createdAt,
    progress: {
      english: normalizeLinearProgress(
        raw.english as Partial<StudentProgress['english']>,
        BLUEPRINT.english.totalLessons,
        false,
      ) as StudentProgress['english'],
      science: normalizeLinearProgress(
        raw.science as Partial<StudentProgress['science']>,
        BLUEPRINT.science.totalLessons,
        true,
      ) as StudentProgress['science'],
      socialStudies: {
        sections: { history, geography },
        sectionTotals: BLUEPRINT.socialStudies.sections,
        lessonsCompleted: history.length + geography.length,
        score: Number(rawSocial.score) || 0,
      },
    },
    games: {
      hangman: {
        gamesPlayed: student.games?.hangman?.gamesPlayed || 0,
        bestScore: student.games?.hangman?.bestScore || 0,
      },
      spellingBee: {
        gamesPlayed: student.games?.spellingBee?.gamesPlayed || 0,
        bestScore: student.games?.spellingBee?.bestScore || 0,
      },
    },
  };
}

export function sanitizeStudent(student: Student): Omit<Student, 'password'> {
  const { password: _pw, ...rest } = student;
  return rest;
}

// ── Raw storage helpers ──────────────────────────────────────────────────────

function getRawStudents(): Partial<Student>[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    safeSetItem(STORAGE_KEY, '[]');
    return [];
  }
}

function getSessions(): Session[] {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    safeSetItem(SESSIONS_KEY, '[]');
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function initDB(): void {
  if (typeof window === 'undefined') return;
  if (!localStorage.getItem(STORAGE_KEY)) safeSetItem(STORAGE_KEY, '[]');
  if (!localStorage.getItem(SESSIONS_KEY)) safeSetItem(SESSIONS_KEY, '[]');

  const raw = getRawStudents().filter((s) => s && typeof s === 'object');
  safeSetItem(STORAGE_KEY, JSON.stringify(raw.map(normalizeStudent)));
}

export function getAllStudents(): Student[] {
  return getRawStudents().map(normalizeStudent);
}

export function getStudentById(id: string): Student | null {
  const s = getRawStudents().find((s) => s.id === id);
  return s ? normalizeStudent(s) : null;
}

export function getStudentByEmail(email: string): Student | null {
  const s = getRawStudents().find((s) => s.email === email);
  return s ? normalizeStudent(s) : null;
}

export function createStudent(data: {
  id: string;
  name: string;
  email: string;
  password: string;
  picture?: string;
}): Student {
  const students = getRawStudents();
  if (students.find((s) => s.id === data.id)) throw new Error('Student ID already exists');
  if (students.find((s) => s.email === data.email)) throw new Error('Email already registered');

  const initial = encodeURIComponent((data.name.charAt(0) || 'S').toUpperCase());
  const student: Student = {
    id: data.id,
    name: data.name,
    email: data.email,
    password: hashPassword(data.password),
    picture: data.picture || `https://via.placeholder.com/150/667eea/ffffff?text=${initial}`,
    createdAt: new Date().toISOString(),
    progress: createDefaultProgress(),
    games: {
      hangman: { gamesPlayed: 0, bestScore: 0 },
      spellingBee: { gamesPlayed: 0, bestScore: 0 },
    },
  };

  students.push(student);
  if (!safeSetItem(STORAGE_KEY, JSON.stringify(students))) {
    students.pop();
    throw new Error('Could not save account: browser storage is full or unavailable.');
  }
  return normalizeStudent(student);
}

export function authenticateStudent(
  studentId: string,
  password: string,
): { success: boolean; student?: ReturnType<typeof sanitizeStudent>; error?: string } {
  const student = getStudentById(studentId);
  if (!student) return { success: false, error: 'Student ID not found' };
  if (student.password !== hashPassword(password)) return { success: false, error: 'Incorrect password' };
  return { success: true, student: sanitizeStudent(student) };
}

export function updateStudent(studentId: string, updates: Partial<Student>): Student {
  const students = getRawStudents();
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx === -1) throw new Error('Student not found');

  Object.keys(updates).forEach((key) => {
    if (key !== 'password' && key !== 'id') {
      (students[idx] as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key];
    }
  });

  const normalized = normalizeStudent(students[idx]);
  students[idx] = normalized;
  if (!safeSetItem(STORAGE_KEY, JSON.stringify(students))) throw new Error('Could not save changes.');
  return normalized;
}

export function markLessonComplete(
  studentId: string,
  subject: string,
  lessonNumber: number,
  section: string | null = null,
): StudentProgress | null {
  const student = getStudentById(studentId);
  if (!student) return null;

  const progress = deepClone(student.progress) as StudentProgress;

  if (subject === 'english' || subject === 'science') {
    const sub = progress[subject] as StudentProgress['english'];
    if (lessonNumber < 1 || lessonNumber > sub.totalLessons) throw new Error('Invalid lesson number');
    if (!sub.completedLessons.includes(lessonNumber)) {
      sub.completedLessons.push(lessonNumber);
      sub.completedLessons.sort((a, b) => a - b);
      sub.lessonsCompleted = sub.completedLessons.length;
    }
  } else if (subject === 'socialStudies') {
    if (!section || !['history', 'geography'].includes(section)) throw new Error('Invalid section');
    const ss = progress.socialStudies;
    const total = ss.sectionTotals[section as 'history' | 'geography'];
    if (lessonNumber < 1 || lessonNumber > total) throw new Error('Invalid lesson number');
    if (!ss.sections[section as 'history' | 'geography'].includes(lessonNumber)) {
      ss.sections[section as 'history' | 'geography'].push(lessonNumber);
      ss.sections[section as 'history' | 'geography'].sort((a, b) => a - b);
      ss.lessonsCompleted = ss.sections.history.length + ss.sections.geography.length;
    }
  }

  updateStudent(studentId, { progress });
  return getStudentById(studentId)!.progress;
}

export function updateStudentPhoto(studentId: string, photoDataUrl: string): Student {
  return updateStudent(studentId, { picture: photoDataUrl });
}

export function setChemistryLabVisited(studentId: string): StudentProgress['science'] | null {
  const student = getStudentById(studentId);
  if (!student) return null;
  const progress = deepClone(student.progress) as StudentProgress;
  progress.science.chemistryLabVisited = true;
  updateStudent(studentId, { progress });
  return getStudentById(studentId)!.progress.science;
}

export function updateGameScore(studentId: string, game: 'hangman' | 'spellingBee', score: number): StudentGames | null {
  const student = getStudentById(studentId);
  if (!student) return null;
  const games = deepClone(student.games) as StudentGames;
  games[game].gamesPlayed += 1;
  if (score > games[game].bestScore) games[game].bestScore = score;
  updateStudent(studentId, { games });
  return getStudentById(studentId)!.games;
}

export function createSession(studentId: string): Session {
  const sessions = getSessions();
  const session: Session = {
    studentId,
    token: generateToken(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  sessions.push(session);
  if (!safeSetItem(SESSIONS_KEY, JSON.stringify(sessions))) throw new Error('Could not create session.');
  return session;
}

export function getSession(token: string): Session | null {
  const session = getSessions().find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    deleteSession(token);
    return null;
  }
  return session;
}

export function deleteSession(token: string): void {
  const sessions = getSessions().filter((s) => s.token !== token);
  safeSetItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function exportData() {
  return { students: getAllStudents(), sessions: getSessions(), exportDate: new Date().toISOString() };
}
