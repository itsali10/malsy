import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import {
  getLessonPathForTopic,
  loadTeachingPromptsForTopic,
  generateHistoryLessonVideo,
  SPACE_HOME_LESSON_BASENAME,
  HISTORY_LESSON_BASENAME,
  getFriendlyErrorMessage,
} from '@/lib/video-generator';
import { setJob, updateJob } from '@/lib/job-store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const topic = String((body as { topic?: string })?.topic || 'history').toLowerCase();
  if (topic !== 'history' && topic !== 'space') {
    return NextResponse.json({ error: 'Invalid topic. Use "history" or "space".' }, { status: 400 });
  }

  let lessonPath: string;
  try {
    lessonPath = getLessonPathForTopic(topic);
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || 'Invalid topic' }, { status: 400 });
  }

  const fullLessonPath = path.resolve(process.cwd(), lessonPath.replace(/^\.\//, ''));
  if (!fs.existsSync(fullLessonPath)) {
    return NextResponse.json({ error: `Lesson file missing: ${lessonPath}` }, { status: 400 });
  }

  const jobId = `job_${Date.now()}`;
  setJob(jobId, { status: 'generating', videoPath: null, error: null, topic });

  const outputBasename = topic === 'space' ? SPACE_HOME_LESSON_BASENAME : HISTORY_LESSON_BASENAME;
  const teachingPrompts = loadTeachingPromptsForTopic(topic);

  // Fire-and-forget
  (async () => {
    try {
      const result = await generateHistoryLessonVideo(lessonPath, outputBasename, { topic, teachingPrompts });
      updateJob(jobId, {
        status: 'completed',
        videoPath: result.videoPath,
        scriptPath: result.scriptPath,
        script: result.script,
        quiz: result.quiz,
        lessonTitle: result.lessonTitle,
        error: null,
        topic,
      });
    } catch (err) {
      console.error(err);
      updateJob(jobId, { status: 'failed', videoPath: null, error: getFriendlyErrorMessage(err) });
    }
  })();

  return NextResponse.json({ jobId });
}
