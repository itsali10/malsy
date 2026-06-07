'use client';

/**
 * Shared FastAPI client for malsy-next.
 * Base URL: NEXT_PUBLIC_API_URL (default http://localhost:8000)
 * All calls degrade silently — if the backend is offline, functions return null.
 */

const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:8000';

const TOKEN_KEY = 'malsy_api_token';
const USER_KEY  = 'malsy_api_user';

// ── JWT helpers ────────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

export function isLoggedInToBackend(): boolean {
  return !!getToken();
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Authenticated fetch against the FastAPI backend.
 * Returns null (not throws) on network errors or if backend is unreachable.
 */
export async function apiFetch(
  path: string,
  opts: RequestInit = {}
): Promise<Response | null> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    return res;
  } catch {
    // Backend offline or network error — degrade silently
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  grade_level?: number | null;
  account_status: string;
  created_at: string;
  last_login?: string | null;
}

export interface ApiToken {
  access_token: string;
  token_type: string;
}

export interface ApiSubject {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  subject_type?: string | null;
}

export interface ApiSchedule {
  schedule_id: string;
  subject_id: string;
  subject: ApiSubject;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location?: string | null;
  session_type: string;
  is_active: boolean;
}

export interface ApiWeekDay {
  day_of_week: string;
  sessions: ApiSchedule[];
}

export interface ApiMySubject {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  subject_type?: string | null;
  enrolled_sessions_count: number;
}

export interface ApiEvaluation {
  evaluation_id: string;
  user_id: string;
  subject_id: string;
  content_id: string;
  grammar_score?: number | null;
  comprehension_score?: number | null;
  pronunciation_score?: number | null;
  overall_score?: number | null;
  number_of_attempts?: number | null;
  feedback?: string | null;
  lesson_completed: boolean;
  completion_date?: string | null;
  created_at: string;
}

export interface ApiLabExperiment {
  experiment_id: string;
  subject_id: string;
  subject: ApiSubject;
  content_id: string;
  experiment_name: string;
  difficulty_level?: string | null;
  lab_scene_id?: string | null;
}

export interface ApiLabSession {
  session_id: string;
  user_id: string;
  experiment_id: string;
  experiment: ApiLabExperiment;
  start_time: string;
  end_time?: string | null;
  session_status: string;
  observation_accuracy?: number | null;
  procedure_completion?: number | null;
  safety_compliance?: boolean | null;
  expected_result_achieved?: boolean | null;
  final_score?: number | null;
  number_of_attempts?: number | null;
  feedback?: string | null;
}

export interface ApiSessionStartResponse {
  done?: boolean;
  message?: string;
  error?: string;
  chapter_id?: string;
  teacher_text?: string;
  quiz?: { question: string; options: string[]; correct_index?: number } | null;
  unit_part?: number;
  next_action?: string;
  evaluation_summary?: unknown;
}

export interface ApiSessionAnswerResponse {
  correct?: boolean;
  hint?: string;
  remediation?: string;
  unit_completed?: boolean;
  next_action?: string;
  teacher_text?: string;
  quiz?: { question: string; options: string[]; correct_index?: number } | null;
  evaluation?: unknown;
  error?: string;
}

// ── Auth endpoints ─────────────────────────────────────────────────────────────

export async function apiRegister(payload: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  grade_level?: number;
}): Promise<ApiUser | null> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res || !res.ok) return null;
  return res.json();
}

export async function apiLogin(email: string, password: string): Promise<string | null> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res || !res.ok) return null;
  const data: ApiToken = await res.json();
  if (data.access_token) {
    setToken(data.access_token);
    return data.access_token;
  }
  return null;
}

export async function apiGetMe(): Promise<ApiUser | null> {
  const res = await apiFetch('/auth/me');
  if (!res || !res.ok) return null;
  return res.json();
}

// ── Dashboard endpoints ────────────────────────────────────────────────────────

export async function apiDashboardNextSession(): Promise<ApiSchedule | null> {
  const res = await apiFetch('/dashboard/next-session');
  if (!res || !res.ok) return null;
  const data = await res.json();
  // API returns null JSON (200 + null) when no session today
  return data || null;
}

export async function apiDashboardMyWeek(): Promise<ApiWeekDay[] | null> {
  const res = await apiFetch('/dashboard/my-week');
  if (!res || !res.ok) return null;
  return res.json();
}

export async function apiDashboardMySubjects(): Promise<ApiMySubject[] | null> {
  const res = await apiFetch('/dashboard/my-subjects');
  if (!res || !res.ok) return null;
  return res.json();
}

// ── Evaluation endpoints ───────────────────────────────────────────────────────

export async function apiGetEvaluations(): Promise<ApiEvaluation[] | null> {
  const res = await apiFetch('/evaluations/me');
  if (!res || !res.ok) return null;
  return res.json();
}

export async function apiPostEvaluation(payload: {
  subject_id: string;
  content_id: string;
  overall_score?: number;
  grammar_score?: number;
  comprehension_score?: number;
  pronunciation_score?: number;
  lesson_completed?: boolean;
  completion_date?: string;
  number_of_attempts?: number;
  feedback?: string;
}): Promise<ApiEvaluation | null> {
  const res = await apiFetch('/evaluations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res || !res.ok) return null;
  return res.json();
}

// ── Lab endpoints ──────────────────────────────────────────────────────────────

export async function apiGetLabExperiments(): Promise<ApiLabExperiment[] | null> {
  const res = await apiFetch('/labs/experiments');
  if (!res || !res.ok) return null;
  return res.json();
}

export async function apiPostLabSession(experimentId: string): Promise<ApiLabSession | null> {
  const res = await apiFetch('/labs/sessions', {
    method: 'POST',
    body: JSON.stringify({ experiment_id: experimentId }),
  });
  if (!res || !res.ok) return null;
  return res.json();
}

export async function apiPutLabSession(
  sessionId: string,
  payload: {
    session_status?: string;
    observation_accuracy?: number;
    procedure_completion?: number;
    safety_compliance?: boolean;
    expected_result_achieved?: boolean;
    final_score?: number;
    number_of_attempts?: number;
    feedback?: string;
  }
): Promise<ApiLabSession | null> {
  const res = await apiFetch(`/labs/sessions/${sessionId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res || !res.ok) return null;
  return res.json();
}

export async function apiGetMyLabSessions(): Promise<ApiLabSession[] | null> {
  const res = await apiFetch('/labs/sessions/me');
  if (!res || !res.ok) return null;
  return res.json();
}

// ── AI session endpoints ───────────────────────────────────────────────────────

export async function apiSessionStart(
  studentId: string,
  chapterId: string
): Promise<ApiSessionStartResponse | null> {
  const res = await apiFetch('/session/start', {
    method: 'POST',
    body: JSON.stringify({ student_id: studentId, chapter_id: chapterId }),
  });
  if (!res) return null;
  return res.json();
}

export async function apiSessionAnswer(
  studentId: string,
  answer: string
): Promise<ApiSessionAnswerResponse | null> {
  const res = await apiFetch('/session/answer', {
    method: 'POST',
    body: JSON.stringify({ student_id: studentId, student_answer: answer }),
  });
  if (!res) return null;
  return res.json();
}

// ── TTS endpoint ───────────────────────────────────────────────────────────────

export async function apiTts(
  text: string,
  voiceId = 'alloy'
): Promise<{ audio_url: string } | null> {
  const res = await apiFetch('/tts', {
    method: 'POST',
    body: JSON.stringify({ text, voice_id: voiceId }),
  });
  if (!res || !res.ok) return null;
  return res.json();
}
