import { NextRequest, NextResponse } from 'next/server';
import { listLessonVideosFromSupabase, isSupabaseStorageConfigured } from '../../../lib/supabase-storage';

export const runtime = 'nodejs';

/** List saved lesson videos from Supabase in unit order (unit_01, unit_02, …). */
export async function GET(req: NextRequest) {
  const bookId = (req.nextUrl.searchParams.get('bookId') ?? '').trim() || undefined;

  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json({
      configured: false,
      videos: [],
      error: 'Supabase storage is not configured',
    });
  }

  const videos = await listLessonVideosFromSupabase(bookId);
  return NextResponse.json({ configured: true, bookId: bookId ?? null, videos });
}
