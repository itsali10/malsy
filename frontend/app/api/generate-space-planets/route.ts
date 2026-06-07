import { NextResponse } from 'next/server';
import { generateSpacePlanetLevelVideos, getFriendlyErrorMessage } from '@/lib/video-generator';
import { setJob, updateJob } from '@/lib/job-store';

export const runtime = 'nodejs';

export async function POST() {
  const jobId = `planetjob_${Date.now()}`;
  setJob(jobId, {
    status: 'generating',
    planetVideos: null,
    error: null,
    progressStep: 0,
    progressTotal: 8,
    progressLabel: 'Starting 8 Sora planet clips…',
  });

  (async () => {
    try {
      const result = await generateSpacePlanetLevelVideos((p) => {
        updateJob(jobId, { status: 'generating', progressStep: p.step, progressTotal: p.total, progressLabel: p.label });
      });
      updateJob(jobId, {
        status: 'completed',
        planetVideos: result.videos,
        error: null,
        progressStep: 8,
        progressTotal: 8,
        progressLabel: 'Done — all 8 planets',
      });
    } catch (err) {
      console.error(err);
      updateJob(jobId, { status: 'failed', error: getFriendlyErrorMessage(err) });
    }
  })();

  return NextResponse.json({ jobId });
}
