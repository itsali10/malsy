import { adminAuth } from './admin-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isLoginRequest = path === '/admin/login';
  const token = isLoginRequest ? null : adminAuth.getToken();
  const headers: Record<string, string> = {
    ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    if (!isLoginRequest) {
      adminAuth.clear();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin/login')) {
        window.location.replace('/admin/login?expired=1');
      }
    }
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = (body as { detail?: unknown }).detail;
    const msg = typeof detail === 'string'
      ? detail
      : isLoginRequest
        ? 'Login failed. Check your credentials.'
        : 'Admin session expired. Please sign in again.';
    throw new Error(msg);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = (body as { detail?: unknown }).detail;
    const msg = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ')
      : typeof detail === 'string'
        ? detail
        : detail != null
          ? JSON.stringify(detail)
          : 'Request failed';
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AdminToken { access_token: string; token_type: string; }

export interface BookRecord {
  book_id: string;
  title: string;
  subject: string;
  grade: number;
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
  visible_to_students: boolean;
  archived: boolean;
  pdf_filename?: string;
  uploaded_at?: string;
  processed_at?: string;
  error_message?: string;
  unit_count?: number;
  lesson_count?: number;
  chunk_count?: number;
  plan_status?: 'generating' | 'draft' | 'approved' | 'failed' | null;
  plan_generated_at?: string;
  plan_approved_at?: string;
  plan_error?: string;
  schedule_in_student_portal?: boolean;
  schedule_sync_at?: string;
  schedule_students_affected?: number;
  schedule_entries_created?: number;
  processing?: {
    pdf_uploaded?: boolean;
    text_extracted?: boolean;
    toc_detected?: boolean;
    units_detected?: boolean;
    lessons_detected?: boolean;
    structure_extracted?: boolean;
    structure_approved?: boolean;
    rag_indexed?: boolean;
    lesson_plan_generated?: boolean;
    plan_approved?: boolean;
    visible_to_students?: boolean;
    student_sessions_created?: boolean;
    ready_for_students?: boolean;
  };
  structure_status?: 'pending' | 'extracting' | 'draft' | 'approved' | null;
  structure_warning?: string | null;
  structure_detection_method?: string | null;
  structure_extracted_at?: string | null;
  structure_approved_at?: string | null;
}

export interface BookStructureUnit {
  unit_id: string;
  title?: string;
  start_page?: number;
  end_page?: number;
  lessons?: { lesson_id: string; title?: string; start_page?: number; end_page?: number }[];
}

export interface BookStructure {
  book_id: string;
  title: string;
  subject: string;
  grade: number;
  structure_status?: string | null;
  structure_warning?: string | null;
  structure_detection_method?: string | null;
  page_count?: number | null;
  units: BookStructureUnit[];
}

export interface BookPlanModuleItem {
  id?: string;
  type?: string;
  title: string;
  keywords?: string[];
  must_cover?: boolean;
  unit_id?: string;
  unit_title?: string;
  real_unit_id?: string;
}

export interface BookPlanModule {
  key: string;
  title: string;
  items?: BookPlanModuleItem[];
}

export interface BookPlanUnit {
  unit_id: string;
  title?: string;
  keywords?: string[];
  minutes?: number;
  module_key?: string;
  real_unit_id?: string;
  unit_plan?: { unit_title?: string; items?: { id: string; type: string; title: string }[] };
}

export interface BookPlan {
  book_id: string;
  plan_status?: string | null;
  plan_generated_at?: string;
  plan_approved_at?: string;
  plan_error?: string;
  objectives: string[];
  modules: BookPlanModule[];
  subject_key?: string;
  plan_layout?: 'unit_modules' | 'item_modules';
  units: BookPlanUnit[];
}

export interface AdminDashboard {
  total_students: number;
  active_students: number;
  total_books: number;
  visible_books: number;
  processed_books: number;
  processing_books: number;
  failed_books: number;
  archived_books: number;
}

export interface AdminAnalytics {
  students_by_grade: Record<string, number>;
  books_by_status: Record<string, number>;
  books_by_subject: Record<string, number>;
  recent_uploads: { book_id: string; title: string; status: string; uploaded_at?: string }[];
}

export interface StudentSummary {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  grade_level?: number;
  account_status: string;
  /** @deprecated use scheduled_lessons_count */
  enrollment_count: number;
  subjects_assigned_count: number;
  scheduled_lessons_count: number;
  completed_lessons_count: number;
  created_at: string;
}

export interface StudentOverview {
  student: {
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    grade_level?: number;
    account_status: string;
    created_at: string;
    last_login?: string;
  };
  attendance: { total: number; present: number; absent: number; late: number; excused: number; attendance_rate: number };
  evaluations: {
    completed_lessons: number;
    avg_overall_score?: number;
    avg_grammar_score?: number;
    avg_comprehension_score?: number;
    avg_pronunciation_score?: number;
  };
  labs: { completed_sessions: number; avg_final_score?: number };
  /** @deprecated use scheduled_lessons_count */
  enrollment_count: number;
  subjects_assigned_count: number;
  scheduled_lessons_count: number;
  completed_lessons_count: number;
  enrolled_modules: PortalModule[];
  quiz_scores: StudentQuizScore[];
  progress: StudentProgressItem[];
}

export interface PortalLesson {
  id: number;
  name: string;
  description: string;
  chapter_id: string;
  completed: boolean;
  overall_score?: number;
}

export interface PortalModule {
  subject_key: string;
  subject_title: string;
  module_key: string;
  module_title: string;
  icon: string;
  lessons: PortalLesson[];
}

export interface StudentQuizScore {
  content_id: string;
  subject_name?: string;
  overall_score?: number;
  grammar_score?: number;
  comprehension_score?: number;
  pronunciation_score?: number;
  lesson_completed: boolean;
  number_of_attempts?: number;
  created_at?: string;
}

export interface StudentProgressItem {
  content_id: string;
  lesson_completed: boolean;
  overall_score?: number;
  completion_date?: string;
}

export interface StudentParentInfo {
  available: boolean;
  message?: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  relationship?: string;
  emergency_contact?: string;
  emergency_contact_note?: string;
}

export interface StudentSession {
  session_date?: string | null;
  day_of_week?: string | null;
  subject: string;
  module: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  location?: string | null;
  attendance_status?: string | null;
  status: 'attended' | 'missed' | 'not_started' | 'completed' | string;
  completion_time?: string | null;
  quiz_score?: number | null;
  chapter_id?: string | null;
  schedule_id?: string | null;
  attendance_id?: string | null;
}

export interface AdminLessonPart {
  part: number;
  teacher_text?: string;
  quiz?: Record<string, unknown> | null;
}

export interface AdminListeningQuestion {
  id?: string;
  question?: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  skill?: string;
}

export interface AdminStudentView {
  teacher_text?: string;
  quiz?: Record<string, unknown> | null;
  listening?: {
    unit_id?: string;
    title?: string;
    transcript?: string;
    narration_text?: string;
    questions?: AdminListeningQuestion[];
    answers?: Record<string, string>;
    audio_url?: string;
    word_count?: number;
  } | null;
  vocabulary?: string[];
  unit_part?: number;
  parts?: AdminLessonPart[];
  media?: {
    video_filename?: string;
    video_type?: string;
    short_description?: string;
    allowed_topics?: string[];
    interactive_images?: { image_url?: string; caption?: string; description?: string }[];
  };
  session_student_id?: string | null;
  has_stored_session?: boolean;
  storage_note?: string;
}

export interface AdminLessonPlanItem {
  order: number;
  id?: string;
  title: string;
  type?: string;
  type_label?: string;
  section_key?: string | null;
  section?: string | null;
  preview?: string | null;
  keywords?: string[];
  must_cover?: boolean;
}

export interface AdminLessonContent {
  chapter_id: string;
  lesson_title?: string;
  lesson_meta?: {
    subject_key: string;
    subject_title: string;
    module_key: string;
    module_title: string;
    name: string;
    description: string;
    chapter_id: string;
  };
  history_lesson?: Record<string, unknown>;
  module_key?: string | null;
  student_view?: AdminStudentView & { module_items?: unknown[] };
  unit_plan?: { unit_title?: string; items?: unknown[] };
  lesson_plan_items?: AdminLessonPlanItem[];
  listening?: Record<string, unknown>;
  book_unit_content?: { text?: string; title?: string; start_page?: number; end_page?: number; [key: string]: unknown };
  progress_samples?: { student_id: string; progress: unknown }[];
  subject_key?: string;
  supports_listening?: boolean;
  supports_pronunciation?: boolean;
  language_sections?: {
    key?: string;
    title?: string;
    index?: number;
    item_title?: string;
    keywords?: string[];
  }[];
  summary: {
    has_unit_plan: boolean;
    item_count: number;
    quiz_count: number;
    vocab_count: number;
    concept_count?: number;
    activity_count?: number;
    summary_count?: number;
    has_listening: boolean;
    has_book_content: boolean;
    has_teacher_text?: boolean;
    has_stored_session?: boolean;
  };
  generated_content: {
    explanation_items: unknown[];
    vocabulary: unknown[];
    concepts?: unknown[];
    activities?: unknown[];
    summary?: unknown[];
    quiz: unknown[];
    listening_story?: Record<string, unknown> | string;
    listening_questions?: unknown[];
  };
}

export interface AdminGeneratedPlanItem {
  id?: string;
  type?: string;
  title?: string;
  keywords?: string[];
  must_cover?: boolean;
}

export interface AdminPreviewQuiz {
  question?: string;
  type?: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  skill?: string;
  listening_question_index?: number;
  listening_question_total?: number;
}

export interface AdminPreviewListening {
  unit_id?: string;
  title?: string;
  transcript?: string;
  narration_text?: string;
  questions?: { id?: string; question?: string; options?: string[]; skill?: string }[];
  word_count?: number;
}

export interface AdminPreviewSessionResponse {
  preview: boolean;
  done: boolean;
  chapter_id: string;
  book_id?: string;
  teacher_text?: string;
  quiz?: AdminPreviewQuiz;
  quiz_with_answers?: AdminPreviewQuiz;
  listening?: AdminPreviewListening;
  unit_part?: number;
  max_unlocked_part?: number;
  parts?: AdminLessonPart[];
  error?: string;
}

export interface AdminPreviewQuizResponse {
  chapter_id: string;
  unit_part: number;
  quiz?: AdminPreviewQuiz;
  teacher_text?: string;
  listening?: AdminPreviewListening;
}

export interface BookDetailResponse {
  book: BookRecord;
  units: { unit_id: string; title?: string; book_id?: string; start_page?: number; end_page?: number }[];
  manifest?: unknown;
  lessons?: unknown;
}

export interface SubjectBookSummary {
  book_id?: string;
  title?: string;
  status?: string;
  visible_to_students?: boolean;
  archived?: boolean;
  unit_count?: number;
  lesson_count?: number;
  chunk_count?: number;
  error_message?: string;
  uploaded_at?: string;
}

export interface SubjectContent {
  subject_key: string;
  subject_name: string;
  icon: string;
  grade: number;
  student_session_count: number;
  generated_lesson_count: number;
  uploaded_book_count: number;
  has_book: boolean;
  book?: SubjectBookSummary | null;
  books?: SubjectBookSummary[];
  visible_to_students?: boolean;
  archived?: boolean;
  builtin?: boolean;
}

export interface SubjectRecord {
  subject_key: string;
  subject_name: string;
  icon: string;
  grade: number;
  visible_to_students: boolean;
  archived: boolean;
  builtin: boolean;
  created_at?: string;
  book?: SubjectBookSummary | null;
}

export const adminApi = {
  login: (username: string, password: string) => {
    const payload = { username: username.trim(), password };
    console.info('[admin.login] endpoint:', `${BASE}/admin/login`);
    console.info('[admin.login] payload keys:', Object.keys(payload));
    console.info('[admin.login] role:', 'admin');
    if (!payload.username || !payload.password) {
      return Promise.reject(new Error('Please enter your username and password.'));
    }
    return adminRequest<AdminToken>('/admin/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  me: () => adminRequest<{ username: string; role: string; display_name: string }>('/admin/me'),

  dashboard: () => adminRequest<AdminDashboard>('/admin/dashboard'),

  analytics: () => adminRequest<AdminAnalytics>('/admin/analytics'),

  content: {
    subjects: () => adminRequest<SubjectContent[]>('/admin/content/subjects'),
  },

  subjects: {
    list: () => adminRequest<SubjectRecord[]>('/admin/subjects'),
    create: (payload: {
      subject_name: string;
      grade: number;
      icon?: string;
      visible_to_students?: boolean;
    }) =>
      adminRequest<SubjectRecord>('/admin/subjects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    setVisibility: (subjectKey: string, visible: boolean) =>
      adminRequest<SubjectRecord>(`/admin/subjects/${encodeURIComponent(subjectKey)}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ visible_to_students: visible }),
      }),
    setArchive: (subjectKey: string, archived: boolean) =>
      adminRequest<SubjectRecord>(`/admin/subjects/${encodeURIComponent(subjectKey)}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archived }),
      }),
    uploadBook: (subjectKey: string, form: FormData) =>
      adminRequest<BookRecord>(`/admin/subjects/${encodeURIComponent(subjectKey)}/upload-book`, {
        method: 'POST',
        body: form,
      }),
  },

  books: {
    list: () => adminRequest<BookRecord[]>('/admin/books'),
    get: (id: string) => adminRequest<BookDetailResponse>(`/admin/books/${encodeURIComponent(id)}`),
    upload: (form: FormData) =>
      adminRequest<BookRecord>('/admin/books/upload', { method: 'POST', body: form }),
    process: (id: string) =>
      adminRequest<BookRecord>(`/admin/books/${encodeURIComponent(id)}/process`, { method: 'POST' }),
    setVisibility: (id: string, visible: boolean) =>
      adminRequest<BookRecord>(`/admin/books/${encodeURIComponent(id)}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ visible_to_students: visible }),
      }),
    setArchive: (id: string, archived: boolean) =>
      adminRequest<BookRecord>(`/admin/books/${encodeURIComponent(id)}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archived }),
      }),
    getPlan: (id: string) =>
      adminRequest<BookPlan>(`/admin/books/${encodeURIComponent(id)}/plans`),
    updatePlan: (id: string, units: { unit_id: string; title?: string; module_key?: string }[]) =>
      adminRequest<BookPlan>(`/admin/books/${encodeURIComponent(id)}/plans`, {
        method: 'PATCH',
        body: JSON.stringify({ units }),
      }),
    approvePlan: (id: string) =>
      adminRequest<BookPlan>(`/admin/books/${encodeURIComponent(id)}/plans/approve`, { method: 'PATCH' }),
    generatePlan: (id: string) =>
      adminRequest<BookPlan>(`/admin/books/${encodeURIComponent(id)}/plans/generate`, { method: 'POST' }),
    regeneratePlan: (id: string) =>
      adminRequest<BookPlan>(`/admin/books/${encodeURIComponent(id)}/plans/regenerate`, { method: 'POST' }),
    getStructure: (id: string) =>
      adminRequest<BookStructure>(`/admin/books/${encodeURIComponent(id)}/structure`),
    extractStructure: (id: string) =>
      adminRequest<BookStructure>(`/admin/books/${encodeURIComponent(id)}/extract-structure`, { method: 'POST' }),
    updateStructure: (id: string, units: BookStructureUnit[]) =>
      adminRequest<BookStructure>(`/admin/books/${encodeURIComponent(id)}/structure`, {
        method: 'PATCH',
        body: JSON.stringify({ units }),
      }),
    approveStructure: (id: string) =>
      adminRequest<BookRecord>(`/admin/books/${encodeURIComponent(id)}/structure/approve`, { method: 'POST' }),
  },

  students: {
    list: () => adminRequest<StudentSummary[]>('/admin/students'),
    get: (id: string) => adminRequest<StudentOverview>(`/admin/students/${encodeURIComponent(id)}`),
    parents: (id: string) => adminRequest<StudentParentInfo>(`/admin/students/${encodeURIComponent(id)}/parents`),
    schedule: (id: string) => adminRequest<StudentSession[]>(`/admin/students/${encodeURIComponent(id)}/schedule`),
    attendance: (id: string) => adminRequest<StudentSession[]>(`/admin/students/${encodeURIComponent(id)}/attendance`),
    deactivate: (id: string) =>
      adminRequest<{ user_id: string; account_status: string }>(`/admin/students/${encodeURIComponent(id)}/deactivate`, {
        method: 'PATCH',
      }),
    delete: (id: string) =>
      adminRequest<void>(`/admin/students/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  curriculum: {
    portal: () =>
      adminRequest<{ modules: PortalModule[]; source?: string }>('/admin/curriculum/portal'),
    english: () =>
      adminRequest<{ modules: PortalModule[]; source?: string }>('/admin/curriculum/english'),
  },

  lessons: {
    content: (chapterId: string, studentId?: string, moduleKey?: string) => {
      const params = new URLSearchParams();
      if (studentId) params.set('student_id', studentId);
      if (moduleKey) params.set('module_key', moduleKey);
      const q = params.toString() ? `?${params.toString()}` : '';
      return adminRequest<AdminLessonContent>(
        `/admin/lessons/${encodeURIComponent(chapterId)}/content${q}`,
      );
    },
    previewSession: (
      chapterId: string,
      opts?: { lessonTitle?: string; lessonDesc?: string; unitPart?: number },
    ) =>
      adminRequest<AdminPreviewSessionResponse>(
        `/admin/lessons/${encodeURIComponent(chapterId)}/preview-session`,
        {
          method: 'POST',
          body: JSON.stringify({
            lesson_title: opts?.lessonTitle ?? '',
            lesson_desc: opts?.lessonDesc ?? '',
            unit_part: opts?.unitPart ?? 0,
          }),
        },
      ),
    switchPreviewPart: (chapterId: string, unitPart: number) =>
      adminRequest<AdminPreviewSessionResponse>(
        `/admin/lessons/${encodeURIComponent(chapterId)}/preview-session/switch-part`,
        {
          method: 'POST',
          body: JSON.stringify({ unit_part: unitPart }),
        },
      ),
    previewQuiz: (
      chapterId: string,
      opts?: { unitPart?: number; lessonTitle?: string; lessonDesc?: string },
    ) => {
      const params = new URLSearchParams();
      params.set('unit_part', String(opts?.unitPart ?? 0));
      if (opts?.lessonTitle) params.set('lesson_title', opts.lessonTitle);
      if (opts?.lessonDesc) params.set('lesson_desc', opts.lessonDesc);
      return adminRequest<AdminPreviewQuizResponse>(
        `/admin/lessons/${encodeURIComponent(chapterId)}/preview-quiz?${params.toString()}`,
      );
    },
    regenerate: (
      chapterId: string,
      opts?: { lessonTitle?: string; lessonDesc?: string; unitPart?: number },
    ) =>
      adminRequest<AdminPreviewSessionResponse>(
        `/admin/lessons/${encodeURIComponent(chapterId)}/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify({
            lesson_title: opts?.lessonTitle ?? '',
            lesson_desc: opts?.lessonDesc ?? '',
            unit_part: opts?.unitPart ?? undefined,
          }),
        },
      ),
  },
};

export function statusColor(status: string): string {
  switch (status) {
    case 'processed': return 'var(--mint)';
    case 'processing': return 'var(--amber)';
    case 'failed': return 'var(--coral)';
    default: return 'var(--sky)';
  }
}

export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
