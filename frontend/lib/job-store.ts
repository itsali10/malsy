/**
 * In-memory job store shared across all API route handlers.
 * Persists for the lifetime of the Next.js server process.
 */

export interface JobState {
  status: 'generating' | 'completed' | 'failed';
  topic?: string;
  videoPath?: string | null;
  scriptPath?: string | null;
  script?: string | null;
  quiz?: unknown;
  lessonTitle?: string | null;
  error?: string | null;
  spaceVideos?: Record<string, string> | null;
  planetVideos?: Record<string, string> | null;
  planetVideoUrl?: string | null;
  planetId?: string | null;
  singlePlanet?: boolean;
  progressStep?: number;
  progressTotal?: number;
  progressLabel?: string;
}

// Module-level Map — persists across route handler calls in a single server instance
const jobs = new Map<string, JobState>();

export function setJob(id: string, state: JobState): void {
  jobs.set(id, state);
}

export function updateJob(id: string, patch: Partial<JobState>): void {
  const cur = jobs.get(id) || ({} as JobState);
  jobs.set(id, { ...cur, ...patch });
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

export function hasJob(id: string): boolean {
  return jobs.has(id);
}
