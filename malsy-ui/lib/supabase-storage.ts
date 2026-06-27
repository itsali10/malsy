/**
 * Supabase Storage for lesson videos (server-side only).
 * Files live at the bucket root: history_g6_unit_01.mp4 + history_g6_unit_01.meta.json
 * (legacy uploads under videos/ and meta/ are still supported when reading).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const LESSON_VIDEOS_BUCKET = process.env.SUPABASE_VIDEO_BUCKET ?? 'lesson-videos';
export const LESSON_IMAGES_BUCKET = process.env.SUPABASE_IMAGES_BUCKET ?? 'lesson-images';

let _client: SupabaseClient | null = null;

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to malsy-ui/.env.local',
    );
  }

  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

/** Primary upload path — bucket root (matches manual uploads). */
export function videoStoragePath(filename: string): string {
  return filename;
}

/** Primary meta path — bucket root, same basename as video. */
export function metaStoragePath(filename: string): string {
  return filename.replace(/\.mp4$/i, '.meta.json');
}

/** Legacy paths for videos uploaded before root layout. */
function legacyVideoPaths(filename: string): string[] {
  return [filename, `videos/${filename}`];
}

function legacyMetaPaths(filename: string): string[] {
  const metaName = filename.replace(/\.mp4$/i, '.meta.json');
  return [metaName, `meta/${metaName}`];
}

export function getSupabasePublicUrl(storagePath: string): string {
  const supabase = getSupabaseAdmin();
  const { data } = supabase.storage.from(LESSON_VIDEOS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function storageFileExists(storagePath: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const parts = storagePath.split('/');
  const name = parts.pop() ?? storagePath;
  const folder = parts.join('/') || undefined;

  const { data, error } = await supabase.storage.from(LESSON_VIDEOS_BUCKET).list(folder, {
    search: name,
    limit: 20,
  });
  if (error || !data?.length) return false;
  return data.some(f => f.name === name);
}

async function resolveVideoPath(filename: string): Promise<string | null> {
  for (const p of legacyVideoPaths(filename)) {
    if (await storageFileExists(p)) return p;
  }
  return null;
}

async function resolveMetaPath(filename: string): Promise<string | null> {
  for (const p of legacyMetaPaths(filename)) {
    if (await storageFileExists(p)) return p;
  }
  return null;
}

export async function uploadLessonVideoToSupabase(
  filename: string,
  videoBuffer: Buffer,
  meta: Record<string, unknown>,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const videoPath = videoStoragePath(filename);
  const metaPath = metaStoragePath(filename);

  const { error: videoError } = await supabase.storage
    .from(LESSON_VIDEOS_BUCKET)
    .upload(videoPath, videoBuffer, { contentType: 'video/mp4', upsert: true });
  if (videoError) throw new Error(`Supabase video upload failed: ${videoError.message}`);

  const metaBody = JSON.stringify(meta);
  const { error: metaError } = await supabase.storage
    .from(LESSON_VIDEOS_BUCKET)
    .upload(metaPath, metaBody, { contentType: 'application/json', upsert: true });
  if (metaError) throw new Error(`Supabase meta upload failed: ${metaError.message}`);

  const publicUrl = getSupabasePublicUrl(videoPath);
  console.log(`[Supabase] Uploaded ${filename} → ${publicUrl}`);
  return publicUrl;
}

export interface SupabaseLessonVideoMeta {
  lessonTitle?: string;
  script?: string;
  narration?: string;
  keyConcept?: string;
  unitId?: string;
  savedAt?: string;
}

export async function getLessonVideoFromSupabase(filename: string): Promise<{
  ready: boolean;
  videoUrl?: string;
  script?: string;
  narration?: string;
  keyConcept?: string;
  lessonTitle?: string;
  savedAt?: string;
}> {
  if (!isSupabaseStorageConfigured()) return { ready: false };

  try {
    const videoPath = await resolveVideoPath(filename);
    if (!videoPath) return { ready: false };

    const videoUrl = getSupabasePublicUrl(videoPath);
    const metaPath = await resolveMetaPath(filename);

    if (!metaPath) {
      return { ready: true, videoUrl };
    }

    const supabase = getSupabaseAdmin();
    const { data: metaBlob, error: metaError } = await supabase.storage
      .from(LESSON_VIDEOS_BUCKET)
      .download(metaPath);

    if (metaError || !metaBlob) {
      return { ready: true, videoUrl };
    }

    try {
      const meta = JSON.parse(await metaBlob.text()) as SupabaseLessonVideoMeta;
      return {
        ready: true,
        videoUrl,
        script: meta.script,
        narration: meta.narration ?? meta.script,
        keyConcept: meta.keyConcept,
        lessonTitle: meta.lessonTitle,
        savedAt: meta.savedAt,
      };
    } catch {
      return { ready: true, videoUrl };
    }
  } catch (err) {
    console.warn('[Supabase] Could not check saved video:', err instanceof Error ? err.message : err);
    return { ready: false };
  }
}

/** Extract sortable unit index from filenames like history_g6_unit_03.mp4 */
export function unitNumberFromFilename(filename: string): number {
  const m = filename.match(/unit_(\d+)/i);
  return m ? parseInt(m[1], 10) : 9999;
}

/** history_g6_unit_01.mp4 → history_g6:unit_01 */
export function unitIdFromVideoFilename(filename: string): string {
  const base = filename.replace(/\.mp4$/i, '');
  const m = base.match(/^(.+)_(unit_\d+)$/i);
  if (m) return `${m[1]}:${m[2]}`;
  return base;
}

export interface ListedLessonVideo {
  filename: string;
  unitId: string;
  unitNumber: number;
  videoUrl: string;
  lessonTitle?: string;
  narration?: string;
  keyConcept?: string;
  savedAt?: string;
}

async function listMp4InFolder(folder: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(LESSON_VIDEOS_BUCKET).list(folder, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error || !data) return [];
  return data
    .filter(f => f.name && !f.name.endsWith('/') && f.name.toLowerCase().endsWith('.mp4'))
    .map(f => (folder ? `${folder}/${f.name}` : f.name));
}

/** List all lesson videos in unit order (unit_01, unit_02, …). */
export async function listLessonVideosFromSupabase(bookId?: string): Promise<ListedLessonVideo[]> {
  if (!isSupabaseStorageConfigured()) return [];

  const rootFiles = await listMp4InFolder('');
  const nestedFiles = await listMp4InFolder('videos');
  const seen = new Set<string>();
  const filenames: string[] = [];

  for (const path of [...rootFiles, ...nestedFiles]) {
    const base = path.split('/').pop() ?? path;
    if (seen.has(base)) continue;
    seen.add(base);
    if (bookId && !base.toLowerCase().startsWith(`${bookId.toLowerCase()}_`)) continue;
    filenames.push(base);
  }

  filenames.sort((a, b) => unitNumberFromFilename(a) - unitNumberFromFilename(b));

  const results: ListedLessonVideo[] = [];
  for (const filename of filenames) {
    const info = await getLessonVideoFromSupabase(filename);
    if (!info.ready || !info.videoUrl) continue;
    results.push({
      filename,
      unitId: unitIdFromVideoFilename(filename),
      unitNumber: unitNumberFromFilename(filename),
      videoUrl: info.videoUrl,
      lessonTitle: info.lessonTitle,
      narration: info.narration ?? info.script,
      keyConcept: info.keyConcept,
      savedAt: info.savedAt,
    });
  }
  return results;
}

// ── Interactive lesson images (History) ───────────────────────────

export interface InteractiveImageCardMeta {
  id?: string;
  tap_label: string;
  title: string;
  description?: string;
  labels: string[];
  image_url?: string | null;
  filename?: string | null;
}

export interface InteractiveImagesManifest {
  book_id: string;
  unit_id: string;
  lesson_title?: string;
  lesson_number?: number;
  images: InteractiveImageCardMeta[];
  savedAt?: string;
}

export function unitStorageBase(unitId: string): string {
  return unitId.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

export function interactiveImageFilename(unitId: string, index: number): string {
  return `${unitStorageBase(unitId)}_img_${index}.png`;
}

export function interactiveManifestFilename(unitId: string): string {
  return `${unitStorageBase(unitId)}.interactive.json`;
}

export function hasCompleteInteractiveImageMetadata(manifest: InteractiveImagesManifest): boolean {
  const images = (manifest.images ?? []).slice(0, 2);
  if (images.length < 2) return false;
  return images.every((img, i) => {
    const labels = Array.isArray(img.labels) ? img.labels.filter(Boolean) : [];
    const title = (img.title ?? '').trim();
    const tapLabel = (img.tap_label ?? '').trim();
    return Boolean(
      img.image_url &&
      title &&
      !title.toLowerCase().endsWith(`image ${i + 1}`) &&
      tapLabel &&
      !/^tap image \d+$/i.test(tapLabel) &&
      labels.length > 0,
    );
  });
}

function imagesBucketPublicUrl(storagePath: string): string {
  const supabase = getSupabaseAdmin();
  const { data } = supabase.storage.from(LESSON_IMAGES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

async function imagesBucketFileExists(storagePath: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const parts = storagePath.split('/');
  const name = parts.pop() ?? storagePath;
  const folder = parts.join('/') || undefined;
  const { data, error } = await supabase.storage.from(LESSON_IMAGES_BUCKET).list(folder, {
    search: name,
    limit: 20,
  });
  if (error || !data?.length) return false;
  return data.some(f => f.name === name);
}

export async function getInteractiveImagesFromSupabase(unitId: string): Promise<{
  ready: boolean;
  manifest?: InteractiveImagesManifest;
}> {
  if (!isSupabaseStorageConfigured()) return { ready: false };

  try {
    const manifestName = interactiveManifestFilename(unitId);
    if (!(await imagesBucketFileExists(manifestName))) return { ready: false };

    const supabase = getSupabaseAdmin();
    const { data: blob, error } = await supabase.storage
      .from(LESSON_IMAGES_BUCKET)
      .download(manifestName);
    if (error || !blob) return { ready: false };

    const manifest = JSON.parse(await blob.text()) as InteractiveImagesManifest;
    const images = (manifest.images ?? []).filter(img => img.image_url);
    if (images.length < 2) return { ready: false };
    if (!hasCompleteInteractiveImageMetadata({ ...manifest, images })) return { ready: false };

    return { ready: true, manifest: { ...manifest, images: images.slice(0, 2) } };
  } catch (err) {
    console.warn('[Supabase] Could not load interactive images:', err instanceof Error ? err.message : err);
    return { ready: false };
  }
}

export async function uploadInteractiveImagesToSupabase(
  unitId: string,
  manifest: InteractiveImagesManifest,
  imageBuffers: { index: number; buffer: Buffer }[],
): Promise<InteractiveImagesManifest> {
  const supabase = getSupabaseAdmin();
  const updatedImages = [...(manifest.images ?? [])];

  for (const { index, buffer } of imageBuffers) {
    const filename = interactiveImageFilename(unitId, index);
    const { error } = await supabase.storage
      .from(LESSON_IMAGES_BUCKET)
      .upload(filename, buffer, { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`Supabase image upload failed (${filename}): ${error.message}`);

    const publicUrl = imagesBucketPublicUrl(filename);
    const slot = index - 1;
    if (updatedImages[slot]) {
      updatedImages[slot] = {
        ...updatedImages[slot],
        image_url: publicUrl,
        filename,
      };
    }
    console.log(`[Supabase] Uploaded interactive image ${filename} → ${publicUrl}`);
  }

  const out: InteractiveImagesManifest = {
    ...manifest,
    images: updatedImages.slice(0, 2),
    savedAt: new Date().toISOString(),
  };

  const manifestName = interactiveManifestFilename(unitId);
  const { error: metaError } = await supabase.storage
    .from(LESSON_IMAGES_BUCKET)
    .upload(manifestName, JSON.stringify(out), { contentType: 'application/json', upsert: true });
  if (metaError) throw new Error(`Supabase manifest upload failed: ${metaError.message}`);

  console.log(`[Supabase] Uploaded interactive manifest ${manifestName}`);
  return out;
}
