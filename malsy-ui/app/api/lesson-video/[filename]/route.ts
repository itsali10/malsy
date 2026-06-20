import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { existsSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { VIDEO_DIR } from '../../../../lib/lesson-video';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { filename: string } },
) {
  const filename = path.basename(params.filename);
  if (!filename.endsWith('.mp4') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const filePath = path.join(VIDEO_DIR, filename);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const buf = await readFile(filePath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(buf.length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
