'use client';

import { useEffect, useRef } from 'react';
import { api } from './api';
import { apiWeekToSchedule, type DayName, type ScheduleSession } from './studentSchedule';

/** Refetch portal data when the student returns to the tab or window. */
export function useRefreshOnWindowFocus(onRefresh: () => void, enabled = true) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const run = () => {
      onRefreshRef.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };

    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}

/** Weekly lesson schedule from the same API as the Schedule page (published subjects only). */
export async function fetchFreshWeekSchedule(
  selectedDay?: DayName,
): Promise<Partial<Record<DayName, ScheduleSession[]>>> {
  const week = await api.dashboard.week(selectedDay);
  if (!Array.isArray(week)) return {};
  return apiWeekToSchedule(week);
}
