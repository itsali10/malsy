'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchFreshWeekSchedule, useRefreshOnWindowFocus } from './studentPortalRefresh';
import type { DayName, ScheduleSession } from './studentSchedule';

/** Live weekly schedule — always reflects latest published subjects and lesson titles. */
export function useStudentWeekSchedule(
  refreshKey: string | number = 0,
  selectedDay?: DayName,
) {
  const [apiWeek, setApiWeek] = useState<Partial<Record<DayName, ScheduleSession[]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    return fetchFreshWeekSchedule(selectedDay)
      .then((mapped) => {
        setApiWeek(mapped);
        setError(null);
        return mapped;
      })
      .catch((err) => {
        console.warn('[portal] schedule fetch failed', err);
        setError(err);
        return null;
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedDay]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  useRefreshOnWindowFocus(refresh);

  return { apiWeek, loading, error, refresh };
}
