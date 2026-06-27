import { NextRequest, NextResponse } from 'next/server';
import { setJob, updateJob } from '../../../lib/job-store';
import { generateLessonVideo, friendlyError } from '../../../lib/lesson-video';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    subject?: string;
    lessonTitle?: string;
    lessonDescription?: string;
    outputFilename?: string;
    preGeneratedScript?: string;
    isSoraPrompt?: boolean;
    narrationScript?: string;
    unitId?: string;
  };

  const subject             = String(body.subject             ?? 'history').toLowerCase();
  const lessonTitle         = String(body.lessonTitle         ?? 'Lesson').trim();
  const lessonDescription   = String(body.lessonDescription   ?? '').trim();
  const outputFilename      = String(body.outputFilename      ?? `${subject}_lesson.mp4`).replace(/[^a-z0-9_.-]/gi, '_');
  const preGeneratedScript  = body.preGeneratedScript?.trim() ?? '';
  const isSoraPrompt        = Boolean(body.isSoraPrompt);
  const narrationScript     = body.narrationScript?.trim() ?? '';
  const unitId                = body.unitId?.trim() ?? '';

  if (!lessonTitle) {
    return NextResponse.json({ error: 'lessonTitle is required' }, { status: 400 });
  }

  const jobId = `job_${Date.now()}`;
  setJob(jobId, { status: 'generating', topic: subject });

  // Fire-and-forget — Sora can take several minutes
  (async () => {
    try {
      const result = await generateLessonVideo({
        subject,
        lessonTitle,
        lessonDescription,
        outputFilename,
        preGeneratedScript,
        isSoraPrompt,
        narrationScript,
        unitId,
      });
      updateJob(jobId, {
        status: 'completed',
        videoPath: result.videoPath ?? null,
        videoUrl: result.videoUrl,
        script: narrationScript || result.script,
        lessonTitle: result.lessonTitle,
      });
    } catch (err) {
      console.error('[generate-lesson-video]', err);
      updateJob(jobId, { status: 'failed', error: friendlyError(err) });
    }
  })();

  return NextResponse.json({ jobId });
}
