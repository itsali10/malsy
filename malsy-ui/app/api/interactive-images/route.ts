import { NextRequest, NextResponse } from 'next/server';
import {
  getInteractiveImagesFromSupabase,
  hasCompleteInteractiveImageMetadata,
  isSupabaseStorageConfigured,
  interactiveImageFilename,
  uploadInteractiveImagesToSupabase,
  type InteractiveImagesManifest,
} from '../../../lib/supabase-storage';

export const runtime = 'nodejs';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function backendImageUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchBackendManifest(
  unitId: string,
  teacherText: string,
  force: boolean,
): Promise<InteractiveImagesManifest> {
  const res = await fetch(`${API_BASE}/lesson/interactive-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unit_id: unitId, teacher_text: teacherText, force }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Backend returned ${res.status}`);
  }
  return res.json() as Promise<InteractiveImagesManifest>;
}

async function downloadImageBuffers(
  unitId: string,
  manifest: InteractiveImagesManifest,
): Promise<{ index: number; buffer: Buffer }[]> {
  const out: { index: number; buffer: Buffer }[] = [];
  for (let i = 0; i < (manifest.images ?? []).length; i++) {
    const img = manifest.images[i];
    const url = img?.image_url;
    if (!url) continue;
    const fetchUrl = url.startsWith('http') ? url : backendImageUrl(url);
    const res = await fetch(fetchUrl);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    out.push({ index: i + 1, buffer: buf });
  }
  return out;
}

async function fetchBackendSaved(unitId: string): Promise<InteractiveImagesManifest | null> {
  const res = await fetch(
    `${API_BASE}/lesson/interactive-images?unit_id=${encodeURIComponent(unitId)}`,
  );
  if (!res.ok) return null;
  const data = await res.json() as InteractiveImagesManifest & { images?: InteractiveImagesManifest['images'] };
  if (!data.images?.length) return null;
  return data;
}

/** GET — return saved interactive images from Supabase (or backend disk as fallback). */
export async function GET(req: NextRequest) {
  const unitId = (req.nextUrl.searchParams.get('unitId') ?? '').trim();
  if (!unitId) {
    return NextResponse.json({ ready: false, error: 'unitId is required' }, { status: 400 });
  }

  if (isSupabaseStorageConfigured()) {
    const cached = await getInteractiveImagesFromSupabase(unitId);
    if (cached.ready && cached.manifest) {
      return NextResponse.json({ ready: true, unitId, ...cached.manifest });
    }
  }

  // Fallback: locally saved images on the Python backend (pre-Supabase uploads).
  try {
    const local = await fetchBackendSaved(unitId);
    if (local?.images?.length) {
      if (!hasCompleteInteractiveImageMetadata(local)) {
        return NextResponse.json({ ready: false, unitId });
      }

      if (isSupabaseStorageConfigured()) {
        try {
          const buffers = await downloadImageBuffers(unitId, local);
          if (buffers.length >= 2) {
            const uploaded = await uploadInteractiveImagesToSupabase(unitId, local, buffers);
            return NextResponse.json({ ready: true, unitId, ...uploaded });
          }
        } catch (err) {
          console.warn('[interactive-images] Supabase migration upload failed:', err instanceof Error ? err.message : err);
        }
      }

      const images = (local.images ?? []).map((img, i) => ({
        ...img,
        image_url: img.image_url ? backendImageUrl(img.image_url) : null,
        filename: img.filename ?? interactiveImageFilename(unitId, i + 1),
      }));
      return NextResponse.json({ ready: true, unitId, ...local, images });
    }
  } catch {
    /* backend unavailable */
  }

  return NextResponse.json({ ready: false, unitId });
}

/** POST — generate via backend, upload to Supabase, return public URLs. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    unitId?: string;
    unit_id?: string;
    teacherText?: string;
    teacher_text?: string;
    force?: boolean;
  };

  const unitId = (body.unitId ?? body.unit_id ?? '').trim();
  const teacherText = (body.teacherText ?? body.teacher_text ?? '').trim();
  const force = Boolean(body.force);

  if (!unitId) {
    return NextResponse.json({ error: 'unitId is required' }, { status: 400 });
  }

  // 1) Supabase cache hit
  if (!force && isSupabaseStorageConfigured()) {
    const cached = await getInteractiveImagesFromSupabase(unitId);
    if (cached.ready && cached.manifest) {
      return NextResponse.json(cached.manifest);
    }
  }

  // 2) Generate on Python backend (local disk + manifest)
  let manifest: InteractiveImagesManifest;
  try {
    manifest = await fetchBackendManifest(unitId, teacherText, force);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 502 },
    );
  }

  // 3) Upload to Supabase (required when configured)
  if (isSupabaseStorageConfigured()) {
    try {
      const buffers = await downloadImageBuffers(unitId, manifest);
      if (buffers.length < 2) {
        return NextResponse.json(
          { error: 'Could not read generated images for Supabase upload' },
          { status: 502 },
        );
      }
      manifest = await uploadInteractiveImagesToSupabase(unitId, manifest, buffers);
      return NextResponse.json(manifest);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Supabase image upload failed' },
        { status: 502 },
      );
    }
  }

  // No Supabase — return backend local URLs
  const images = (manifest.images ?? []).map((img, i) => ({
    ...img,
    image_url: img.image_url ? backendImageUrl(img.image_url) : null,
    filename: img.filename ?? interactiveImageFilename(unitId, i + 1),
  }));

  return NextResponse.json({ ...manifest, images });
}
