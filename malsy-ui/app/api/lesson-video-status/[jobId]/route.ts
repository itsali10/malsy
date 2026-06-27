import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getJob } from '../../../../lib/job-store';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const job = getJob(params.jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  return NextResponse.json({
    status:     job.status,
    videoUrl:   job.videoUrl ?? (job.videoPath ? `/api/lesson-video/${path.basename(job.videoPath)}` : null),
    script:     job.script    ?? null,
    lessonTitle: job.lessonTitle ?? null,
    error:      job.error     ?? null,
  });
}
