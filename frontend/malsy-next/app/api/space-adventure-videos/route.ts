import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { FINAL_DIR, SPACE_HOME_LESSON_BASENAME } from '@/lib/video-generator';

export const runtime = 'nodejs';

const SPACE_ADVENTURE_FILES = [
  { key: 'intro',               filename: 'space_intro.mp4' },
  { key: 'pair_mercury_venus',  filename: 'space_pair1.mp4' },
  { key: 'pair_earth_mars',     filename: 'space_pair2.mp4' },
  { key: 'pair_jupiter_saturn', filename: 'space_pair3.mp4' },
  { key: 'pair_uranus_neptune', filename: 'space_pair4.mp4' },
];

export async function GET() {
  const videos: Record<string, string> = {};
  for (const { key, filename } of SPACE_ADVENTURE_FILES) {
    const fp = path.join(FINAL_DIR, filename);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      videos[key] = `/api/video/${filename}`;
    }
  }
  let source = 'dedicated';
  const n = Object.keys(videos).length;
  if (n === 0) {
    const homeClip = `${SPACE_HOME_LESSON_BASENAME}.mp4`;
    const homePath = path.join(FINAL_DIR, homeClip);
    if (fs.existsSync(homePath) && fs.statSync(homePath).isFile()) {
      const url = `/api/video/${homeClip}`;
      for (const { key } of SPACE_ADVENTURE_FILES) videos[key] = url;
      source = 'spaceHomeLesson';
    }
  }
  return NextResponse.json({
    videos,
    count: Object.keys(videos).length,
    allReady: n === SPACE_ADVENTURE_FILES.length && source === 'dedicated',
    source,
  });
}
