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
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('malsy-tts', { detail: { speaking, amplitude, visemes } }),
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
 * Attach lip-sync driven by real audio frequency analysis.
 *
 * `bandsPromise` (from precomputeAudioBands) provides per-window band energy.
 * While it resolves, a brief synthetic fallback keeps the mouth moving.
 * Once resolved, each rAF frame looks up the current window by el.currentTime
 * and maps the three bands onto specific viseme targets:
 *
 *  low  (100–700 Hz)  → jaw opening + open-vowel (aa/O) shapes
 *  mid  (700–2500 Hz) → front-vowel (E) shape
 *  high (2500+ Hz)    → fricative (FF/SS) shapes
 *
 * Silent gaps between words have near-zero energy in all bands, so the
 * mouth closes automatically without any special silence detection.
 */
export function attachLipSync(
  el: HTMLAudioElement,
  bandsPromise?: Promise<AudioBands | null>,
): () => void {
  let alive = true;
  let raf   = 0;
  let bands: AudioBands | null = null;
  const t0 = performance.now();

  bandsPromise?.then(b => { if (alive) bands = b; });

  // Envelope followers for smoothing (attack fast, release slow)
  let envLow = 0, envMid = 0, envHigh = 0;

  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);

    const audible =
      !el.paused && !el.ended && el.currentTime > 0 && (el.volume ?? 1) > 0;

    if (!audible) {
      envLow = envMid = envHigh = 0;
      dispatchSpeaking(false, 0);
      return;
    }

    if (bands) {
      // ── Real frequency-band lip sync ───────────────────────
      const idx = Math.min(
        Math.floor(el.currentTime * 1000 / bands.windowMs),
        bands.low.length - 1,
      );

      const rawL = bands.low[idx];
      const rawM = bands.mid[idx];
      const rawH = bands.high[idx];

      // ── Silence gate on raw values — no envelope lag ──────
      // Piper TTS has a clean noise floor, so any window with
      // total raw RMS < 0.004 is a genuine silence / word gap.
      const rawTotal = rawL + rawM + rawH;
      if (rawTotal < 0.004) {
        envLow = envMid = envHigh = 0;
        dispatchSpeaking(false, 0);
        return;
      }

      // ── Envelope follower for smooth shape transitions ─────
      // ATK fast so the mouth opens immediately with speech.
      // REL moderate so consonant dips don't snap the mouth shut,
      // but it still closes quickly enough during real word gaps.
      const ATK = 0.40;
      const REL = 0.18;
      envLow  = rawL > envLow  ? envLow  + ATK * (rawL  - envLow)  : envLow  + REL * (rawL  - envLow);
      envMid  = rawM > envMid  ? envMid  + ATK * (rawM  - envMid)  : envMid  + REL * (rawM  - envMid);
      envHigh = rawH > envHigh ? envHigh + ATK * (rawH  - envHigh) : envHigh + REL * (rawH  - envHigh);

      const envTotal = envLow + envMid + envHigh;

      // ── Jaw: proportional to total energy ─────────────────
      // Scales linearly so it is never permanently maxed out.
      // Typical Piper TTS voiced energy sum: 0.05–0.18 → jaw 0.35–0.9
      const jaw = Math.min(0.85, envTotal * 7);

      // ── Frequency ratios → shape selection ────────────────
      // Ratios cannot saturate regardless of absolute level,
      // so different phoneme types produce different shapes.
      const inv = 1 / (envTotal + 1e-6);
      const lR = envLow  * inv;   // fraction in 0–700 Hz
      const mR = envMid  * inv;   // fraction in 700–2500 Hz
      const hR = envHigh * inv;   // fraction in 2500+ Hz

      // Open vowels (ah, aw): F1 at 700–1000 Hz → mid band carries it
      const aa = jaw * Math.min(1, mR * 2.2);

      // Back / round vowels (oh, oo): low band dominant, mid low
      const O  = jaw * Math.min(0.7, lR * 2.0 * (1 - hR * 2) * (1 - mR * 0.8));

      // Front / close vowels (ee, ih): low dominant, not fricative
      const E  = jaw * Math.min(0.8, lR * 1.8 * (1 - hR * 3));

      // Fricatives / sibilants: high fraction is large
      const FF = Math.min(0.7, hR * 3.0);
      const SS = Math.min(0.8, hR * 4.0);

      const amp = Math.min(0.6, jaw * 0.75);

      dispatchSpeaking(true, amp, { aa, E, O, FF, SS, jaw });
    } else {
      // ── Synthetic fallback while bands are still loading ──
      const t = (performance.now() - t0) / 1000;
      const amp = 0.18 + 0.12 * Math.abs(Math.sin(t * 6.0)) + 0.06 * Math.sin(t * 11.0);
      dispatchSpeaking(true, Math.max(0, Math.min(0.55, amp)));
    }
  };

  raf = requestAnimationFrame(loop);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
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
