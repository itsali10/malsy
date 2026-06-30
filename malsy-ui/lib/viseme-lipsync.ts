/**
 * Text-driven RPM viseme lip-sync.
 *
 * The spoken text is mapped to a sequence of Ready-Player-Me style visemes
 * (aa, PP, FF, SS, …) and spread evenly across the clip duration. At any
 * playback time we return the active viseme's weights plus a jaw value.
 *
 * Key behaviours:
 *  - Bilabials (m/p/b → PP) reach FULL strength and never blend, so the lips
 *    actually meet.
 *  - The jaw is closed for silence and for closure consonants, open
 *    proportionally for vowels, slightly open for other consonants.
 */

export type RpmVisemeId =
  | 'sil' | 'PP' | 'FF' | 'TH' | 'DD' | 'kk' | 'CH'
  | 'SS' | 'nn' | 'RR' | 'aa' | 'E' | 'I' | 'O' | 'U';

export type RpmVisemeWeights = Partial<Record<RpmVisemeId, number>> & { jaw: number };

export interface VisemeKeyframe { t: number; viseme: RpmVisemeId; }
export interface LipSyncTimeline { keys: VisemeKeyframe[]; duration: number; }

const VOWELS = new Set<RpmVisemeId>(['aa', 'E', 'I', 'O', 'U']);
const ROUND  = new Set<RpmVisemeId>(['O', 'U']);
// Visemes that must fully close / press the lips — never blended into.
const CLOSURES = new Set<RpmVisemeId>(['PP']);

// Relative target strength per viseme. Closures are boosted so the lips meet
// clearly; vowels are strongest so the mouth reads as open speech.
const WEIGHT: Record<RpmVisemeId, number> = {
  sil: 0.0,
  PP: 1.0, FF: 0.85, TH: 0.7, DD: 0.6, kk: 0.6, CH: 0.8, SS: 0.85,
  nn: 0.6, RR: 0.7,
  aa: 1.0, E: 0.95, I: 0.9, O: 0.95, U: 0.9,
};

function letterToViseme(ch: string): RpmVisemeId {
  const c = ch.toLowerCase();
  // Vowels
  if (c === 'a') return 'aa';
  if (c === 'e') return 'E';
  if (c === 'i' || c === 'y') return 'I';
  if (c === 'o') return 'O';
  if (c === 'u') return 'U';
  // Bilabial closures
  if (c === 'p' || c === 'b' || c === 'm') return 'PP';
  // Labiodental fricatives
  if (c === 'f' || c === 'v') return 'FF';
  // Dental / alveolar stops
  if (c === 't' || c === 'd') return 'DD';
  // Velar stops
  if (c === 'k' || c === 'g' || c === 'q' || c === 'c') return 'kk';
  // Sibilants
  if (c === 's' || c === 'z' || c === 'x') return 'SS';
  if (c === 'j') return 'CH';
  // Nasal / liquids
  if (c === 'n') return 'nn';
  if (c === 'r') return 'RR';
  if (c === 'l' || c === 'h' || c === 'w') return 'E';
  // Other letters
  if (/[a-z]/.test(c)) return 'DD';
  // Space / digit / punctuation → silence
  return 'sil';
}

export function textToVisemes(text: string): RpmVisemeId[] {
  const out: RpmVisemeId[] = [];
  for (const ch of text) out.push(letterToViseme(ch));
  if (out.length === 0) out.push('sil');
  return out;
}

export function buildLipSyncTimeline(text: string, durationSec: number): LipSyncTimeline {
  const visemes = textToVisemes(text);
  const n = visemes.length;
  const duration = Math.max(0.001, durationSec);
  const keys: VisemeKeyframe[] = visemes.map((v, i) => ({ t: (i / n) * duration, viseme: v }));
  return { keys, duration };
}

const SILENT: RpmVisemeWeights = { jaw: 0, sil: 1 };

/** Active viseme weights (+ jaw) at a given playback time. */
export function visemeAtTime(timeline: LipSyncTimeline, t: number): RpmVisemeWeights {
  const keys = timeline.keys;
  if (!keys.length) return { ...SILENT };

  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const cur = keys[i];
  const next = keys[Math.min(keys.length - 1, i + 1)];

  const segStart = cur.t;
  const segEnd = next.t > segStart ? next.t : segStart + 0.001;
  const frac = Math.max(0, Math.min(1, (t - segStart) / (segEnd - segStart)));

  const weights: RpmVisemeWeights = { jaw: 0 };

  // Current viseme at full weight.
  const curIsClosure = CLOSURES.has(cur.viseme);
  weights[cur.viseme] = WEIGHT[cur.viseme] ?? 1;

  // Coarticulation: blend toward the next shape — but never blend a closure,
  // and never blend INTO a closure (lips must fully meet for p/b/m).
  if (!curIsClosure && !CLOSURES.has(next.viseme) && next.viseme !== cur.viseme) {
    weights[next.viseme] = (weights[next.viseme] ?? 0) + (WEIGHT[next.viseme] ?? 1) * frac * 0.5;
  }

  // Jaw opening.
  let jaw: number;
  if (cur.viseme === 'sil') {
    jaw = 0;
  } else if (VOWELS.has(cur.viseme)) {
    jaw = ROUND.has(cur.viseme) ? 0.55 : 0.75;
  } else {
    const closed = cur.viseme === 'PP' || cur.viseme === 'FF';
    jaw = closed ? 0.0 : 0.12;
  }
  weights.jaw = Math.min(0.9, jaw);

  return weights;
}

// ── Audio-driven modulation (Wav2Lip-style conditioning) ──────────
//
// Wav2Lip never trusts text timing: it drives the mouth from the audio itself
// (mel-spectrogram energy). We can't run a CNN in the browser, but we can apply
// the same *principle* with the cheap frequency bands we already compute:
//   - overall energy  → how open the mouth is (silence closes it, even mid-word)
//   - low-band (F1)   → jaw drop for open vowels
//   - high-band       → fricative / sibilant emphasis (s, sh, f)
// The text timeline still chooses *which* viseme (vowel identity + bilabial
// closures); the audio decides *how much*, so the mouth tracks the real sound.

/** One normalized (0..1) frame of the precomputed frequency bands. */
export interface BandSample {
  low: number;    // F1 energy   — open-vowel jaw drop
  mid: number;    // F2 energy   — vowel quality
  high: number;   // fricatives / sibilants
  energy: number; // overall envelope — speech loudness
}

/**
 * Modulate text-derived viseme weights by a live audio band sample.
 *
 * Bilabial closures (PP) are preserved at full strength regardless of energy,
 * so m/p/b still meet the lips. Everything else is scaled by loudness so the
 * mouth opens with the sound and relaxes in silent gaps.
 */
export function applyAudioBands(base: RpmVisemeWeights, b: BandSample): RpmVisemeWeights {
  const out: RpmVisemeWeights = { ...base };
  const e = Math.max(0, Math.min(1, b.energy));
  const hi = Math.max(0, Math.min(1, b.high));
  const lo = Math.max(0, Math.min(1, b.low));

  // Keep a bilabial closure intact — energy must never pry the lips open.
  const closure = base.PP ?? 0;

  // Energy gate: openness follows loudness instead of letter position.
  const gate = 0.3 + 0.7 * e;

  for (const v of VOWELS) {
    if (out[v] != null) out[v] = (out[v] as number) * gate;
  }

  // Jaw: blend the text's intent with the real low-band envelope.
  out.jaw = Math.min(0.9, base.jaw * gate * 0.7 + lo * 0.45);

  // High-frequency energy → emphasise fricatives / sibilants.
  if (hi > 0.18 && closure === 0) {
    out.SS = Math.max(out.SS ?? 0, hi * 0.65);
  }

  // Re-assert the closure and let it pull the jaw shut.
  if (closure > 0) {
    out.PP = closure;
    out.jaw = out.jaw * (1 - closure);
  }

  return out;
}
