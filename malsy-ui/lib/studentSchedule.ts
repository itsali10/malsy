/** Core subjects in the app — swap weeklySchedule for DB/Firebase later. */
export type SubjectName = 'English' | 'Science' | 'History';

export type DayName =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface ScheduleSession {
  id: string;
  subject: SubjectName;
  time: string;
  title: string;
  status: 'available' | 'locked' | 'completed';
}

export const APP_SUBJECTS: SubjectName[] = ['English', 'Science', 'History'];

export const WEEK_DAYS: DayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const weeklySchedule: Record<DayName, ScheduleSession[]> = {
  Monday: [
    { id: 'mon-english', subject: 'English', time: '09:00 AM', title: 'English Lesson', status: 'available' },
    { id: 'mon-science', subject: 'Science', time: '11:00 AM', title: 'Science Lesson', status: 'available' },
  ],
  Tuesday: [
    { id: 'tue-history', subject: 'History', time: '09:00 AM', title: 'History Lesson', status: 'available' },
    { id: 'tue-english', subject: 'English', time: '11:00 AM', title: 'English Lesson', status: 'available' },
  ],
  Wednesday: [
    { id: 'wed-science', subject: 'Science', time: '09:00 AM', title: 'Science Lesson', status: 'available' },
    { id: 'wed-history', subject: 'History', time: '11:00 AM', title: 'History Lesson', status: 'available' },
  ],
  Thursday: [
    { id: 'thu-english', subject: 'English', time: '09:00 AM', title: 'English Lesson', status: 'available' },
    { id: 'thu-science', subject: 'Science', time: '11:00 AM', title: 'Science Lesson', status: 'available' },
  ],
  Friday: [
    { id: 'fri-history', subject: 'History', time: '09:00 AM', title: 'History Lesson', status: 'available' },
    { id: 'fri-english', subject: 'English', time: '11:00 AM', title: 'English Lesson', status: 'available' },
  ],
  Saturday: [
    { id: 'sat-science', subject: 'Science', time: '09:00 AM', title: 'Science Lesson', status: 'available' },
    { id: 'sat-history', subject: 'History', time: '11:00 AM', title: 'History Lesson', status: 'available' },
  ],
  Sunday: [
    { id: 'sun-english', subject: 'English', time: '09:00 AM', title: 'English Lesson', status: 'available' },
    { id: 'sun-history', subject: 'History', time: '11:00 AM', title: 'History Lesson', status: 'available' },
  ],
};

export const SUBJECT_META: Record<string, { icon: string; color: string; bg: string; code: string }> = {
  english: { icon: '📚', color: 'var(--sky)', bg: 'rgba(78,171,255,.12)', code: 'ENG' },
  science: { icon: '🔬', color: 'var(--mint)', bg: 'rgba(0,229,160,.10)', code: 'SCI' },
  history: { icon: '🏛️', color: 'var(--amber)', bg: 'rgba(255,184,48,.12)', code: 'HIS' },
};

export function getTodayName(): DayName {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' }) as DayName;
}

export function getTodaySchedule(): ScheduleSession[] {
  return weeklySchedule[getTodayName()] ?? [];
}

export function getTodaySubjects(): SubjectName[] {
  return getTodaySchedule().map((session) => session.subject);
}

export function getScheduleForDay(dayName: DayName): ScheduleSession[] {
  return weeklySchedule[dayName] ?? [];
}

export function getSessionsForDay(dayName: DayName): ScheduleSession[] {
  const isToday = dayName === getTodayName();
  return getScheduleForDay(dayName).map((session) => ({
    ...session,
    status: isToday ? 'available' : 'locked',
  }));
}

export function normalizeSubjectName(name: string): SubjectName | null {
  const key = name.trim().split(/\s+/)[0]?.toLowerCase();
  if (key === 'english') return 'English';
  if (key === 'science') return 'Science';
  if (key === 'history') return 'History';
  return null;
}

export function isSubjectUnlocked(subjectName: string): boolean {
  const normalized = normalizeSubjectName(subjectName);
  if (!normalized) return false;
  return getTodaySchedule().some((session) => session.subject === normalized);
}

export function getLockedMessage(_subjectName?: string): string {
  return 'This subject is not on your schedule today.';
}

export function getAllSubjects(): SubjectName[] {
  return [...APP_SUBJECTS];
}

export function getWeeklySessionCount(): number {
  return Object.values(weeklySchedule).flat().length;
}

export function getSubjectMeta(name: SubjectName | string) {
  const key = name.toLowerCase().split(/\s+/)[0];
  return SUBJECT_META[key] ?? { icon: '📖', color: 'var(--vl)', bg: 'rgba(91,33,245,.12)', code: 'GEN' };
}

export function routeForSubject(subject: SubjectName): string {
  switch (subject) {
    case 'English':
      return '/lessons/subject/english';
    case 'Science':
      return '/lessons/subject/science';
    case 'History':
      return '/lessons/subject/history';
  }
}

/** Keep only English, Science, History — in schedule order when possible. */
export function filterAppSubjects<T extends { subject_name: string }>(items: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const norm = normalizeSubjectName(item.subject_name);
    if (norm) byKey.set(norm.toLowerCase(), item);
  }
  return APP_SUBJECTS.map((name) => byKey.get(name.toLowerCase())).filter(Boolean) as T[];
}
