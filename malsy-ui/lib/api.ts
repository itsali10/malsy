const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('malsy_token');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────

export interface Token { access_token: string; token_type: string; }

export interface UserRead {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  grade_level?: number;
  account_status: string;
  last_login?: string;
  created_at: string;
}

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  date_of_birth?: string;
  grade_level?: number;
  phone_number?: string;
  parent_email?: string;
  parent_phone_number?: string;
}

export interface MySubjectRead {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  subject_type?: string;
  enrolled_sessions_count: number;
}

export interface ScheduleSessionRead {
  schedule_id: string;
  subject_id: string;
  subject: { subject_name: string; subject_code: string; subject_type?: string };
  day_of_week: string;
  start_time: string;
  end_time: string;
  location?: string;
  session_type: string;
  is_active: boolean;
}

export interface WeekDayRead {
  day_of_week: string;
  sessions: ScheduleSessionRead[];
}

export interface LessonEvaluationRead {
  evaluation_id: string;
  content_id: string;
  grammar_score?: number;
  comprehension_score?: number;
  pronunciation_score?: number;
  overall_score?: number;
  lesson_completed: boolean;
  completion_date?: string;
  created_at: string;
}

export interface EvaluationCreate {
  subject_id?: string;
  content_id: string;
  lesson_completed: boolean;
  completion_date?: string;
  grammar_score?: number;
  comprehension_score?: number;
  pronunciation_score?: number;
  overall_score?: number;
}

// AI session types
export interface Quiz {
  question: string;
  type?: string;
  options?: string[];
}

export interface SessionStartResponse {
  done: boolean;
  teacher_text?: string;
  quiz?: Quiz;
  next_action?: string;
  session_units?: unknown[];
  unit_part?: number;
  course_week?: number;
  course_month?: number;
  evaluation_summary?: unknown;
  auto_advanced_from?: string;
  error?: string;
  message?: string;
}

export interface SessionAnswerResponse {
  correct: boolean;
  evaluation?: { correct: boolean; score?: number; feedback?: string };
  hint?: string;
  hint_count?: number;
  remediation_text?: string;
  advance_text?: string;
  next_action?: string;
  quiz?: Quiz;
  unit_completed?: boolean;
  completed_unit_id?: string;
  evaluation_summary?: unknown;
  error?: string;
  message?: string;
}

export interface ContentUnit {
  unit_id: string;
  book_id?: string;
  title?: string;
  subject?: string;
  grade?: string | number;
}

// Lab types
export interface LabExperiment {
  experiment_id: string;
  title: string;
  description?: string;
  subject?: string;
  difficulty?: string;
  duration_minutes?: number;
  equipment?: string[];
  learning_objectives?: string[];
  is_active?: boolean;
}

export interface LabSession {
  session_id: string;
  experiment_id: string;
  experiment?: LabExperiment;
  session_status: string;
  safety_compliance?: boolean;
  expected_result_achieved?: boolean;
  final_score?: number;
  started_at?: string;
  completed_at?: string;
}

// ── API surface ───────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<Token>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (data: RegisterPayload) =>
      request<UserRead>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<UserRead>('/auth/me'),
  },

  dashboard: {
    subjects: () => request<MySubjectRead[]>('/dashboard/my-subjects'),
    week: () => request<WeekDayRead[]>('/dashboard/my-week'),
    nextSession: () => request<ScheduleSessionRead | null>('/dashboard/next-session'),
  },

  evaluations: {
    mine: () => request<LessonEvaluationRead[]>('/evaluations/me'),
    create: (data: EvaluationCreate) =>
      request<LessonEvaluationRead>('/evaluations', { method: 'POST', body: JSON.stringify(data) }),
  },

  // AI teacher session (single-student in-memory)
  session: {
    start: (studentId: string, chapterId: string) =>
      request<SessionStartResponse>('/session/start', {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId, chapter_id: chapterId }),
      }),
    answer: (studentId: string, studentAnswer: string) =>
      request<SessionAnswerResponse>('/session/answer', {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId, student_answer: studentAnswer }),
      }),
    continuePart2: (studentId: string) =>
      request<SessionStartResponse>('/session/continue_part2', {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId }),
      }),
    nextUnit: (studentId: string) =>
      request<SessionStartResponse>('/session/next_unit', {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId }),
      }),
  },

  // Available content units from Chroma
  units: {
    list: (bookId?: string) =>
      request<{ units: ContentUnit[] }>(`/units${bookId ? `?book_id=${bookId}` : ''}`),
  },

  // Virtual lab
  labs: {
    experiments: () => request<LabExperiment[]>('/labs/experiments'),
    mySessions: () => request<LabSession[]>('/labs/sessions/me'),
    startSession: (experimentId: string) =>
      request<LabSession>('/labs/sessions', {
        method: 'POST',
        body: JSON.stringify({ experiment_id: experimentId }),
      }),
    updateSession: (sessionId: string, data: {
      session_status?: string;
      safety_compliance?: boolean;
      expected_result_achieved?: boolean;
      final_score?: number;
    }) =>
      request<LabSession>(`/labs/sessions/${sessionId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  // Text-to-speech
  tts: {
    speak: (text: string, voiceId?: string) =>
      request<{ audio_url: string }>('/tts', {
        method: 'POST',
        body: JSON.stringify({ text, voice_id: voiceId }),
      }),
  },
};
