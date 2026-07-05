const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const NETWORK_RETRY_MS = [400, 800, 1500, 2500];

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('malsy_token');
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return m === 'failed to fetch' || m.includes('network') || m.includes('load failed');
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { retries?: number } = {},
): Promise<T> {
  const maxAttempts = 1 + (opts.retries ?? 0);
  let lastErr: unknown;
  const isAuthRequest = path === '/auth/login' || path === '/auth/register';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const token = isAuthRequest ? null : getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((init.headers as Record<string, string>) ?? {}),
      };
      const res = await fetch(`${BASE}${path}`, { ...init, headers });
      if (res.status === 401) {
        if (!isAuthRequest && typeof window !== 'undefined') {
          localStorage.removeItem('malsy_token');
          localStorage.removeItem('malsy_user');
          if (!window.location.pathname.startsWith('/login')) {
            window.location.replace('/login?expired=1');
          }
        }
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        const detail = (body as { detail?: unknown }).detail;
        const msg = typeof detail === 'string'
          ? detail
          : isAuthRequest
            ? 'Login failed. Check your credentials.'
            : 'Your session has expired. Please sign in again.';
        throw new Error(msg);
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail ?? 'Request failed');
      }
      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      lastErr = err;
      if (!isNetworkFailure(err) || attempt >= maxAttempts - 1) break;
      await sleep(NETWORK_RETRY_MS[attempt] ?? 2500);
    }
  }

  if (lastErr instanceof Error && lastErr.message === 'Failed to fetch') {
    throw new Error('Could not connect to the server. Make sure the backend is running on port 8000.');
  }
  throw lastErr;
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
  date_of_birth: string;
  grade_level: number;
  phone_number: string;
  guardian_name: string;
  guardian_gender: string;
  guardian_email: string;
  guardian_phone_number: string;
}

export interface MySubjectRead {
  subject_id: string;
  subject_key?: string;
  subject_name: string;
  subject_code: string;
  subject_type?: string;
  enrolled_sessions_count?: number;
  available_lessons_count: number;
  icon?: string;
  grade?: number;
  primary_book_id?: string;
  route?: string;
  scheduled_today?: boolean;
}

export interface StudentPortalSubjectRead {
  subject_id: string;
  subject_key: string;
  subject_name: string;
  subject_code: string;
  subject_type?: string;
  icon: string;
  grade: number;
  primary_book_id?: string | null;
  route: string;
  enrolled_sessions_count?: number;
  available_lessons_count: number;
  scheduled_today: boolean;
  search_terms?: string[];
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

export interface EnrollmentRead {
  enrollment_id: string;
  schedule: ScheduleSessionRead;
  enrollment_status?: string;
}

export interface LessonScheduleSessionRead {
  schedule_item_id: string;
  lesson_id: string;
  lesson_title: string;
  subject_id: string;
  subject_name: string;
  subject_key: string;
  order_index: number;
  status: 'locked' | 'available' | 'completed' | 'missed';
  day_of_week: string;
}

export interface WeekDayRead {
  day_of_week: string;
  sessions: LessonScheduleSessionRead[];
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

// Pronunciation types
export interface PronunciationWordResult {
  word: string;
  ref: string[];
  got: string[];
  score: number;
}

export interface PronunciationResult {
  overall_score: number;
  words: PronunciationWordResult[];
}

// AI session types
export interface Quiz {
  question: string;
  type?: string;
  options?: string[];
  expected_points?: string[];
  listening_question_index?: number;
  listening_question_total?: number;
  explanation?: string;
  skill?: string;
}

export interface ListeningQuestion {
  id?: string;
  question?: string;
  options?: string[];
  skill?: string;
}

export interface ListeningActivity {
  unit_id?: string;
  title?: string;
  transcript?: string;
  narration_text?: string;
  questions?: ListeningQuestion[];
  word_count?: number;
}

export interface HistoryLessonCard {
  id: string;
  lessonNumber: number;
  unit_id: string;
  title: string;
  shortDescription: string;
  videoFilename?: string | null;
  videoType?: string | null;
  videoUrl?: string | null;
  metaJsonUrl?: string | null;
}

export interface HistoryLessonsResponse {
  book_id: string;
  subject: string;
  grade: number;
  unit: string;
  lessons: HistoryLessonCard[];
  validation: { valid: boolean; errors: string[] };
}

export interface BookLessonProgress {
  book_id: string;
  student_id: string;
  max_unlocked_lesson_index: number;
  completed_lesson_numbers: number[];
}

export interface LessonNavResponse {
  lesson: {
    chapter_id: string;
    book_id: string;
    title: string;
    description?: string;
    lesson_number?: number;
    part_count?: number;
    uses_language_sections?: boolean;
    source?: string;
  };
  next_lesson: {
    chapter: string;
    title: string;
    description: string;
  } | null;
}

export interface ContinueLearningSectionRead {
  index: number;
  key: string;
  title: string;
  completed: boolean;
  active: boolean;
}

export interface ContinueLearningSubjectRead {
  subject_id?: string;
  subject_key: string;
  subject_name: string;
  book_id?: string | null;
  unlocked: boolean;
  locked: boolean;
  chapter_id?: string | null;
  lesson_title?: string | null;
  lesson_number?: number | null;
  unit_part: number;
  section_title?: string | null;
  progress_percent: number;
  section_statuses?: ContinueLearningSectionRead[];
  updated_at?: string | null;
  continue_available: boolean;
  icon?: string | null;
  available_lessons_count?: number;
}

export interface ContinueLearningRead {
  student_id: string;
  subjects: ContinueLearningSubjectRead[];
  primary?: ContinueLearningSubjectRead | null;
}

export interface InteractiveImageCard {
  id?: string;
  tap_label: string;
  title: string;
  description?: string;
  labels: string[];
  image_url?: string | null;
}

export interface InteractiveImagesResponse {
  book_id: string;
  unit_id: string;
  lesson_title?: string;
  lesson_number?: number;
  images: InteractiveImageCard[];
}

export interface SessionStartResponse {
  done: boolean;
  teacher_text?: string;
  quiz?: Quiz;
  listening?: ListeningActivity;
  next_action?: string;
  session_units?: unknown[];
  unit_part?: number;
  max_unlocked_part?: number;
  course_week?: number;
  course_month?: number;
  evaluation_summary?: unknown;
  auto_advanced_from?: string;
  error?: string;
  need_restart?: boolean;
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
  teacher_text?: string;
  listening?: ListeningActivity;
  max_unlocked_part?: number;
  max_unlocked_lesson_index?: number;
  completed_lesson_numbers?: number[];
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
    login: (email: string, password: string) => {
      const payload = { email: email.trim(), password };
      console.info('[auth.login] endpoint:', `${BASE}/auth/login`);
      console.info('[auth.login] payload keys:', Object.keys(payload));
      console.info('[auth.login] role:', 'student');
      if (!payload.email || !payload.password) {
        return Promise.reject(new Error('Please enter your email and password.'));
      }
      return request<Token>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    register: (data: RegisterPayload) =>
      request<UserRead>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<UserRead>('/auth/me'),
  },

  dashboard: {
    subjects: () => request<MySubjectRead[]>('/dashboard/my-subjects'),
    week: () => request<WeekDayRead[]>('/dashboard/my-week'),
    nextSession: () => request<ScheduleSessionRead | null>('/dashboard/next-session'),
    continueLearning: () => request<ContinueLearningRead>('/dashboard/continue-learning'),
  },

  portal: {
    subjects: () => request<StudentPortalSubjectRead[]>('/portal/subjects'),
    search: (q: string) =>
      request<StudentPortalSubjectRead[]>(`/portal/search?q=${encodeURIComponent(q)}`),
  },

  evaluations: {
    mine: () => request<LessonEvaluationRead[]>('/evaluations/me'),
    create: (data: EvaluationCreate) =>
      request<LessonEvaluationRead>('/evaluations', { method: 'POST', body: JSON.stringify(data) }),
  },

  enrollments: {
    mine: () => request<EnrollmentRead[]>('/enrollments/me'),
  },

  // AI teacher session (single-student in-memory)
  session: {
    start: (studentId: string, chapterId: string, lessonTitle = '', lessonDescription = '') =>
      request<SessionStartResponse>(
        '/session/start',
        {
          method: 'POST',
          body: JSON.stringify({
            student_id: studentId,
            chapter_id: chapterId,
            lesson_title: lessonTitle,
            lesson_description: lessonDescription,
          }),
        },
        { retries: 4 },
      ),
    answer: (studentId: string, studentAnswer: string, optionIndex?: number, audioBase64?: string) =>
      request<SessionAnswerResponse>('/session/answer', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          student_answer: studentAnswer,
          option_index: optionIndex != null && optionIndex >= 0 ? optionIndex : undefined,
          audio_base64: audioBase64,
        }),
      }),
    continuePart2: (studentId: string) =>
      request<SessionStartResponse>('/session/continue_part2', {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId }),
      }),
    switchPart: (studentId: string, targetPart: number) =>
      request<SessionStartResponse>('/session/switch_part', {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId, target_part: targetPart }),
      }),
    nextUnit: (studentId: string) =>
      request<SessionStartResponse>('/session/next_unit', {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId }),
      }),
  },

  // Textbook lesson catalogs (History G6, etc.)
  books: {
    lessons: (bookId: string) =>
      request<HistoryLessonsResponse>(`/books/${bookId}/lessons`),
    lessonProgress: (bookId: string, studentId: string) =>
      request<BookLessonProgress>(
        `/books/${encodeURIComponent(bookId)}/lesson-progress?student_id=${encodeURIComponent(studentId)}`,
      ),
    lessonNav: (chapterId: string) =>
      request<LessonNavResponse>(`/books/lesson-nav/${encodeURIComponent(chapterId)}`),
  },

  lesson: {
    interactiveImagesSaved: async (unitId: string): Promise<InteractiveImagesResponse> => {
      const res = await fetch(`/api/interactive-images?unitId=${encodeURIComponent(unitId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Failed to load interactive images');
      }
      const data = await res.json() as InteractiveImagesResponse & { ready?: boolean };
      if (!data.ready) {
        return { book_id: '', unit_id: unitId, images: [] };
      }
      return {
        book_id: data.book_id ?? '',
        unit_id: data.unit_id ?? unitId,
        lesson_title: data.lesson_title,
        lesson_number: data.lesson_number,
        images: data.images ?? [],
      };
    },
    interactiveImages: async (unitId: string, teacherText: string, force = false): Promise<InteractiveImagesResponse> => {
      const res = await fetch('/api/interactive-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, teacherText, force }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Failed to generate interactive images');
      }
      const data = await res.json() as InteractiveImagesResponse;
      return {
        book_id: data.book_id ?? '',
        unit_id: data.unit_id ?? unitId,
        lesson_title: data.lesson_title,
        lesson_number: data.lesson_number,
        images: data.images ?? [],
      };
    },
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

  // Pronunciation scoring
  pronunciation: {
    score: (audioBase64: string, sentence: string) =>
      request<PronunciationResult>('/speech/pronunciation', {
        method: 'POST',
        body: JSON.stringify({ audio_base64: audioBase64, sentence }),
      }),
  },

  // Text-to-speech
  tts: {
    speak: (text: string, voiceId?: string, format = 'wav') =>
      request<{ audio_url: string }>('/tts', {
        method: 'POST',
        body: JSON.stringify({ text, voice_id: voiceId, format }),
      }),
  },
};
