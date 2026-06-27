import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

export interface JobState {
  status: 'generating' | 'completed' | 'failed';
  topic?: string;
  videoPath?: string | null;
  videoUrl?: string | null;
  script?: string | null;
  lessonTitle?: string | null;
  error?: string | null;
}

const JOBS_DIR = path.join(process.cwd(), 'output', 'lesson-videos', 'jobs');

function ensureJobsDir(): void {
  if (!existsSync(JOBS_DIR)) {
    mkdirSync(JOBS_DIR, { recursive: true });
  }
}

function jobFile(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(JOBS_DIR, `${safe}.json`);
}

function readJob(id: string): JobState | undefined {
  const file = jobFile(id);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as JobState;
  } catch {
    return undefined;
  }
}

function writeJob(id: string, state: JobState): void {
  ensureJobsDir();
  writeFileSync(jobFile(id), JSON.stringify(state, null, 2), 'utf8');
}

export function setJob(id: string, state: JobState): void {
  writeJob(id, state);
}

export function updateJob(id: string, patch: Partial<JobState>): void {
  const cur = readJob(id) ?? ({} as JobState);
  writeJob(id, { ...cur, ...patch });
}

export function getJob(id: string): JobState | undefined {
  return readJob(id);
}
