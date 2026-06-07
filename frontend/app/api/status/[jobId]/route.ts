import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getJob } from '@/lib/job-store';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = getJob(params.jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const payload: Record<string, unknown> = { status: job.status };
  if (job.videoPath)    payload.videoUrl     = `/api/video/${path.basename(job.videoPath)}`;
  if (job.script)       payload.script       = job.script;
  if (job.scriptPath)   payload.scriptUrl    = `/api/lesson-script/${path.basename(job.scriptPath)}`;
  if (job.lessonTitle)  payload.lessonTitle  = job.lessonTitle;
  if (job.quiz)         payload.quiz         = job.quiz;
  if (job.topic)        payload.topic        = job.topic;
  if (job.error)        payload.error        = job.error;
  if (job.spaceVideos)  payload.spaceVideos  = job.spaceVideos;
  if (job.planetVideos) payload.planetVideos = job.planetVideos;
  if (job.planetVideoUrl) payload.planetVideoUrl = job.planetVideoUrl;
  if (job.planetId)     payload.planetId     = job.planetId;
  if (job.singlePlanet != null) payload.singlePlanet = job.singlePlanet;
  if (job.progressStep  != null) payload.progressStep  = job.progressStep;
  if (job.progressTotal != null) payload.progressTotal = job.progressTotal;
  if (job.progressLabel) payload.progressLabel = job.progressLabel;

  return NextResponse.json(payload);
}
