/**
 * Lesson video generation via OpenAI Chat (script) + Sora (video).
 * Ported from frontend/lib/video-generator.ts — stripped to lesson-only flow.
 */

import { existsSync } from 'fs';
import { mkdir, writeFile, readFile, rm, stat } from 'fs/promises';
import path from 'path';
import {
  getLessonVideoFromSupabase,
  isSupabaseStorageConfigured,
  uploadLessonVideoToSupabase,
} from './supabase-storage';
import { unitVideoFilename } from './unit-video';

export { unitVideoFilename };

const OPENAI_API_KEY   = (process.env.OPENAI_API_KEY ?? '').trim();
const OPENAI_MODEL     = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const OPENAI_VIDEO_MODEL   = process.env.OPENAI_VIDEO_MODEL ?? 'sora-2';
const OPENAI_VIDEO_SECONDS = process.env.OPENAI_VIDEO_SECONDS ?? '12';
const OPENAI_VIDEO_SIZE    = process.env.OPENAI_VIDEO_SIZE ?? '1280x720';
const OPENAI_API_BASE  = 'https://api.openai.com/v1';

export const VIDEO_DIR = path.join(process.cwd(), 'output', 'lesson-videos');

async function ensureDir(dirPath: string) {
  try {
    const s = await stat(dirPath);
    if (s.isFile()) await rm(dirPath);
  } catch { /* not found — ok */ }
  await mkdir(dirPath, { recursive: true });
}

export function friendlyError(err: unknown): string {
  const msg =
    (err as { message?: string })?.message ??
    String(err);
  if (!OPENAI_API_KEY) {
    return 'OPENAI_API_KEY is missing in malsy-ui/.env.local. Copy it from backend/.env, then restart npm run dev.';
  }
  if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT'))
    return 'Network error — check internet connection.';
  if (msg.includes('Incorrect API key') || msg.includes('invalid_api_key'))
    return 'Invalid OPENAI_API_KEY in malsy-ui/.env.local.';
  if (msg.includes('quota') || msg.includes('429'))
    return 'OpenAI quota exceeded — check billing at platform.openai.com.';
  if (msg.includes('401'))
    return 'OpenAI rejected the API key — verify OPENAI_API_KEY in malsy-ui/.env.local.';
  if (msg.includes('403') || msg.includes('model_not_found') || msg.includes('not have access'))
    return 'Sora access not enabled on this OpenAI account. Enable it at platform.openai.com.';
  if (msg.includes('API key'))
    return 'API error — check OPENAI_API_KEY in malsy-ui/.env.local and Sora access on your account.';
  return msg;
}

async function chatCompletion(prompt: string): Promise<string> {
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });
  const data = await res.json().catch(() => ({})) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] };
  if (!res.ok) throw new Error(data.error?.message ?? `OpenAI ${res.status}`);
  const text = data.choices?.[0]?.message?.content;
  if (text) return text.trim();
  throw new Error('OpenAI returned no text');
}

// ── Script generation ──────────────────────────────────────────────────────────

async function generateScript(
  lessonTitle: string,
  lessonDescription: string,
  subject: string,
): Promise<string> {
  const subjectHint = subject.charAt(0).toUpperCase() + subject.slice(1);
  const maxWords = Math.round(parseInt(OPENAI_VIDEO_SECONDS, 10) * 2.4);

  const prompt = [
    `You are the BRAIN of a friendly animated cartoon teacher character in an educational ${subjectHint} video for children.`,
    `Lesson topic: "${lessonTitle}"`,
    `Overview: "${lessonDescription}"`,
    `Rules:`,
    `- Output ONLY the spoken narration script (no labels, no titles).`,
    `- At most ${maxWords} words. Exactly 3 short paragraphs separated by one blank line.`,
    `- Start with a friendly greeting (e.g. "Hello, young learners!").`,
    `- Child-friendly language, warm and encouraging tone.`,
    `- Stick to facts related to the lesson topic.`,
  ].join('\n');

  let script = '';
  for (let i = 1; i <= 2; i++) {
    try { script = await chatCompletion(prompt); break; }
    catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 2000)); }
  }
  return script.trim();
}

// ── Sora video generation ─────────────────────────────────────────────────────

function buildSoraPrompt(subject: string, lessonTitle: string, script: string): string {
  const sec = parseInt(OPENAI_VIDEO_SECONDS, 10) || 12;
  const parts = script.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const third = Math.max(1, Math.round(sec / Math.max(parts.length, 1)));

  const beatBlock = parts.length >= 2
    ? [
        `CRITICAL: ${sec}s clip. Animate ${parts.length} sequential beats.`,
        ...parts.map((text, i) => {
          const t0 = i * third;
          const t1 = i === parts.length - 1 ? sec : Math.min(sec, (i + 1) * third);
          return `BEAT ${i + 1} (${t0}–${t1}s): "${text.slice(0, 400)}"`;
        }),
      ].join('\n\n')
    : script.slice(0, 600);

  const subjectStyles: Record<string, string> = {
    history:   'Setting: ancient history mood — pyramids, maps, monuments. Main character: friendly cartoon pyramid mascot with big eyes.',
    geography: 'Setting: colourful world map and globe animations. Main character: friendly cartoon explorer with a magnifying glass.',
    english:   'Setting: bright classroom with books and letters. Main character: friendly cartoon owl teacher.',
    science:   'Setting: colourful science lab with beakers and atoms. Main character: friendly cartoon scientist in a lab coat.',
    math:      'Setting: bright classroom with numbers and shapes. Main character: friendly cartoon robot who loves numbers.',
  };

  const style = subjectStyles[subject.toLowerCase()] ?? 'Setting: bright colourful classroom. Main character: friendly cartoon teacher.';

  return [
    `Create a ${sec}s colorful cartoon-style animated educational video for elementary students.`,
    `Topic: ${lessonTitle}`,
    style,
    'Visual style: cartoon / soft 3D — bold colours, child-friendly, Pixar-cute.',
    beatBlock,
    `Voiceover script:\n${script.slice(0, 800)}`,
  ].join('\n\n');
}

async function pollAndDownloadSoraVideo(videoId: string): Promise<Buffer> {
  const pollMs = 8000;
  const maxWaitMs = 30 * 60 * 1000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${OPENAI_API_BASE}/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });
    const st = await res.json().catch(() => ({})) as { status?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(st?.error?.message ?? `Sora poll failed ${res.status}`);

    if (st.status === 'completed') {
      const dlRes = await fetch(`${OPENAI_API_BASE}/videos/${videoId}/content`, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        redirect: 'follow',
      });
      if (!dlRes.ok) throw new Error(`Sora download failed ${dlRes.status}`);
      return Buffer.from(await dlRes.arrayBuffer());
    }
    if (st.status === 'failed') throw new Error(st?.error?.message ?? 'Sora generation failed');
    await new Promise(r => setTimeout(r, pollMs));
  }
  throw new Error('Sora timed out after 30 minutes');
}

async function createSoraVideo(prompt: string): Promise<Buffer> {
  const sec = ['4','8','12'].includes(OPENAI_VIDEO_SECONDS) ? OPENAI_VIDEO_SECONDS : '12';
  const allowedSizes = ['720x1280','1280x720','1024x1792','1792x1024'];
  const size = allowedSizes.includes(OPENAI_VIDEO_SIZE) ? OPENAI_VIDEO_SIZE : '1280x720';

  const form = new FormData();
  form.append('model', OPENAI_VIDEO_MODEL);
  form.append('prompt', prompt.slice(0, 32000));
  form.append('seconds', sec);
  form.append('size', size);

  console.log(`[LessonVideo] Sora: submitting job (${OPENAI_VIDEO_MODEL}, ${sec}s, ${size})…`);
  const res = await fetch(`${OPENAI_API_BASE}/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const json = await res.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Sora submit failed ${res.status}`);
  const videoId = json.id;
  if (!videoId) throw new Error('Sora did not return a video id');

  const buf = await pollAndDownloadSoraVideo(videoId);
  console.log(`[LessonVideo] Sora download complete (${buf.length} bytes)`);
  return buf;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface LessonVideoResult {
  videoPath?: string;
  videoUrl: string;
  script: string;
  lessonTitle: string;
}

export async function generateLessonVideo(opts: {
  subject: string;
  lessonTitle: string;
  lessonDescription: string;
  outputFilename: string;
  preGeneratedScript?: string;
  /** When true, preGeneratedScript is used directly as the Sora visual prompt (not re-wrapped). */
  isSoraPrompt?: boolean;
  /** Spoken narration shown in UI (separate from Sora visual prompt). */
  narrationScript?: string;
  unitId?: string;
}): Promise<LessonVideoResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing in malsy-ui/.env.local');
  }
  await ensureDir(VIDEO_DIR);

  let script: string;
  let soraPrompt: string;

  if (opts.preGeneratedScript && opts.preGeneratedScript.trim()) {
    const pre = opts.preGeneratedScript.trim();
    if (opts.isSoraPrompt) {
      soraPrompt = pre;
      script = (opts.narrationScript?.trim() || pre);
      console.log(`[LessonVideo] Using RAG Sora prompt (${pre.split(/\s+/).length} words)`);
    } else {
      script = pre;
      soraPrompt = buildSoraPrompt(opts.subject, opts.lessonTitle, script);
      console.log(`[LessonVideo] Using pre-generated narration (${script.split(/\s+/).length} words)`);
    }
  } else {
    console.log(`[LessonVideo] Generating script for: ${opts.lessonTitle}`);
    script = await generateScript(opts.lessonTitle, opts.lessonDescription, opts.subject);
    soraPrompt = buildSoraPrompt(opts.subject, opts.lessonTitle, script);
    console.log(`[LessonVideo] Script ready (${script.split(/\s+/).length} words)`);
  }

  const videoBuffer = await createSoraVideo(soraPrompt);
  const meta = {
    lessonTitle: opts.lessonTitle,
    script,
    narration: opts.narrationScript?.trim() || script,
    keyConcept: opts.lessonDescription,
    unitId: opts.unitId,
    savedAt: new Date().toISOString(),
  };

  if (isSupabaseStorageConfigured()) {
    const videoUrl = await uploadLessonVideoToSupabase(opts.outputFilename, videoBuffer, meta);
    console.log(`[LessonVideo] Saved to Supabase: ${videoUrl}`);
    return { videoUrl, script, lessonTitle: opts.lessonTitle };
  }

  const outputPath = path.join(VIDEO_DIR, opts.outputFilename);
  await writeFile(outputPath, videoBuffer);
  const metaPath = outputPath.replace('.mp4', '.meta.json');
  await writeFile(metaPath, JSON.stringify(meta));
  console.log(`[LessonVideo] Saved locally: ${outputPath}`);

  return {
    videoPath: outputPath,
    videoUrl: `/api/lesson-video/${path.basename(outputPath)}`,
    script,
    lessonTitle: opts.lessonTitle,
  };
}

async function migrateLocalVideoToSupabase(filename: string): Promise<{
  ready: boolean;
  videoUrl?: string;
  script?: string;
  narration?: string;
  keyConcept?: string;
  lessonTitle?: string;
  savedAt?: string;
}> {
  const videoPath = path.join(VIDEO_DIR, filename);
  if (!existsSync(videoPath)) return { ready: false };

  const metaPath = videoPath.replace('.mp4', '.meta.json');
  let meta: Record<string, unknown> = { savedAt: new Date().toISOString() };
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(await readFile(metaPath, 'utf-8') as string) as Record<string, unknown>;
    } catch { /* ignore corrupt meta */ }
  }

  const videoBuffer = await readFile(videoPath);
  await uploadLessonVideoToSupabase(filename, videoBuffer, meta);
  console.log(`[LessonVideo] Migrated local file to Supabase: ${filename}`);
  return getLessonVideoFromSupabase(filename);
}

export async function getExistingLessonVideo(filename: string): Promise<{
  ready: boolean;
  videoUrl?: string;
  script?: string;
  narration?: string;
  keyConcept?: string;
  lessonTitle?: string;
  savedAt?: string;
}> {
  if (isSupabaseStorageConfigured()) {
    const cloud = await getLessonVideoFromSupabase(filename);
    if (cloud.ready) return cloud;

    try {
      const migrated = await migrateLocalVideoToSupabase(filename);
      if (migrated.ready) return migrated;
    } catch (err) {
      console.warn(
        '[LessonVideo] Supabase migration failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  const videoPath = path.join(VIDEO_DIR, filename);
  if (!existsSync(videoPath)) return { ready: false };

  const videoUrl = `/api/lesson-video/${path.basename(videoPath)}`;
  const metaPath = videoPath.replace('.mp4', '.meta.json');
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf-8') as string) as {
        script?: string;
        narration?: string;
        keyConcept?: string;
        lessonTitle?: string;
        savedAt?: string;
      };
      return {
        ready: true,
        videoUrl,
        script: meta.script,
        narration: meta.narration ?? meta.script,
        keyConcept: meta.keyConcept,
        lessonTitle: meta.lessonTitle,
        savedAt: meta.savedAt,
      };
    } catch { /* ignore corrupt meta */ }
  }
  return { ready: true, videoUrl };
}
