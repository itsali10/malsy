/** Admin portal module helpers — API is the source of truth (see adminApi.curriculum). */

export interface PortalModuleView {
  subjectKey: string;
  subjectTitle: string;
  moduleKey: string;
  moduleTitle: string;
  icon: string;
  lessons: {
    id: number;
    name: string;
    description: string;
    chapter_id: string;
    book_unit_id?: string | null;
    module_skill?: string;
  }[];
}

export function chapterIdForLesson(sectionKey: string, lessonId: number): string {
  return `${sectionKey}:unit_${String(lessonId).padStart(2, '0')}`;
}

/** Map backend curriculum API modules to admin view shape. */
export function mapModulesFromApi(
  modules: {
    subject_key: string;
    subject_title: string;
    module_key: string;
    module_title: string;
    icon: string;
    lessons: {
      id: number;
      name: string;
      description: string;
      chapter_id: string;
      book_unit_id?: string | null;
      module_skill?: string;
    }[];
  }[],
): PortalModuleView[] {
  return modules.map((mod) => ({
    subjectKey: mod.subject_key,
    subjectTitle: mod.subject_title,
    moduleKey: mod.module_key,
    moduleTitle: mod.module_title,
    icon: mod.icon,
    lessons: mod.lessons.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      chapter_id: l.chapter_id,
      book_unit_id: l.book_unit_id,
      module_skill: l.module_skill,
    })),
  }));
}

export function lessonAdminHref(chapterId: string, moduleKey: string, studentId?: string): string {
  const params = new URLSearchParams();
  if (moduleKey.startsWith('english_')) params.set('module', moduleKey);
  if (studentId) params.set('student', studentId);
  const q = params.toString();
  return `/admin/lessons/${encodeURIComponent(chapterId)}${q ? `?${q}` : ''}`;
}
