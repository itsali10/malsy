'use client';

/**
 * Lightweight daily learning-streak tracker (client-side, localStorage).
 *
 * - A streak counts consecutive calendar days the student was active.
 * - Activity is recorded once per day; opening the app counts as activity.
 * - Missing a full day resets the streak back to 1 on the next active day.
 */

const KEY_PREFIX = 'malsy_streak';

/** Per-account storage key so switching accounts keeps separate streaks. */
function keyFor(userId?: string | null): string {
  return userId ? `${KEY_PREFIX}_${userId}` : `${KEY_PREFIX}_guest`;
}

interface StreakData {
  lastActiveDate: string; // YYYY-MM-DD (local)
  count: number;
}

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(userId?: string | null): StreakData | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return raw ? (JSON.parse(raw) as StreakData) : null;
  } catch {
    return null;
  }
}

function write(userId: string | null | undefined, data: StreakData) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(data));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Record activity for today and return the up-to-date streak count. */
export function recordStreakActivity(userId?: string | null): number {
  if (typeof window === 'undefined') return 0;
  const today = localDate(0);
  const yesterday = localDate(-1);
  const data = read(userId);

  if (!data) {
    write(userId, { lastActiveDate: today, count: 1 });
    return 1;
  }
  if (data.lastActiveDate === today) {
    return data.count; // already counted today
  }
  const count = data.lastActiveDate === yesterday ? data.count + 1 : 1;
  write(userId, { lastActiveDate: today, count });
  return count;
}

/** Read the current streak without recording new activity. */
export function getStreak(userId?: string | null): number {
  if (typeof window === 'undefined') return 0;
  const data = read(userId);
  if (!data) return 0;
  const today = localDate(0);
  const yesterday = localDate(-1);
  // Streak is still alive if the last active day was today or yesterday.
  if (data.lastActiveDate === today || data.lastActiveDate === yesterday) {
    return data.count;
  }
  return 0;
}
