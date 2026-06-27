import { NextRequest, NextResponse } from 'next/server';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    unit_id?: string;
    part_number?: number;
    previous_scripts?: string[];
  };
  const unit_id = String(body.unit_id ?? '').trim();
  const part_number = Math.max(1, Number(body.part_number ?? 1));
  const previous_scripts = Array.isArray(body.previous_scripts)
    ? body.previous_scripts.filter((s) => typeof s === 'string' && s.trim())
    : [];

  if (!unit_id) {
    return NextResponse.json({ detail: 'unit_id is required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/lesson/script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id, part_number, previous_scripts }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : 'Failed to generate lesson script';
      return NextResponse.json({ detail }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[lesson-script]', err);
    return NextResponse.json(
      { detail: 'Could not reach the backend. Make sure the API server is running on port 8000.' },
      { status: 502 },
    );
  }
}
