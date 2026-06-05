import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { FINAL_DIR, HISTORY_LESSON_BASENAME } from '@/lib/video-generator';

export const runtime = 'nodejs';

const HISTORY_LESSON_MP4  = `${HISTORY_LESSON_BASENAME}.mp4`;
const HISTORY_LESSON_TXT  = `${HISTORY_LESSON_BASENAME}.txt`;
const HISTORY_LESSON_META = `${HISTORY_LESSON_BASENAME}.meta.json`;

export async function GET() {
  const videoPath = path.join(FINAL_DIR, HISTORY_LESSON_MP4);
  if (!fs.existsSync(videoPath) || !fs.statSync(videoPath).isFile()) {
    return NextResponse.json({ ready: false, videoUrl: null, scriptUrl: null, lessonTitle: null, quiz: null, script: null });
  }

  let lessonTitle: string | null = null;
  let quiz: unknown = null;
  let script: string | null = null;

  const metaPath = path.join(FINAL_DIR, HISTORY_LESSON_META);
  if (fs.existsSync(metaPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      lessonTitle = m.lessonTitle ?? null;
      quiz        = m.quiz        ?? null;
      script      = m.script      ?? null;
    } catch { /* ignore corrupt meta */ }
  }

  const txtPath = path.join(FINAL_DIR, HISTORY_LESSON_TXT);
  if (!script && fs.existsSync(txtPath)) {
    const full = fs.readFileSync(txtPath, 'utf-8').trim();
    const idx = full.indexOf('\n\n');
    if (idx > 0) {
      lessonTitle = lessonTitle || full.slice(0, idx).trim();
      script = full.slice(idx + 2).trim();
    } else {
      script = full;
    }
  }

  return NextResponse.json({
    ready: true,
    videoUrl:  `/api/video/${HISTORY_LESSON_MP4}`,
    scriptUrl: fs.existsSync(txtPath) ? `/api/lesson-script/${HISTORY_LESSON_TXT}` : null,
    lessonTitle,
    quiz,
    script,
  });
}
