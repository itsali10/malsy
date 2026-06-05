import { NextRequest, NextResponse } from 'next/server';
import { generateOneSpacePlanetVideo, getFriendlyErrorMessage } from '@/lib/video-generator';
import { setJob, updateJob } from '@/lib/job-store';

export const runtime = 'nodejs';

const VALID_PLANET_IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const planetId = String((body as { planetId?: string })?.planetId || '').toLowerCase();
  if (!VALID_PLANET_IDS.includes(planetId)) {
    return NextResponse.json(
      { error: `Invalid planetId. Use one of: ${VALID_PLANET_IDS.join(', ')}` },
      { status: 400 }
    );
  }

  const jobId = `planet1_${Date.now()}`;
  const label = planetId.charAt(0).toUpperCase() + planetId.slice(1);
  setJob(jobId, {
    status: 'generating',
    error: null,
    progressLabel: `Sora: ${label}`,
    planetId,
    singlePlanet: true,
  });

  (async () => {
    try {
      const result = await generateOneSpacePlanetVideo(planetId);
      updateJob(jobId, {
        status: 'completed',
        planetId: result.planetId,
        planetVideoUrl: result.videoUrl,
        singlePlanet: true,
        progressLabel: 'Done',
      });
    } catch (err) {
      console.error(err);
      updateJob(jobId, { status: 'failed', error: getFriendlyErrorMessage(err), planetId, singlePlanet: true });
    }
  })();

  return NextResponse.json({ jobId });
}
