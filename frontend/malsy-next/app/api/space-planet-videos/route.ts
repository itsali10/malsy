import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { FINAL_DIR } from '@/lib/video-generator';

export const runtime = 'nodejs';

const PLANET_LEVEL_FILENAMES = [
  'mercury.mp4', 'venus.mp4', 'earth.mp4', 'mars.mp4',
  'jupiter.mp4', 'saturn.mp4', 'uranus.mp4', 'neptune.mp4',
];

export async function GET() {
  const videos: Record<string, string> = {};
  for (const fn of PLANET_LEVEL_FILENAMES) {
    const id = fn.replace('.mp4', '');
    const fp = path.join(FINAL_DIR, fn);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      videos[id] = `/api/video/${fn}`;
    }
  }
  const n = Object.keys(videos).length;
  return NextResponse.json({ videos, count: n, allReady: n === 8 });
}
