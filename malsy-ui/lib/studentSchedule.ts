/** Schedule helpers — API-driven; no hardcoded subject lists. */
import type { PortalSubject } from './studentPortalSubjects';
import type { LessonScheduleSessionRead, WeekDayRead } from './api';

export type DisplaySubject = string;

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
  lesson_id: string;
  subject: DisplaySubject;
  subject_key?: string;
  title: string;
  order_index: number;
  status: 'available' | 'locked' | 'completed';
}

export const WEEK_DAYS: DayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DEFAULT_META = { icon: '📖', color: 'var(--vl)', bg: 'rgba(91,33,245,.12)', code: 'SUB' };

export function getTodayName(): DayName {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' }) as DayName;
}

export function normalizeSubjectName(name: string): DisplaySubject {
  return (name || '').trim();
}

export function subjectRouteKey(nameOrKey: string): string {
  const raw = (nameOrKey || '').trim();
  if (!raw) return '';
  if (!raw.includes(' ') && raw === raw.toLowerCase()) return raw;
  return raw.toLowerCase().split(/\s+/)[0];
}

export function isSubjectUnlocked(
  subjectName: string,
  portalSubjects?: PortalSubject[],
): boolean {
  const key = subjectRouteKey(subjectName);
  const hit = portalSubjects?.find(
    (s) => s.subject_key === key || s.subject_name === subjectName,
  );
  if (!hit) return false;
  return Boolean(hit.scheduled_today);
}

export function getLockedMessage(): string {
  return 'Complete the previous session to unlock this lesson.';
}

function mapSessionStatus(raw: LessonScheduleSessionRead['status']): ScheduleSession['status'] {
  if (raw === 'available' || raw === 'completed') return raw;
  return 'locked';
}

export function apiWeekToSchedule(
  week: WeekDayRead[],
): Partial<Record<DayName, ScheduleSession[]>> {
  const out: Partial<Record<DayName, ScheduleSession[]>> = {};
  for (const day of week) {
    const dayName = day.day_of_week as DayName;
    out[dayName] = (day.sessions ?? []).map((s) => ({
      id: s.schedule_item_id,
      lesson_id: s.lesson_id,
      subject: normalizeSubjectName(s.subject_name),
      subject_key: s.subject_key || subjectRouteKey(s.subject_name),
      title: s.lesson_title || s.lesson_id,
      order_index: s.order_index,
      status: mapSessionStatus(s.status),
    }));
  }
  return out;
}

export function getSessionsForDayFromApi(
  dayName: DayName,
  apiWeek: Partial<Record<DayName, ScheduleSession[]>>,
): ScheduleSession[] {
  return apiWeek[dayName] ?? [];
}

export function getSubjectMeta(name: DisplaySubject, portalSubjects?: PortalSubject[]) {
  const key = subjectRouteKey(String(name));
  const hit = portalSubjects?.find((s) => s.subject_key === key);
  if (hit?.icon) {
    return { ...DEFAULT_META, icon: hit.icon, code: hit.subject_code || DEFAULT_META.code };
  }
  return DEFAULT_META;
}

export function routeForSubject(subject: DisplaySubject, portalSubjects?: PortalSubject[]): string {
  const key = subjectRouteKey(String(subject));
  const hit = portalSubjects?.find((s) => s.subject_key === key);
  return hit?.route || `/lessons/subject/${key}`;
}

export function routeForSession(session: ScheduleSession, portalSubjects?: PortalSubject[]): string {
  const base = routeForSubject(session.subject, portalSubjects);
  if (!session.lesson_id) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}lesson=${encodeURIComponent(session.lesson_id)}`;
}

/** @deprecated use portal subjects directly — kept for gradual migration */
export function filterAppSubjects<T extends { subject_name: string }>(items: T[]): T[] {
  return [...items];
}

export function getWeeklySessionCount(apiWeek?: Partial<Record<DayName, ScheduleSession[]>>): number {
  if (!apiWeek) return 0;
  return Object.values(apiWeek).flat().length;
}

export function enrolledSubjectNames(items: { subject_name: string }[]): string[] {
  return items.map((s) => normalizeSubjectName(s.subject_name));
}

/** @deprecated static schedule removed */
export function getTodaySubjects(_portalSubjects?: PortalSubject[]): string[] {
  return [];
}

export function getTodaySchedule(): ScheduleSession[] {
  return [];
}

export function getScheduleForDay(_dayName: DayName): ScheduleSession[] {
  return [];
}

export function getSessionsForDay(_dayName: DayName): ScheduleSession[] {
  return [];
}

export function getAllSubjects(_portalSubjects?: PortalSubject[]): string[] {
  return [];
}
