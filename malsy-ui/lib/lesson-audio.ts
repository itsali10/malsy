export type LessonAudioState =
  | 'idle'
  | 'loading'
  | 'speaking'
  | 'transitioning'
  | 'paused'
  | 'completed';

export const AMP_THRESHOLD = 0.04;

/** Tell the avatar to (stop) lip-syncing. amplitude drives jaw opening (0..1). */
export function dispatchSpeaking(speaking: boolean, amplitude = 0): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('malsy-tts', { detail: { speaking, amplitude } }));
}

/**
 * Attach playback-gated lip-sync to an audio element.
 *
 * The mouth moves ONLY while the element is genuinely playing audible audio
 * (not paused, not ended, volume > 0). It closes immediately on pause, end,
 * loading, or transitions. We deliberately avoid the Web Audio API here: the
 * TTS audio is served cross-origin (UI :3001 ↔ backend :8000) and routing it
 * through a MediaElementSource / setting crossOrigin would taint the stream and
 * silence playback. Returns a stop function that closes the mouth.
 */
export function attachLipSync(el: HTMLAudioElement): () => void {
  let alive = true;
  let raf = 0;
  const t0 = performance.now();

  const loop = () => {
    if (!alive) return;
    const audible = !el.paused && !el.ended && el.currentTime > 0 && (el.volume ?? 1) > 0;
    if (audible) {
      const t = (performance.now() - t0) / 1000;
      // Natural jaw envelope — only ever produced WHILE audio is playing.
      const amp = 0.18 + 0.12 * Math.abs(Math.sin(t * 6.0)) + 0.06 * Math.sin(t * 11.0);
      dispatchSpeaking(true, Math.max(0, Math.min(0.5, amp)));
    } else {
      dispatchSpeaking(false, 0);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    dispatchSpeaking(false, 0);
  };
}

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
      currentTime: Math.max(0, Number(data.currentTime) || 0),
      isCompleted: Boolean(data.isCompleted),
    };
  } catch {
    return null;
  }
}

export function saveAudioProgress(progress: LessonAudioProgress): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(audioProgressKey(progress.lessonId), JSON.stringify(progress));
  } catch {
    /* quota / private mode */
  }
}

export function clearAudioProgress(lessonId: string): void {
  if (typeof window === 'undefined' || !lessonId) return;
  try {
    localStorage.removeItem(audioProgressKey(lessonId));
  } catch {
    /* ignore */
  }
}

/** Normalize lesson text and split into speakable paragraphs. */
export function paragraphsForTTS(text: string): string[] {
  const clean = text
    .replace(/\r/g, '')
    .replace(/\u2026/g, '.')
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
  // Drop empty / silence-only segments (no letters or digits to speak).
  return out.filter(p => /[a-z0-9]/i.test(p));
}
