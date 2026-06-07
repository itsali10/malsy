import { NextResponse } from 'next/server';
import { generateSpaceAdventureSceneVideos, getFriendlyErrorMessage } from '@/lib/video-generator';
import { setJob, updateJob } from '@/lib/job-store';

export const runtime = 'nodejs';

export async function POST() {
  const jobId = `spacejob_${Date.now()}`;
  setJob(jobId, {
    status: 'generating',
    spaceVideos: null,
    error: null,
    progressStep: 0,
    progressTotal: 5,
    progressLabel: 'Starting…',
  });

  (async () => {
    try {
      const result = await generateSpaceAdventureSceneVideos((p) => {
        updateJob(jobId, { status: 'generating', progressStep: p.step, progressTotal: p.total, progressLabel: p.label });
      });
      updateJob(jobId, {
        status: 'completed',
        spaceVideos: result.videos,
        error: null,
        progressStep: 5,
        progressTotal: 5,
        progressLabel: 'Done',
      });
    } catch (err) {
      console.error(err);
      updateJob(jobId, { status: 'failed', error: getFriendlyErrorMessage(err) });
    }
  })();

  return NextResponse.json({ jobId });
}
