import {
  buildLipSyncTimeline,
  visemeAtTime,
  applyAudioBands,
  type LipSyncTimeline,
  type RpmVisemeWeights,
  type BandSample,
} from './viseme-lipsync';

export type LessonAudioState =
  | 'idle'
  | 'loading'
  | 'speaking'
  | 'transitioning'
  | 'paused'
  | 'completed';

export const AMP_THRESHOLD = 0.02;

// ── Viseme frame dispatched to the avatar ────────────────────────
export interface VisemeFrame {
  aa: number;   // open vowel  — jaw wide open
  E:  number;   // front vowel — spread lips, mid-open
  O:  number;   // round vowel — rounded lips
  FF: number;   // fricative   — upper teeth on lower lip
  SS: number;   // sibilant    — narrow teeth gap
  jaw: number;  // overall jaw opening (blend control)
}

export function dispatchSpeaking(
  speaking: boolean,
  amplitude = 0,
  visemes?: Partial<VisemeFrame>,
  rpm?: RpmVisemeWeights,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('malsy-tts', { detail: { speaking, amplitude, visemes, rpm } }),
  );
}

// ── Audio element helpers (TTS playback) ─────────────────────────

const AUDIO_LOAD_TIMEOUT_MS = 30_000;

/** Build an absolute URL for a TTS static path or passthrough absolute URL. */
export function resolveTtsAudioUrl(audioUrl: string, apiBase?: string): string {
  const fallback = 'http://localhost:8000';
  const rawBase = apiBase ?? process.env.NEXT_PUBLIC_API_URL ?? fallback;
  const base = (rawBase.trim() || fallback).replace(/\/$/, '');
  const trimmed = audioUrl?.trim() ?? '';
  if (!trimmed) return '';
  if (/^(https?:|blob:)/i.test(trimmed)) return trimmed;
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

/** HEAD probe — 200/304 means the clip exists; 404 means stale/missing file. */
export async function verifyTtsAudioUrl(src: string): Promise<'ok' | 'missing' | 'unknown'> {
  if (!src) return 'missing';
  try {
    const resp = await fetch(src, { method: 'HEAD', mode: 'cors', cache: 'no-cache' });
    if (resp.ok || resp.status === 304) return 'ok';
    if (resp.status === 404) return 'missing';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Load a TTS clip into an Audio element and wait until it can play.
 * Browser cache hits (HTTP 304) are handled by the media loader — not fetch().
 */
export function prepareAudioElement(src: string, startTime = 0): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('[audio] empty src'));
      return;
    }

    const el = new Audio();
    el.preload = 'auto';
    el.volume = 1;
    el.muted = false;
    el.crossOrigin = 'anonymous';

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const applySeek = () => {
      if (startTime <= 0) return;
      try {
        if (Number.isFinite(el.duration) && startTime < el.duration) {
          el.currentTime = startTime;
        }
      } catch {
        /* seek before metadata — ignore */
      }
    };

    const onReady = () => {
      applySeek();
      finish(() => resolve(el));
    };

    const onError = () => {
      const code = el.error?.code;
      const message = el.error?.message ?? 'unknown';
      finish(() => reject(new Error(`[audio] load error code=${code} message=${message} src=${src}`)));
    };

    const onCanPlayFallback = () => {
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onReady();
    };

    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener('canplaythrough', onReady);
      el.removeEventListener('canplay', onCanPlayFallback);
      el.removeEventListener('loadeddata', onCanPlayFallback);
      el.removeEventListener('error', onError);
    };

    el.addEventListener('canplaythrough', onReady, { once: true });
    el.addEventListener('canplay', onCanPlayFallback, { once: true });
    el.addEventListener('loadeddata', onCanPlayFallback, { once: true });
    el.addEventListener('error', onError, { once: true });

    const timer = setTimeout(() => {
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        console.warn('[audio] load timeout — playing with readyState', el.readyState, src);
        onReady();
      } else {
        finish(() =>
          reject(new Error(`[audio] load timeout readyState=${el.readyState} src=${src}`)),
        );
      }
    }, AUDIO_LOAD_TIMEOUT_MS);

    console.debug('[audio] loading', { src, startTime });
    el.src = src;
  });
}

/** Load then call play() — surfaces autoplay / decode errors to the caller. */
export async function playAudioSrc(src: string, startTime = 0): Promise<HTMLAudioElement> {
  const el = await prepareAudioElement(src, startTime);
  console.debug('[audio] play()', {
    src,
    volume: el.volume,
    muted: el.muted,
    readyState: el.readyState,
    duration: Number.isFinite(el.duration) ? el.duration : null,
  });
  try {
    await el.play();
  } catch (err) {
    const name = err instanceof DOMException ? err.name : (err instanceof Error ? err.name : 'Error');
    console.error('[audio] play() rejected', { src, name, err, volume: el.volume, muted: el.muted });
    throw err;
  }
  return el;
}

async function fetchAudioArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  // Lip-sync analysis only — 304 Not Modified means the browser cache has the file.
  const resp = await fetch(url, { mode: 'cors', cache: 'default' });
  if (resp.ok) return resp.arrayBuffer();
  if (resp.status === 304) {
    const cached = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (cached.ok) return cached.arrayBuffer();
    console.debug('[audio-bands] 304 with empty body — skipping band analysis', url);
    return null;
  }
  console.debug('[audio-bands] fetch failed', resp.status, url);
  return null;
}

// ── Pre-computed frequency-band data ────────────────────────────

export interface AudioBands {
  low:  Float32Array;  // RMS 100–700 Hz  (F1 formant, open vowels)
  mid:  Float32Array;  // RMS 700–2500 Hz (F2 formant, vowel quality)
  high: Float32Array;  // RMS 2500+ Hz    (fricatives, sibilants)
  windowMs: number;
}

/**
 * Fetch the audio, split it into three frequency bands via IIR low-pass
 * filters, and compute per-window RMS for each band.
 *
 * Two cascaded first-order IIR LP filters (fc = 700 Hz and 2500 Hz) give
 * -12 dB/oct rolloff — enough to separate vowel formants from fricatives.
 * All computation is done on the decoded PCM; no real-time audio API needed.
 */
export async function precomputeAudioBands(
  url: string,
  windowMs = 40,
): Promise<AudioBands | null> {
  if (typeof window === 'undefined') return null;
  try {
    const buf = await fetchAudioArrayBuffer(url);
    if (!buf || buf.byteLength === 0) return null;

    const dummyCtx = new OfflineAudioContext(1, 1, 22050);
    const decoded  = await dummyCtx.decodeAudioData(buf);
    const samples  = decoded.getChannelData(0);
    const sr       = decoded.sampleRate;

    // ── IIR low-pass coefficients ─────────────────────────────
    const a1 = 1 - Math.exp(-2 * Math.PI * 700  / sr);
    const a2 = 1 - Math.exp(-2 * Math.PI * 2500 / sr);

    // Run two cascaded first-order LP filters (cascade = steeper rolloff)
    const lp700  = new Float32Array(samples.length);
    const lp2500 = new Float32Array(samples.length);
    let y1a = 0, y1b = 0, y2a = 0, y2b = 0;

    for (let i = 0; i < samples.length; i++) {
      // First-order LP at 700 Hz (cascaded twice → -12 dB/oct)
      y1a += a1 * (samples[i] - y1a);
      y1b += a1 * (y1a - y1b);
      lp700[i] = y1b;

      // First-order LP at 2500 Hz (cascaded twice)
      y2a += a2 * (samples[i] - y2a);
      y2b += a2 * (y2a - y2b);
      lp2500[i] = y2b;
    }

    // ── Per-window RMS for each band ──────────────────────────
    const winSamples = Math.max(1, Math.floor(sr * windowMs / 1000));
    const n = Math.ceil(samples.length / winSamples);
    const low  = new Float32Array(n);
    const mid  = new Float32Array(n);
    const high = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const s = i * winSamples;
      const e = Math.min(s + winSamples, samples.length);
      const len = e - s;
      let sumL = 0, sumM = 0, sumH = 0;

      for (let j = s; j < e; j++) {
        const l = lp700[j];
        const m = lp2500[j] - lp700[j];
        const h = samples[j]  - lp2500[j];
        sumL += l * l;
        sumM += m * m;
        sumH += h * h;
      }

      low[i]  = Math.sqrt(sumL / len);
      mid[i]  = Math.sqrt(sumM / len);
      high[i] = Math.sqrt(sumH / len);
    }

    return { low, mid, high, windowMs };
  } catch {
    return null;
  }
}

/**
 * Build a sampler that returns the normalized (0..1) band energies at a given
 * playback time. Normalization is per-clip (relative to each band's peak), so
 * the same rules work for loud and quiet recordings — the audio analogue of
 * Wav2Lip normalizing its mel input before inference.
 */
export function makeBandSampler(bands: AudioBands): (t: number) => BandSample {
  const n = bands.low.length;
  const env = new Float32Array(n);
  let peakEnv = 1e-6, peakLow = 1e-6, peakMid = 1e-6, peakHigh = 1e-6;

  for (let i = 0; i < n; i++) {
    const e = Math.hypot(bands.low[i], bands.mid[i], bands.high[i]);
    env[i] = e;
    if (e > peakEnv)            peakEnv  = e;
    if (bands.low[i]  > peakLow)  peakLow  = bands.low[i];
    if (bands.mid[i]  > peakMid)  peakMid  = bands.mid[i];
    if (bands.high[i] > peakHigh) peakHigh = bands.high[i];
  }

  const winMs = bands.windowMs || 40;

  return (t: number): BandSample => {
    const idx = Math.floor((t * 1000) / winMs);
    const i = Math.max(0, Math.min(n - 1, idx));
    return {
      low:    bands.low[i]  / peakLow,
      mid:    bands.mid[i]  / peakMid,
      high:   bands.high[i] / peakHigh,
      energy: env[i]        / peakEnv,
    };
  };
}

/**
 * Attach text-driven RPM viseme lip-sync to an audio element.
 *
 * We map the spoken `text` to a viseme timeline spread across the clip's real
 * duration. Each frame we look up the active viseme at `el.currentTime` and
 * dispatch its RPM weights (+ a legacy {aa,E,O,FF,SS,jaw} frame for the avatar).
 *
 * Bilabials (m/p/b) reach full-strength PP shape (lips meet) and the jaw is
 * closed; fricatives nearly close; word gaps / silence close the mouth.
 *
 * Without `text` (or before metadata) the mouth stays closed until the clip
 * is ready — no synthetic motion during silence.
 */
export function attachLipSync(el: HTMLAudioElement, text?: string): () => void {
  let alive = true;
  let raf = 0;
  let timeline: LipSyncTimeline | null = null;
  let sampleBand: ((t: number) => BandSample) | null = null;
  /** True while the element is actively playing (play/playing → pause/ended). */
  let playing = false;

  const build = () => {
    if (text && Number.isFinite(el.duration) && el.duration > 0) {
      timeline = buildLipSyncTimeline(text, el.duration);
    }
  };
  build();

  const onPlay = () => {
    playing = true;
  };
  const onStop = () => {
    playing = false;
    dispatchSpeaking(false, 0);
  };

  el.addEventListener('play', onPlay);
  el.addEventListener('playing', onPlay);
  el.addEventListener('pause', onStop);
  el.addEventListener('ended', onStop);
  el.addEventListener('loadedmetadata', build);
  el.addEventListener('durationchange', build);

  // Analyse the same WAV/URL the AudioSource plays (Oculus OVRLipSync pattern:
  // one clip drives both playback and mouth shape).
  const src = el.currentSrc || el.src;
  if (src) {
    void precomputeAudioBands(src).then((bands) => {
      if (alive && bands && bands.low.length) sampleBand = makeBandSampler(bands);
    });
  }

  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);

    const audible = playing && !el.paused && !el.ended;
    if (!audible) {
      return;
    }

    if (!timeline) build();
    if (!timeline) {
      // Wait for metadata — do not animate during silence or before audio is ready.
      dispatchSpeaking(false, 0);
      return;
    }

    const t = el.currentTime;
    const textW = visemeAtTime(timeline, t);
    const band = sampleBand ? sampleBand(t) : null;

    // Close mouth on silent gaps in the real waveform (even mid-word in the text timeline).
    if (band && band.energy < 0.06) {
      dispatchSpeaking(false, 0);
      return;
    }

    const w = band ? applyAudioBands(textW, band) : textW;

    const frame: VisemeFrame = {
      aa: Math.min(1, w.aa ?? 0),
      E:  Math.min(1, Math.max(w.E ?? 0, w.I ?? 0)),
      O:  Math.min(1, Math.max(w.O ?? 0, w.U ?? 0)),
      FF: Math.min(1, w.FF ?? 0),
      SS: Math.min(1, Math.max(w.SS ?? 0, w.CH ?? 0)),
      jaw: w.jaw,
    };

    const closure = Math.max(w.PP ?? 0, (w.FF ?? 0) * 0.6);
    const amp = band
      ? Math.min(0.6, Math.max(band.energy * 0.7, closure * 0.35) + Math.max(frame.FF, frame.SS) * 0.1)
      : Math.min(0.6, frame.jaw * 0.7 + closure * 0.2 + Math.max(frame.FF, frame.SS) * 0.2);

    if (amp < AMP_THRESHOLD && !closure) {
      dispatchSpeaking(false, 0);
      return;
    }

    dispatchSpeaking(true, amp, frame, w);
  };

  raf = requestAnimationFrame(loop);

  return () => {
    alive = false;
    playing = false;
    cancelAnimationFrame(raf);
    el.removeEventListener('play', onPlay);
    el.removeEventListener('playing', onPlay);
    el.removeEventListener('pause', onStop);
    el.removeEventListener('ended', onStop);
    el.removeEventListener('loadedmetadata', build);
    el.removeEventListener('durationchange', build);
    dispatchSpeaking(false, 0);
  };
}

// ── Progress persistence ─────────────────────────────────────────

export interface LessonAudioProgress {
  lessonId: string;
  currentParagraphIndex: number;
  currentTime: number;
  isCompleted: boolean;
}

export function audioProgressKey(lessonId: string): string {
  return `malsy_history_audio_progress_${lessonId}`;
}

export function loadAudioProgress(lessonId: string): LessonAudioProgress | null {
  if (typeof window === 'undefined' || !lessonId) return null;
  try {
    const raw = localStorage.getItem(audioProgressKey(lessonId));
    if (!raw) return null;
    const data = JSON.parse(raw) as LessonAudioProgress;
    if (data.lessonId !== lessonId) return null;
    return {
      lessonId,
      currentParagraphIndex: Math.max(0, Number(data.currentParagraphIndex) || 0),
      currentTime:           Math.max(0, Number(data.currentTime) || 0),
      isCompleted:           Boolean(data.isCompleted),
    };
  } catch {
    return null;
  }
}

export function saveAudioProgress(progress: LessonAudioProgress): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(audioProgressKey(progress.lessonId), JSON.stringify(progress));
  } catch { /* quota / private mode */ }
}

export function clearAudioProgress(lessonId: string): void {
  if (typeof window === 'undefined' || !lessonId) return;
  try {
    localStorage.removeItem(audioProgressKey(lessonId));
  } catch { /* ignore */ }
}

/** Normalize lesson text and split into speakable paragraphs. */
export function paragraphsForTTS(text: string): string[] {
  const clean = text
    .replace(/\r/g, '')
    .replace(/…/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim();

  let paras = clean
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  if (paras.length <= 1) {
    paras = clean.split(/\n/).map(p => p.trim()).filter(Boolean);
  }

  const MAX = 600;
  const out: string[] = [];
  for (let p of paras) {
    if (!/[.!?]["')\]]?$/.test(p)) p += '.';
    if (p.length <= MAX) {
      out.push(p);
      continue;
    }
    const sentences = p.match(/[^.!?]+[.!?]+["')\]]?/g) ?? [p];
    let buf = '';
    for (const sRaw of sentences) {
      const s = sRaw.trim();
      if (!s) continue;
      if (buf && buf.length + s.length + 1 > MAX) {
        out.push(buf);
        buf = s;
      } else {
        buf = buf ? `${buf} ${s}` : s;
      }
    }
    if (buf) out.push(buf);
  }
  return out.filter(p => /[a-z0-9]/i.test(p));
}
