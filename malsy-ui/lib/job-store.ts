export interface JobState {
  status: 'generating' | 'completed' | 'failed';
  topic?: string;
  videoPath?: string | null;
  script?: string | null;
  lessonTitle?: string | null;
  error?: string | null;
}

// Module-level Map — persists for the lifetime of the Next.js server process
const jobs = new Map<string, JobState>();

export function setJob(id: string, state: JobState): void {
  jobs.set(id, state);
}

export function updateJob(id: string, patch: Partial<JobState>): void {
  const cur = jobs.get(id) ?? ({} as JobState);
  jobs.set(id, { ...cur, ...patch });
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}
