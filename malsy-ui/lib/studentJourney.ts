import type { ContinueLearningSubjectRead } from './api';
import {
  type DayName,
  type ScheduleSession,
  getTodayName,
  subjectRouteKey,
} from './studentSchedule';

export type JourneyStatus = 'upcoming' | 'current' | 'completed' | 'locked';

export interface JourneyItem {
  id: string;
  subject: string;
  subjectKey: string;
  lessonTitle: string;
  sectionTitle: string;
  timeLabel: string;
  status: JourneyStatus;
  orderIndex: number;
  lessonId: string;
  actionHref: string | null;
  actionLabel: string | null;
}

export interface EnrollmentSlot {
  day_of_week: string;
  start_time: string;
  end_time: string;
  subject_name: string;
}

function formatClockTime(raw: string): string {
  const part = (raw || '').slice(0, 5);
  if (!part.includes(':')) return raw;
  const [h, m] = part.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return part;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function buildEnrollmentTimeMap(
  enrollments: EnrollmentSlot[],
  dayName: DayName = getTodayName(),
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of enrollments) {
    if (row.day_of_week !== dayName) continue;
    const key = subjectRouteKey(row.subject_name);
    const label = `${formatClockTime(row.start_time)} – ${formatClockTime(row.end_time)}`;
    map.set(key, label);
  }
  return map;
}

function journeyStatus(
  session: ScheduleSession,
  index: number,
  sessions: ScheduleSession[],
  primaryChapterId?: string | null,
): JourneyStatus {
  if (session.status === 'completed') return 'completed';
  if (session.status === 'locked') return 'locked';
  const firstAvailable = sessions.findIndex((s) => s.status === 'available');
  if (session.lesson_id === primaryChapterId || index === firstAvailable) {
    return 'current';
  }
  return 'upcoming';
}

function statusLabel(status: JourneyStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'current':
      return 'Current';
    case 'upcoming':
      return 'Upcoming';
    default:
      return 'Locked';
  }
}

export { statusLabel as journeyStatusLabel };

export function buildTodaysJourneyItems(
  sessions: ScheduleSession[],
  resumeByKey: Record<string, ContinueLearningSubjectRead>,
  timeBySubject: Map<string, string>,
  buildHref: (resume: ContinueLearningSubjectRead) => string | null,
  actionLabelFor: (resume: ContinueLearningSubjectRead) => string,
  primaryChapterId?: string | null,
): JourneyItem[] {
  const sorted = [...sessions].sort((a, b) => a.order_index - b.order_index);

  return sorted.map((session, index) => {
    const subjectKey = session.subject_key || subjectRouteKey(session.subject);
    const resume = resumeByKey[subjectKey];
    const status = journeyStatus(session, index, sorted, primaryChapterId);
    const canAct =
      (status === 'current' || status === 'upcoming') &&
      session.status === 'available' &&
      resume &&
      !resume.locked &&
      resume.continue_available;

    return {
      id: session.id,
      subject: session.subject,
      subjectKey,
      lessonTitle: session.title,
      sectionTitle: resume?.section_title || 'Reading',
      timeLabel: timeBySubject.get(subjectKey) || `Session ${index + 1}`,
      status,
      orderIndex: session.order_index,
      lessonId: session.lesson_id,
      actionHref: canAct && resume ? buildHref(resume) : null,
      actionLabel: canAct && resume ? actionLabelFor(resume) : null,
    };
  });
}
