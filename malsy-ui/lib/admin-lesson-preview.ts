import type { AdminGeneratedPlanItem, AdminLessonContent } from './admin-api';
import { dedupeList, isNearDuplicateText, normalizeListText } from './dedupe-list';

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

function itemKey(item: AdminGeneratedPlanItem): string {
  const id = String(item.id ?? '').trim();
  if (id) return `id:${normalizeListText(id)}`;
  return `title:${normalizeListText(item.title ?? '')}`;
}

/** Deduplicate plan items by id or normalized title. */
export function dedupePlanItems(items: AdminGeneratedPlanItem[]): AdminGeneratedPlanItem[] {
  const out: AdminGeneratedPlanItem[] = [];
  for (const item of items) {
    const key = itemKey(item);
    if (out.some((kept) => itemKey(kept) === key || isNearDuplicateText(kept.title, item.title))) {
      continue;
    }
    const keywords = dedupeList((item.keywords ?? []).map(String));
    out.push({ ...item, keywords });
  }
  return out;
}

function keywordsFromItems(items: AdminGeneratedPlanItem[]): string[] {
  const words: string[] = [];
  for (const item of items) {
    for (const kw of item.keywords ?? []) {
      const w = String(kw).trim();
      if (w) words.push(w);
    }
  }
  return dedupeList(words);
}

function titleMatches(item: AdminGeneratedPlanItem, pattern: RegExp): boolean {
  return pattern.test(String(item.title ?? ''));
}

function splitActivities(items: AdminGeneratedPlanItem[]) {
  const visualItems = items.filter((i) => i.type === 'visual' || titleMatches(i, /diagram|image|map|chart/i));
  const activityItems = items.filter(
    (i) => !visualItems.includes(i) && !titleMatches(i, /quiz|review question|assessment/i),
  );
  return { visualItems: dedupePlanItems(visualItems), activityItems: dedupePlanItems(activityItems) };
}

/** Build final structured lesson sections from stored admin lesson content (no raw plan list). */
export function buildLessonPreviewSections(content: AdminLessonContent): LessonPreviewSections {
  const view = content.student_view;
  const gen = content.generated_content;

  const explanationItems = dedupePlanItems(asPlanItems(gen?.explanation_items));
  const objectiveItems = dedupePlanItems(
    asPlanItems(gen?.objectives).length
      ? asPlanItems(gen?.objectives)
      : explanationItems.filter((i) => titleMatches(i, /objectives?/i)),
  );
  const conceptItems = dedupePlanItems(asPlanItems(gen?.concepts));
  const usedKeys = new Set([
    ...objectiveItems.map(itemKey),
    ...conceptItems.map(itemKey),
    ...dedupePlanItems(asPlanItems(gen?.summary)).map(itemKey),
    ...dedupePlanItems(asPlanItems(gen?.quiz)).map(itemKey),
  ]);
  const explanationOnly = dedupePlanItems(
    explanationItems.filter((i) => {
      if (usedKeys.has(itemKey(i))) return false;
      return !titleMatches(i, /objectives?|concept|summary|wrap-up|wrap up|quiz|review question/i);
    }),
  );

  const activityPool = dedupePlanItems(asPlanItems(gen?.activities));
  const { visualItems, activityItems } = splitActivities(activityPool);

  const summaryItems = dedupePlanItems(asPlanItems(gen?.summary));
  const quizPlanItems = dedupePlanItems(
    asPlanItems(gen?.quiz).filter(
      (i) => titleMatches(i, /quiz|review question|assessment/i) && !titleMatches(i, /experiment/i),
    ),
  );

  const vocabFromPlan = keywordsFromItems(asPlanItems(gen?.vocabulary));
  const vocabWords = dedupeList(
    view?.vocabulary?.length ? view.vocabulary.map(String) : vocabFromPlan.length ? vocabFromPlan : [],
  );

  const images = (view?.media?.interactive_images ?? []).filter(
    (img, index, arr) =>
      arr.findIndex(
        (other) =>
          normalizeListText(other.image_url ?? other.caption ?? other.description) ===
          normalizeListText(img.image_url ?? img.caption ?? img.description),
      ) === index,
  );

  return {
    title: content.lesson_title ?? content.chapter_id,
    explanationText: view?.teacher_text?.trim() || undefined,
    explanationItems: explanationOnly,
    objectiveItems,
    conceptItems,
    vocabWords,
    activityItems,
    visualItems,
    summaryItems,
    quiz: view?.quiz as Record<string, unknown> | null | undefined,
    quizPlanItems,
    images,
    videoFilename: view?.media?.video_filename,
    storageNote: view?.storage_note,
  };
}
