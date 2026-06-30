'use client';

import type { ScheduleSessionRead } from './api';

export interface AppNotification {
  id: string;
  icon: string;
  title: string;
  body: string;
}

const READ_PREFIX = 'malsy_notif_read';

function readKey(userId?: string | null): string {
  return userId ? `${READ_PREFIX}_${userId}` : `${READ_PREFIX}_guest`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ids the user has already seen (per account). */
export function getReadIds(userId?: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(readKey(userId));
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Mark the given notification ids as read for this account. */
export function markRead(userId: string | null | undefined, ids: string[]) {
  if (typeof window === 'undefined') return;
  const set = getReadIds(userId);
  ids.forEach(id => set.add(id));
  try {
    localStorage.setItem(readKey(userId), JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function fmtTime(t?: string): string {
  if (!t) return '';
  return t.slice(0, 5);
}

/**
 * Build the current set of in-app notifications from the student's live data.
 * Ids are date-stamped so daily reminders reappear each day.
 */
export function buildNotifications(opts: {
  streak: number;
  nextSession: ScheduleSessionRead | null;
}): AppNotification[] {
  const today = todayStr();
  const list: AppNotification[] = [];

  if (opts.nextSession) {
    const s = opts.nextSession;
    const name = s.subject?.subject_name ?? 'your next class';
    const when = fmtTime(s.start_time);
    list.push({
      id: `nextclass-${s.schedule_id}-${today}`,
      icon: '📅',
      title: 'Upcoming class',
      body: `${name} — ${s.session_type}${when ? ` at ${when}` : ''}${s.location ? ` · ${s.location}` : ''}.`,
    });
  }

  if (opts.streak > 0) {
    list.push({
      id: `streak-${opts.streak}-${today}`,
      icon: '🔥',
      title: `${opts.streak}-day streak!`,
      body: `You've studied ${opts.streak} day${opts.streak !== 1 ? 's' : ''} in a row. Keep it going today!`,
    });
  } else {
    list.push({
      id: `streak-start-${today}`,
      icon: '🔥',
      title: 'Start a new streak',
      body: 'Complete a lesson today to begin a learning streak.',
    });
  }

  list.push({
    id: `challenge-${today}`,
    icon: '⚡',
    title: "Today's challenge is ready",
    body: 'Beat the daily challenge to earn bonus XP.',
  });

  return list;
}
