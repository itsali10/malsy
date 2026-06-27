'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { unitVideoFilename } from '../lib/unit-video';

interface SavedVideo {
  videoUrl: string;
  script: string | null;
}

type PanelPhase = 'checking' | 'ready' | 'watching' | 'generating';

export default function LessonPartVideoPanel({
  unitId,
  lessonTitle,
  videoFilename,
}: {
  unitId: string;
  lessonTitle: string;
  videoFilename?: string | null;
}) {
  const [phase, setPhase] = useState<PanelPhase>('checking');
  const [saved, setSaved] = useState<SavedVideo | null>(null);
  const [activeVideo, setActiveVideo] = useState<SavedVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filename = videoFilename ?? unitVideoFilename(unitId);

  const checkExisting = useCallback(() => {
    setPhase('checking');
    setError(null);
    return fetch(`/api/lesson-video-check?unitId=${encodeURIComponent(unitId)}`)
      .then(r => r.json())
      .then((d: { exists?: boolean; videoUrl?: string; narration?: string }) => {
        if (d.exists && d.videoUrl) {
          const entry: SavedVideo = { videoUrl: d.videoUrl, script: d.narration ?? null };
          setSaved(entry);
          return entry;
        }
        setSaved(null);
        return null;
      })
      .catch(() => {
        setSaved(null);
        return null;
      })
      .finally(() => setPhase('ready'));
  }, [unitId]);

  useEffect(() => {
    checkExisting();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [checkExisting]);

  const pollStatus = useCallback((jobId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/lesson-video-status/${jobId}`);
        const d = await r.json() as { status: string; videoUrl?: string; script?: string; error?: string };
        if (d.status === 'generating') {
          pollStatus(jobId);
        } else if (d.status === 'completed' && d.videoUrl) {
          const entry: SavedVideo = { videoUrl: d.videoUrl, script: d.script ?? null };
          setSaved(entry);
          setActiveVideo(entry);
          setPhase('watching');
          setError(null);
        } else {
          setPhase('ready');
          setError(d.error ?? 'Generation failed.');
        }
      } catch {
        setPhase('ready');
        setError('Network error while polling.');
      }
    }, 5000);
  }, []);

  async function regenerateVideo() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setPhase('generating');
    setError(null);
    setActiveVideo(null);
    try {
      const scripts: string[] = [];
      for (let part = 1; part <= 2; part++) {
        const prev = scripts.slice();
        const res = await fetch('/api/lesson-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unit_id: unitId,
            part_number: part,
            previous_scripts: prev,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data.detail === 'string' ? data.detail : `Part ${part} script failed`);
        }
        if (data.script) scripts.push(String(data.script));
      }
      const combined = scripts.join('\n\n');
      const genRes = await fetch('/api/generate-lesson-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'history',
          lessonTitle,
          lessonDescription: combined,
          outputFilename: filename,
          preGeneratedScript: combined,
          narrationScript: combined,
          unitId,
        }),
      });
      const genData = await genRes.json().catch(() => ({}));
      if (!genRes.ok || !genData.jobId) {
        throw new Error(genData.error ?? 'Failed to start video generation');
      }
      pollStatus(genData.jobId);
    } catch (err) {
      setPhase('ready');
      setError(err instanceof Error ? err.message : 'Video generation failed');
    }
  }

  function watchSaved() {
    if (!saved) return;
    setActiveVideo(saved);
    setPhase('watching');
    setError(null);
  }

  const showPlayer = phase === 'watching' && activeVideo?.videoUrl;

  return (
    <div style={{ marginBottom: 28, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(59,191,255,.2)', background: 'rgba(59,191,255,.04)' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(59,191,255,.12)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sky)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Lesson Video
        </div>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {phase === 'checking' && (
          <div style={{ fontSize: 12, color: 'var(--g4)' }}>Checking for saved video…</div>
        )}

        {phase !== 'checking' && (
          <>
            {error && (
              <div style={{ fontSize: 12, color: '#ff7070', marginBottom: 12 }}>{error}</div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: showPlayer ? 14 : 0 }}>
              {saved && (
                <button
                  type="button"
                  className="btn btn-v btn-sm"
                  onClick={watchSaved}
                  disabled={phase === 'generating'}
                >
                  Watch Saved Video
                </button>
              )}
              <button
                type="button"
                className="btn btn-o btn-sm"
                onClick={regenerateVideo}
                disabled={phase === 'generating'}
              >
                {saved ? 'Regenerate' : 'Generate Lesson Video'}
              </button>
            </div>

            {!saved && phase === 'ready' && (
              <p style={{ fontSize: 11, color: 'var(--g4)', marginTop: 10, lineHeight: 1.5 }}>
                No saved video yet. Generate one from Part 1 + Part 2 lesson scripts.
              </p>
            )}

            {phase === 'generating' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <div className="modal-spinner" style={{ width: 20, height: 20 }} />
                <span style={{ fontSize: 12, color: 'var(--g3)' }}>Generating video… this may take a few minutes.</span>
              </div>
            )}

            {showPlayer && (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  key={activeVideo.videoUrl}
                  src={activeVideo.videoUrl}
                  controls
                  autoPlay
                  style={{ width: '100%', borderRadius: 10, background: '#000', display: 'block' }}
                />
                {activeVideo.script && (
                  <p style={{ fontSize: 11, color: 'var(--g3)', marginTop: 10, lineHeight: 1.5 }}>{activeVideo.script}</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
