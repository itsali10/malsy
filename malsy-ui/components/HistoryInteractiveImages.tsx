'use client';

import { useEffect, useState } from 'react';
import { api, InteractiveImageCard } from '../lib/api';

function imageSrc(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  return `${base}${url}`;
}

function InteractiveCard({
  card,
  selected,
  onSelect,
}: {
  card: InteractiveImageCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const src = imageSrc(card.image_url);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: 'left',
        width: '100%',
        borderRadius: 16,
        border: `1.5px solid ${selected ? 'rgba(0,229,160,.45)' : 'rgba(255,255,255,.1)'}`,
        background: selected ? 'rgba(0,229,160,.08)' : 'rgba(255,255,255,.04)',
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all .2s',
        boxShadow: selected ? '0 0 24px rgba(0,229,160,.12)' : 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16/10', background: 'rgba(0,0,0,.25)' }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={card.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 48, background: 'linear-gradient(135deg,rgba(91,33,245,.2),rgba(59,191,255,.15))',
          }}>
            🏛️
          </div>
        )}
        <div style={{
          position: 'absolute', left: 12, bottom: 12,
          padding: '6px 12px', borderRadius: 99,
          background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)',
          fontSize: 11, fontWeight: 700, color: 'var(--w)',
        }}>
          {card.tap_label}
        </div>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--w)', marginBottom: 4 }}>{card.title}</div>
        {card.description && (
          <div style={{ fontSize: 12, color: 'var(--g3)', marginBottom: 10, lineHeight: 1.5 }}>{card.description}</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(card.labels || []).map((label) => (
            <span
              key={label}
              style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                padding: '4px 10px', borderRadius: 99,
                background: selected ? 'rgba(0,229,160,.15)' : 'rgba(91,33,245,.15)',
                color: selected ? 'var(--mint)' : 'var(--vl)',
                border: `1px solid ${selected ? 'rgba(0,229,160,.25)' : 'rgba(91,33,245,.25)'}`,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

export default function HistoryInteractiveImages({
  unitId,
  teacherText,
}: {
  unitId: string;
  teacherText: string;
}) {
  const [images, setImages] = useState<InteractiveImageCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(0);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!unitId) return;
    let cancelled = false;
    setLoadingSaved(true);

    api.lesson.interactiveImagesSaved(unitId)
      .then((res) => {
        if (cancelled) return;
        const saved = res.images?.slice(0, 2) ?? [];
        if (saved.length > 0) setImages(saved);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });

    return () => { cancelled = true; };
  }, [unitId]);

  const loadImages = async (force = false) => {
    if (!unitId || !teacherText.trim() || loading) return;
    setRequested(true);
    setLoading(true);
    setError('');

    try {
      const res = await api.lesson.interactiveImages(unitId, teacherText, force);
      setImages(res.images?.slice(0, 2) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load interactive images');
    } finally {
      setLoading(false);
    }
  };

  if (!teacherText.trim()) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--amber)' }}>
            Interactive Images
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {images.length === 0 && !loading && !loadingSaved && (
            <button
              type="button"
              onClick={() => loadImages(false)}
              style={{
                padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, var(--amber), #ff8c00)',
                color: '#1a1200', fontSize: 12, fontWeight: 800,
              }}
            >
              Create interactive images
            </button>
          )}
          {images.length > 0 && !loading && (
            <button
              type="button"
              onClick={() => loadImages(true)}
              style={{
                padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
                color: 'var(--g2)', fontSize: 12, fontWeight: 700,
              }}
            >
              Regenerate
            </button>
          )}
        </div>
      </div>

      {(loading || loadingSaved) && images.length === 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '24px 20px',
          borderRadius: 16, border: '1px solid rgba(255,184,48,.2)', background: 'rgba(255,184,48,.06)',
        }}>
          <div className="modal-spinner" style={{ width: 22, height: 22 }} />
          <span style={{ fontSize: 13, color: 'var(--g3)' }}>
            {loading ? 'Creating pictures from your lesson…' : 'Loading saved pictures…'}
          </span>
        </div>
      )}

      {loading && images.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', marginBottom: 16,
          borderRadius: 16, border: '1px solid rgba(255,184,48,.2)', background: 'rgba(255,184,48,.06)',
        }}>
          <div className="modal-spinner" style={{ width: 22, height: 22 }} />
          <span style={{ fontSize: 13, color: 'var(--g3)' }}>Regenerating pictures…</span>
        </div>
      )}

      {!loading && error && requested && (
        <div style={{ fontSize: 12, color: 'var(--g4)', padding: '12px 0' }}>{error}</div>
      )}

      {!loading && images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {images.map((card, i) => (
            <InteractiveCard
              key={card.id || i}
              card={card}
              selected={selected === i}
              onSelect={() => setSelected(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
