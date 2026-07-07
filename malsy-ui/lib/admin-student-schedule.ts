import type { StudentProgressItem, StudentSession } from './admin-api';

/** Match progress/eval rows to a schedule lesson chapter id. */
export function progressForChapter(
  chapterId: string | null | undefined,
  progress: StudentProgressItem[],
): StudentProgressItem | undefined {
  if (!chapterId) return undefined;
  const direct = progress.find((p) => p.content_id === chapterId);
  if (direct) return direct;
  const short = chapterId.split(':').pop() ?? chapterId;
  return progress.find(
    (p) => p.content_id === chapterId
      || p.content_id.endsWith(`:${short}`)
      || p.content_id.split(':').pop() === short,
  );
}

/** Client-side merge when API rows lack enriched fields (per-student only). */
export function enrichStudentSessions(
  sessions: StudentSession[],
  progress: StudentProgressItem[],
): StudentSession[] {
  return sessions.map((row) => {
    const match = progressForChapter(row.chapter_id, progress);
    const progressPercent = row.progress_percent ?? (
      match?.lesson_completed ? 100 : match ? 25 : row.progress_percent
    );
    const lastActivity = row.last_activity_at
      ?? row.completion_time
      ?? (match?.completion_date ?? null);

    let status = row.status;
    if (match?.lesson_completed && status !== 'completed') {
      status = 'completed';
    } else if (!match?.lesson_completed && match && status === 'not_started') {
      status = 'in_progress';
    }

    return {
      ...row,
      status,
      progress_percent: progressPercent ?? undefined,
      last_activity_at: lastActivity ?? undefined,
      quiz_score: row.quiz_score ?? match?.overall_score ?? null,
    };
  });
}

export function formatAdminSessionStatus(status: string): string {
  switch (status) {
    case 'attended': return 'Attended';
    case 'missed': return 'Missed';
    case 'completed': return 'Completed';
    case 'available': return 'Available';
    case 'locked': return 'Locked';
    case 'not_started': return 'Not started';
    case 'in_progress': return 'In progress';
    default: return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function adminStatusColor(status: string): string {
  switch (status) {
    case 'attended':
    case 'completed':
      return 'var(--mint)';
    case 'available':
    case 'in_progress':
      return 'var(--sky)';
    case 'missed':
      return 'var(--coral)';
    case 'locked':
    case 'not_started':
    default:
      return 'var(--g3)';
  }
}

export function formatLastActivity(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
