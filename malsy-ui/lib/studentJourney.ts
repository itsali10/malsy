import type { ContinueLearningSubjectRead } from './api';
import {
  type DayName,
  type ScheduleSession,
  getTodayName,
  subjectRouteKey,
  learnHrefForSession,
} from './studentSchedule';

export type JourneyStatus = 'upcoming' | 'current' | 'completed' | 'locked';

export type JourneyActionStatus = 'Start' | 'Continue' | 'Completed' | 'Locked';

export interface JourneyItem {
  id: string;
  subject: string;
  subjectKey: string;
  lessonTitle: string;
  sectionTitle: string;
  timeLabel: string;
  status: JourneyStatus;
  actionStatus: JourneyActionStatus;
  orderIndex: number;
  lessonId: string;
  actionHref: string | null;
  actionLabel: string | null;
  encouragement: string | null;
  progressPercent: number;
  lockReason?: string | null;
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

function actionStatusFor(
  session: ScheduleSession,
  journey: JourneyStatus,
): JourneyActionStatus {
  if (journey === 'completed' || session.status === 'completed') return 'Completed';
  if (journey === 'locked' || session.status === 'locked') return 'Locked';
  const label = (session.action_label || '').toLowerCase();
  if (session.continue_available || label.includes('continue')) return 'Continue';
  return 'Start';
}

function encouragementFor(actionStatus: JourneyActionStatus): string | null {
  switch (actionStatus) {
    case 'Completed':
      return 'Great job, completed!';
    case 'Start':
      return 'Start with this lesson';
    case 'Continue':
      return 'Pick up where you left off';
    default:
      return null;
  }
}

function sectionTitleFor(
  session: ScheduleSession,
  resume?: ContinueLearningSubjectRead,
): string {
  if (resume?.chapter_id === session.lesson_id && resume.section_title) {
    return resume.section_title;
  }
  if (session.status === 'completed') return 'Lesson complete';
  return 'Reading';
}

export function journeyStatusLabel(status: JourneyStatus): string {
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

export function journeyStatusDisplay(item: JourneyItem): string {
  return item.actionStatus;
}

export function buildTodaysJourneyItems(
  sessions: ScheduleSession[],
  resumeByKey: Record<string, ContinueLearningSubjectRead>,
  timeBySubject: Map<string, string>,
  primaryChapterId?: string | null,
): JourneyItem[] {
  const sorted = [...sessions].sort((a, b) => a.order_index - b.order_index);

  return sorted.map((session, index) => {
    const subjectKey = session.subject_key || subjectRouteKey(session.subject);
    const resume = resumeByKey[subjectKey];
    const status = journeyStatus(session, index, sorted, primaryChapterId);
    const learnHref = learnHrefForSession(session);
    const canAct = session.status === 'available' && Boolean(learnHref);
    const actionStatus = actionStatusFor(session, status);
    const actionLabel =
      actionStatus === 'Start'
        ? 'Start'
        : actionStatus === 'Continue'
          ? 'Continue'
          : null;

    const progressPercent =
      resume?.chapter_id === session.lesson_id
        ? resume.progress_percent ?? 0
        : session.status === 'completed'
          ? 100
          : 0;

    return {
      id: session.id,
      subject: session.subject,
      subjectKey,
      lessonTitle: session.title,
      sectionTitle: sectionTitleFor(session, resume),
      timeLabel: timeBySubject.get(subjectKey) || `Session ${index + 1}`,
      status,
      actionStatus,
      orderIndex: session.order_index,
      lessonId: session.lesson_id,
      actionHref: canAct ? learnHref : null,
      actionLabel: canAct ? actionLabel : null,
      encouragement: encouragementFor(actionStatus),
      progressPercent,
      lockReason: session.lock_reason,
    };
  });
}
