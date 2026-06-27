import { NextRequest, NextResponse } from 'next/server';
import { getExistingLessonVideo, unitVideoFilename } from '../../../lib/lesson-video';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const unitId = (req.nextUrl.searchParams.get('unitId') ?? '').trim();
  if (!unitId) {
    return NextResponse.json({ exists: false, error: 'unitId is required' }, { status: 400 });
  }

  const filename = unitVideoFilename(unitId);
  const existing = await getExistingLessonVideo(filename);

  if (!existing.ready) {
    return NextResponse.json({ exists: false, unitId, filename });
  }

  return NextResponse.json({
    exists: true,
    unitId,
    filename,
    videoUrl: existing.videoUrl,
    narration: existing.narration ?? existing.script ?? '',
    keyConcept: existing.keyConcept ?? '',
    lessonTitle: existing.lessonTitle ?? '',
    savedAt: existing.savedAt ?? null,
  });
}
