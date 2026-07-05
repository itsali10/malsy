import type { AdminGeneratedPlanItem, AdminLessonContent } from './admin-api';

export interface LessonPreviewSections {
  title: string;
  explanationText?: string;
  explanationItems: AdminGeneratedPlanItem[];
  objectiveItems: AdminGeneratedPlanItem[];
  conceptItems: AdminGeneratedPlanItem[];
  vocabWords: string[];
  activityItems: AdminGeneratedPlanItem[];
  visualItems: AdminGeneratedPlanItem[];
  summaryItems: AdminGeneratedPlanItem[];
  quiz: Record<string, unknown> | null | undefined;
  quizPlanItems: AdminGeneratedPlanItem[];
  images: { image_url?: string; caption?: string; description?: string }[];
  videoFilename?: string;
  storageNote?: string;
}

function asPlanItems(raw: unknown[] | undefined): AdminGeneratedPlanItem[] {
  return (raw ?? []).filter((i): i is AdminGeneratedPlanItem => typeof i === 'object' && i !== null);
}

function titleMatches(item: AdminGeneratedPlanItem, pattern: RegExp): boolean {
  return pattern.test(String(item.title ?? ''));
}

function keywordsFromItems(items: AdminGeneratedPlanItem[]): string[] {
  const words: string[] = [];
  for (const item of items) {
    for (const kw of item.keywords ?? []) {
      const w = String(kw).trim();
      if (w && !words.includes(w)) words.push(w);
    }
  }
  return words;
}

/** Build final structured lesson sections from stored admin lesson content (no raw plan list). */
export function buildLessonPreviewSections(content: AdminLessonContent): LessonPreviewSections {
  const view = content.student_view;
  const gen = content.generated_content;

  const explanationSource = asPlanItems(gen?.explanation_items);
  const objectiveItems = explanationSource.filter((i) => titleMatches(i, /objectives?/i));
  const conceptItems = [
    ...asPlanItems(gen?.concepts),
    ...explanationSource.filter((i) => titleMatches(i, /concept/i)),
  ];
  const explanationItems = explanationSource.filter(
    (i) =>
      !titleMatches(i, /objectives?/i) &&
      !titleMatches(i, /concept/i) &&
      !titleMatches(i, /summary|wrap-up|wrap up/i),
  );
  const vocabWords =
    (view?.vocabulary?.length ? view.vocabulary : keywordsFromItems(asPlanItems(gen?.vocabulary))) ?? [];
  const quizPlanMeta = asPlanItems(gen?.quiz);
  const experimentItems = quizPlanMeta.filter((i) => titleMatches(i, /experiment/i));
  const quizPlanItems = quizPlanMeta.filter(
    (i) => titleMatches(i, /quiz|review/i) && !titleMatches(i, /experiment/i),
  );
  const activityPool = [...asPlanItems(gen?.activities), ...experimentItems];
  const visualItems = activityPool.filter((i) => i.type === 'visual' || titleMatches(i, /diagram|image/i));
  const activityItems = activityPool.filter(
    (i) => i.type !== 'visual' && !titleMatches(i, /diagram|image|quiz|review/i),
  );
  const summaryItems = asPlanItems(gen?.summary).concat(
    explanationSource.filter((i) => titleMatches(i, /summary|wrap-up|wrap up/i)),
  );

  return {
    title: content.lesson_title ?? content.chapter_id,
    explanationText: view?.teacher_text?.trim() || undefined,
    explanationItems: view?.teacher_text?.trim()
      ? explanationItems
      : [...explanationItems, ...conceptItems],
    objectiveItems,
    conceptItems: view?.teacher_text?.trim() ? conceptItems : [],
    vocabWords,
    activityItems,
    visualItems,
    summaryItems,
    quiz: view?.quiz as Record<string, unknown> | null | undefined,
    quizPlanItems,
    images: view?.media?.interactive_images ?? [],
    videoFilename: view?.media?.video_filename,
    storageNote: view?.storage_note,
  };
}
