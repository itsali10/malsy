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
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();

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
 * Without `text` (or before metadata) a gentle synthetic motion keeps the mouth
 * moving so the avatar never looks frozen while speaking.
 */
export function attachLipSync(el: HTMLAudioElement, text?: string): () => void {
  let alive = true;
  let raf = 0;
  let timeline: LipSyncTimeline | null = null;
  let sampleBand: ((t: number) => BandSample) | null = null;
  const t0 = performance.now();

  const build = () => {
    if (text && Number.isFinite(el.duration) && el.duration > 0) {
      timeline = buildLipSyncTimeline(text, el.duration);
    }
  };
  build();
  const onMeta = () => build();
  el.addEventListener('loadedmetadata', onMeta);
  el.addEventListener('durationchange', onMeta);

  // Wav2Lip-style: analyse the real audio so the mouth follows the sound.
  // This is best-effort — if it fails (CORS, decode error) we silently keep the
  // text-only behaviour, so lip-sync never breaks.
  const src = el.currentSrc || el.src;
  if (src) {
    void precomputeAudioBands(src).then((bands) => {
      if (alive && bands && bands.low.length) sampleBand = makeBandSampler(bands);
    });
  }

  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);

    const audible = !el.paused && !el.ended && (el.volume ?? 1) > 0;
    if (!audible) {
      dispatchSpeaking(false, 0);
      return;
    }

    if (!timeline) build();

    if (timeline) {
      const t = el.currentTime;
      const textW = visemeAtTime(timeline, t);
      // Condition the text shape on the real audio when analysis is ready.
      const band = sampleBand ? sampleBand(t) : null;
      const w = band ? applyAudioBands(textW, band) : textW;

      // Legacy frame for any morph paths that still read {aa,E,O,FF,SS,jaw}.
      const frame: VisemeFrame = {
        aa: Math.min(1, w.aa ?? 0),
        E:  Math.min(1, Math.max(w.E ?? 0, w.I ?? 0)),
        O:  Math.min(1, Math.max(w.O ?? 0, w.U ?? 0)),
        FF: Math.min(1, w.FF ?? 0),
        SS: Math.min(1, Math.max(w.SS ?? 0, w.CH ?? 0)),
        jaw: w.jaw,
      };

      const closure = Math.max(w.PP ?? 0, (w.FF ?? 0) * 0.6);
      // With audio, amplitude tracks real loudness (mouth closes in gaps);
      // closures still register so p/b/m frames press the lips.
      const amp = band
        ? Math.min(0.6, Math.max(band.energy * 0.7, closure * 0.35) + Math.max(frame.FF, frame.SS) * 0.1)
        : Math.min(0.6, frame.jaw * 0.7 + closure * 0.2 + Math.max(frame.FF, frame.SS) * 0.2);

      dispatchSpeaking(true, amp, frame, w);
    } else {
      const t = (performance.now() - t0) / 1000;
      const amp = 0.18 + 0.12 * Math.abs(Math.sin(t * 6.0)) + 0.06 * Math.sin(t * 11.0);
      dispatchSpeaking(true, Math.max(0, Math.min(0.55, amp)));
    }
  };

  raf = requestAnimationFrame(loop);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    el.removeEventListener('loadedmetadata', onMeta);
    el.removeEventListener('durationchange', onMeta);
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
