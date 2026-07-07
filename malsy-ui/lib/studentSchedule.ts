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
  lock_reason?: string | null;
  action_label?: string | null;
  unit_part?: number;
  continue_available?: boolean;
  start_time?: string | null;
  end_time?: string | null;
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

/** Subjects returned by the portal API are already published + student-visible. */
export function publishedSubjectsForLessons<T extends { subject_name: string }>(items: T[]): T[] {
  return [...items];
}

export function isSubjectUnlocked(
  subjectName: string,
  portalSubjects?: PortalSubject[],
  subjectRow?: { scheduled_today?: boolean },
): boolean {
  if (subjectRow && typeof subjectRow.scheduled_today === 'boolean') {
    return true;
  }
  const key = subjectRouteKey(subjectName);
  const hit = portalSubjects?.find(
    (s) => s.subject_key === key || s.subject_name === subjectName,
  );
  if (!hit) return false;
  return Boolean(hit.scheduled_today);
}

export function getLockedMessage(reason?: string | null): string {
  return reason?.trim() || 'Finish the previous lesson to unlock today\'s lesson.';
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
      lock_reason: s.lock_reason,
      action_label: s.action_label,
      unit_part: s.unit_part,
      continue_available: s.continue_available,
      start_time: s.start_time,
      end_time: s.end_time,
    }));
  }
  return out;
}

/** Learn-page URL for an available scheduled lesson (same content as Continue Learning). */
export function learnHrefForSession(session: ScheduleSession): string | null {
  if (session.status !== 'available' && session.status !== 'completed') return null;
  if (!session.lesson_id || !session.lesson_id.includes('unit_')) return null;
  const params = new URLSearchParams({ chapter: session.lesson_id });
  if (session.lesson_id.includes(':unit_') && session.title && !isScheduleSessionLabel(session.title)) {
    params.set('lesson_title', session.title);
  }
  if (session.unit_part != null && session.unit_part >= 0) {
    params.set('unit_part', String(session.unit_part));
  }
  return `/lessons/learn?${params.toString()}`;
}

export function formatSessionTimeRange(start?: string | null, end?: string | null): string | undefined {
  if (!start) return undefined;
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h)) return t;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m ?? 0).padStart(2, '0')} ${ampm}`;
  };
  if (end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start);
}

const SCHEDULE_SESSION_LABELS = new Set([
  'comprehension', 'grammar', 'listening', 'pronunciation',
  'theoretical', 'practical', 'videos',
]);

function isScheduleSessionLabel(title: string): boolean {
  return SCHEDULE_SESSION_LABELS.has(title.trim().toLowerCase());
}

export function displayStatusLabel(session: ScheduleSession): string {
  if (session.status === 'locked') {
    return session.lock_reason?.trim() || 'Locked';
  }
  if (session.action_label) {
    return session.action_label;
  }
  switch (session.status) {
    case 'available':
      return 'Available';
    case 'completed':
      return 'Completed';
    default:
      return 'Locked';
  }
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

