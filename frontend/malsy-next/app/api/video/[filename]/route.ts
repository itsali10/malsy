import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { FINAL_DIR } from '@/lib/video-generator';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { filename: string } }
) {
  const filename = path.basename(params.filename);
  if (!filename.endsWith('.mp4') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  const filePath = path.join(FINAL_DIR, filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }
  const buf = await fs.readFile(filePath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(buf.length),
      'Accept-Ranges': 'bytes',
    },
  });
}
