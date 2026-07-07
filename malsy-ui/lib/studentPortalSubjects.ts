/**
 * Single source of truth for student portal subjects (API-backed).
 * Always refetches from GET /portal/subjects so admin publish/hide changes appear promptly.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, StudentPortalSubjectRead } from './api';
import { useRefreshOnWindowFocus } from './studentPortalRefresh';

export type PortalSubject = StudentPortalSubjectRead;

let cachedSubjects: PortalSubject[] | null = null;
let cachePromise: Promise<PortalSubject[]> | null = null;

export async function loadPortalSubjects(force = false): Promise<PortalSubject[]> {
  if (!force && cachedSubjects) return cachedSubjects;
  if (cachePromise) return cachePromise;

  cachePromise = api.portal
    .subjects()
    .then((rows) => {
      const next = Array.isArray(rows) ? rows : [];
      cachedSubjects = next;
      if (typeof window !== 'undefined') {
        console.info('[portal] fetched subjects', next.map((s) => ({
          key: s.subject_key,
          name: s.subject_name,
          code: s.subject_code,
          lessons: s.available_lessons_count,
        })));
      }
      return next;
    })
    .catch((err) => {
      console.warn('[portal] subject fetch failed — keeping previous cache', err);
      return cachedSubjects ?? [];
    })
    .finally(() => {
      cachePromise = null;
    });
  return cachePromise;
}

export function clearPortalSubjectsCache() {
  cachedSubjects = null;
  cachePromise = null;
}

export function usePortalSubjects(options?: { refreshOnFocus?: boolean }) {
  const refreshOnFocus = options?.refreshOnFocus ?? true;
  const [subjects, setSubjects] = useState<PortalSubject[]>(cachedSubjects ?? []);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    return loadPortalSubjects(true)
      .then((rows) => {
        setSubjects(rows);
        return rows;
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useRefreshOnWindowFocus(refresh, refreshOnFocus);

  return { subjects, loading, refresh };
}

export function routeForPortalSubject(subject: PortalSubject): string {
  return subject.route || `/lessons/subject/${subject.subject_key}`;
}

export function todaySubjectNames(subjects: PortalSubject[]): string[] {
  return subjects.filter((s) => s.scheduled_today).map((s) => s.subject_name);
}

export async function searchPortalSubjects(query: string): Promise<PortalSubject[]> {
  const q = query.trim();
  if (!q) return loadPortalSubjects(true);
  try {
    return await api.portal.search(q);
  } catch {
    const all = await loadPortalSubjects(true);
    const lower = q.toLowerCase();
    return all.filter(
      (s) =>
        s.subject_name.toLowerCase().includes(lower) ||
        s.subject_key.toLowerCase().includes(lower),
    );
  }
}
