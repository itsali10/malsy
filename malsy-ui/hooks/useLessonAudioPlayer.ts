'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  attachLipSync,
  clearAudioProgress,
  dispatchSpeaking,
  loadAudioProgress,
  paragraphsForTTS,
  prepareAudioElement,
  resolveTtsAudioUrl,
  verifyTtsAudioUrl,
  saveAudioProgress,
  type LessonAudioProgress,
  type LessonAudioState,
} from '../lib/lesson-audio';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

// Pause lengths between segments (ms). Never exceed MAX_PAUSE_MS.
const PARAGRAPH_PAUSE_MS = 750;   // 600–900 ms
const MAX_PAUSE_MS = 1200;

function clampPause(ms: number): number {
  if (ms > MAX_PAUSE_MS) {
    console.warn(`[lesson-audio] pauseDuration ${ms}ms > ${MAX_PAUSE_MS}ms — clamped`);
    return MAX_PAUSE_MS;
  }
  return Math.max(0, ms);
}

export function useLessonAudioPlayer(lessonId: string, teacherText: string) {
  const [audioState, setAudioState] = useState<LessonAudioState>('idle');
  const [ttsError, setTtsError] = useState('');
  const [hasSavedProgress, setHasSavedProgress] = useState(false);
  // Whiteboard sync: which paragraph is being read and how far through it.
  const [segments, setSegments] = useState<string[]>([]);
  const [currentSegment, setCurrentSegment] = useState(-1);
  const [segmentProgress, setSegmentProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(0);
  const pauseRef = useRef<(() => void) | null>(null);
  const paragraphIndexRef = useRef(0);
  const currentTimeRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const urlCacheRef = useRef<Map<number, Promise<string | null>>>(new Map());
  const lastSaveRef = useRef(0);

  const setState = useCallback((s: LessonAudioState) => {
    setAudioState(s);
    console.debug(`[lesson-audio] audioState=${s} avatarState=${s} segment=${paragraphIndexRef.current}`);
  }, []);

  const persistProgress = useCallback((patch: Partial<LessonAudioProgress>) => {
    if (!lessonId) return;
    const next: LessonAudioProgress = {
      lessonId,
      currentParagraphIndex: patch.currentParagraphIndex ?? paragraphIndexRef.current,
      currentTime: patch.currentTime ?? currentTimeRef.current,
      isCompleted: patch.isCompleted ?? false,
    };
    saveAudioProgress(next);
    setHasSavedProgress(!next.isCompleted && (next.currentParagraphIndex > 0 || next.currentTime > 0));
  }, [lessonId]);

  useEffect(() => {
    if (!lessonId) { setHasSavedProgress(false); return; }
    const saved = loadAudioProgress(lessonId);
    if (!saved) { setHasSavedProgress(false); return; }
    paragraphIndexRef.current = saved.currentParagraphIndex;
    currentTimeRef.current = saved.currentTime;
    setHasSavedProgress(!saved.isCompleted && (saved.currentParagraphIndex > 0 || saved.currentTime > 0));
    if (saved.isCompleted) setAudioState('completed');
  }, [lessonId, teacherText]);

  useEffect(() => {
    const chunks = paragraphsForTTS(teacherText);
    chunksRef.current = chunks;
    setSegments(chunks);
    setCurrentSegment(-1);
    setSegmentProgress(0);
    urlCacheRef.current.clear();
  }, [teacherText]);

  // Returns a memoized promise so each paragraph is generated only once.
  const fetchChunkUrl = useCallback((index: number, bust = false): Promise<string | null> => {
    if (bust) urlCacheRef.current.delete(index);
    const cached = urlCacheRef.current.get(index);
    if (cached && !bust) return cached;
    const chunks = chunksRef.current;
    if (index >= chunks.length) return Promise.resolve(null);
    const p = api.tts
      .speak(chunks[index])
      .then(({ audio_url }) => {
        const url = resolveTtsAudioUrl(audio_url, API_BASE);
        console.debug('[lesson-audio] tts url', { index, url });
        return url;
      })
      .catch((err) => {
        console.error('[lesson-audio] tts speak failed', { index, err });
        return null;
      });
    urlCacheRef.current.set(index, p);
    return p;
  }, []);

  /** Resolve a paragraph audio URL; regenerate once if the static file 404s. */
  const resolveChunkSrc = useCallback(async (index: number, token: number): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (token !== sessionRef.current) return null;
      const src = await fetchChunkUrl(index, attempt > 0);
      if (!src) return null;
      const probe = await verifyTtsAudioUrl(src);
      if (probe === 'ok') return src;
      if (probe === 'missing') {
        console.warn('[lesson-audio] audio file 404 — regenerating TTS', { index, src, attempt });
        continue;
      }
      // Network/CORS probe failed — still try HTMLAudio playback.
      return src;
    }
    return null;
  }, [fetchChunkUrl]);

  const sleep = useCallback((ms: number, token: number) => {
    return new Promise<void>((resolve) => {
      const id = setTimeout(resolve, clampPause(ms));
      // If a new session starts, resolve early so we don't linger.
      const check = setInterval(() => {
        if (token !== sessionRef.current) { clearTimeout(id); clearInterval(check); resolve(); }
      }, 50);
      setTimeout(() => clearInterval(check), clampPause(ms) + 60);
    });
  }, []);

  const playElement = useCallback(
    async (
      src: string,
      token: number,
      startTime: number,
      text?: string,
    ): Promise<'ended' | 'paused' | 'aborted' | 'error'> => {
      if (token !== sessionRef.current) return 'aborted';

      let el: HTMLAudioElement;
      let stopLipSync: (() => void) | null = null;
      try {
        el = await prepareAudioElement(src, startTime);
        // Same AudioSource drives playback and lip sync (before play() starts).
        stopLipSync = attachLipSync(el, text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[lesson-audio] audio load failed', { src, err });
        if (msg.includes('404')) {
          setTtsError('Audio file not found. Click Read Aloud to try again.');
        } else {
          setTtsError('Could not load lesson audio.');
        }
        dispatchSpeaking(false, 0);
        return 'error';
      }

      if (token !== sessionRef.current) {
        stopLipSync?.();
        return 'aborted';
      }

      audioRef.current = el;

      let progressRaf = 0;

      const startProgressLoop = () => {
        if (progressRaf) return;
        const tick = () => {
          if (token !== sessionRef.current) return;
          const d = el.duration;
          if (Number.isFinite(d) && d > 0) {
            setSegmentProgress(Math.min(1, el.currentTime / d));
          }
          progressRaf = requestAnimationFrame(tick);
        };
        progressRaf = requestAnimationFrame(tick);
      };

      const syncProgressToAudio = () => {
        const d = el.duration;
        if (Number.isFinite(d) && d > 0) {
          setSegmentProgress(Math.min(1, el.currentTime / d));
        }
      };

      if (Number.isFinite(el.duration) && el.duration > 0 && startTime > 0) {
        syncProgressToAudio();
      }

      try {
        console.debug('[lesson-audio] play()', {
          src,
          volume: el.volume,
          muted: el.muted,
          readyState: el.readyState,
        });
        await el.play();
        syncProgressToAudio();
        startProgressLoop();
      } catch (err) {
        stopLipSync?.();
        const name = err instanceof DOMException ? err.name : (err instanceof Error ? err.name : 'Error');
        console.error('[lesson-audio] play() rejected', { src, name, err, volume: el.volume, muted: el.muted });
        if (name === 'NotAllowedError') {
          setTtsError('Audio was blocked. Click Read Aloud again to start.');
        } else {
          setTtsError('Could not play lesson audio.');
        }
        dispatchSpeaking(false, 0);
        return 'error';
      }

      return new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
          stopLipSync?.();
          stopLipSync = null;
          if (progressRaf) cancelAnimationFrame(progressRaf);
          progressRaf = 0;
          el.ontimeupdate = null;
          el.onplaying = null;
          el.onended = null;
          el.onerror = null;
          dispatchSpeaking(false, 0);
        };
        const finish = (result: 'ended' | 'paused' | 'aborted' | 'error') => {
          if (settled) return;
          settled = true;
          pauseRef.current = null;
          cleanup();
          resolve(result);
        };

        pauseRef.current = () => {
          if (token !== sessionRef.current) return;
          el.pause();
          currentTimeRef.current = el.currentTime;
          persistProgress({ isCompleted: false });
          setState('paused');
          finish('paused');
        };

        el.onplaying = () => {
          if (token !== sessionRef.current) return;
          startProgressLoop();
          console.debug(
            `[lesson-audio] segment=${paragraphIndexRef.current} ` +
            `duration=${Number.isFinite(el.duration) ? el.duration.toFixed(2) : '?'}s isLipSyncing=true`,
          );
        };
        el.ontimeupdate = () => {
          if (token !== sessionRef.current) return;
          currentTimeRef.current = el.currentTime;
          const now = Date.now();
          if (now - lastSaveRef.current > 400) {
            lastSaveRef.current = now;
            persistProgress({ isCompleted: false });
          }
        };
        el.onended = () => { currentTimeRef.current = 0; finish('ended'); };
        el.onerror = () => {
          console.error('[lesson-audio] playback error during play', {
            src,
            code: el.error?.code,
            message: el.error?.message,
          });
          setTtsError('Lesson audio stopped unexpectedly.');
          finish('error');
        };
      });
    },
    [persistProgress, setState],
  );

  const runPlayback = useCallback(
    async (startIndex: number, startTime: number, token: number) => {
      const chunks = chunksRef.current;
      if (!chunks.length) return;

      setTtsError('');
      setState('loading');
      dispatchSpeaking(false, 0);

      // Pre-generate ALL remaining paragraphs up front. The backend serializes
      // Piper (warm), so later paragraphs finish while earlier ones play —
      // removing the long silent gap between segments.
      for (let i = startIndex; i < chunks.length; i++) void fetchChunkUrl(i);

      for (let i = startIndex; i < chunks.length; i++) {
        if (token !== sessionRef.current) return;

        paragraphIndexRef.current = i;
        const seek = i === startIndex ? startTime : 0;
        if (i !== startIndex) currentTimeRef.current = 0;

        const src = await resolveChunkSrc(i, token);
        if (token !== sessionRef.current) return;
        if (!src) {
          setTtsError('Could not load lesson audio (file not found).');
          setState('idle');
          dispatchSpeaking(false, 0);
          return;
        }

        // Reveal this paragraph exactly when playback is about to start — not while TTS loads.
        setCurrentSegment(i);
        setSegmentProgress(0);
        setState('speaking');
        const result = await playElement(src, token, seek, chunks[i]);
        if (token !== sessionRef.current) return;
        if (result === 'error') {
          setState('idle');
          return;
        }
        if (result === 'paused' || result === 'aborted') return;

        // Short, natural transition pause with the mouth CLOSED.
        if (i < chunks.length - 1) {
          setState('transitioning');
          dispatchSpeaking(false, 0);
          await sleep(PARAGRAPH_PAUSE_MS, token);
          if (token !== sessionRef.current) return;
        }
      }

      if (token !== sessionRef.current) return;
      paragraphIndexRef.current = 0;
      currentTimeRef.current = 0;
      // Reveal the full lesson text on the whiteboard once finished.
      setCurrentSegment(chunks.length);
      setSegmentProgress(1);
      persistProgress({ currentParagraphIndex: 0, currentTime: 0, isCompleted: true });
      setState('completed');
      dispatchSpeaking(false, 0);
      audioRef.current = null;
    },
    [fetchChunkUrl, persistProgress, playElement, resolveChunkSrc, setState, sleep],
  );

  const listen = useCallback(() => {
    const chunks = chunksRef.current;
    if (!chunks.length || !lessonId) return;

    sessionRef.current += 1;
    const token = sessionRef.current;
    audioRef.current?.pause();
    audioRef.current = null;

    // "Listen" always starts the lesson from the very beginning.
    clearAudioProgress(lessonId);
    paragraphIndexRef.current = 0;
    currentTimeRef.current = 0;
    setCurrentSegment(-1);
    setSegmentProgress(0);
    setHasSavedProgress(false);

    void runPlayback(0, 0, token);
  }, [lessonId, runPlayback]);

  const pause = useCallback(() => {
    pauseRef.current?.();
  }, []);

  const continuePlayback = useCallback(() => {
    if (audioState !== 'paused') return;
    const chunks = chunksRef.current;
    if (!chunks.length) return;

    sessionRef.current += 1;
    const token = sessionRef.current;
    // Resume mid-paragraph from the exact saved position via a fresh element so
    // the amplitude analyser re-attaches cleanly.
    void runPlayback(paragraphIndexRef.current, currentTimeRef.current, token);
  }, [audioState, runPlayback]);

  const restart = useCallback(() => {
    if (!lessonId) return;

    sessionRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    pauseRef.current = null;

    clearAudioProgress(lessonId);
    paragraphIndexRef.current = 0;
    currentTimeRef.current = 0;
    setHasSavedProgress(false);
    setTtsError('');

    const token = sessionRef.current;
    void runPlayback(0, 0, token);
  }, [lessonId, runPlayback]);

  /** Pause and save — used when leaving the page or starting feedback TTS. */
  const pauseAndSave = useCallback(() => {
    if (audioState === 'speaking' || audioState === 'loading' || audioState === 'transitioning') {
      pauseRef.current?.();
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      currentTimeRef.current = audioRef.current.currentTime;
    }
    persistProgress({ isCompleted: false });
    dispatchSpeaking(false, 0);
  }, [audioState, persistProgress]);

  /** Cancel playback without clearing saved progress (navigation away). */
  const abort = useCallback(() => {
    sessionRef.current += 1;
    pauseRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    dispatchSpeaking(false, 0);
    if (audioState === 'speaking' || audioState === 'loading' || audioState === 'transitioning') {
      persistProgress({ isCompleted: false });
      setAudioState('paused');
    }
  }, [audioState, persistProgress]);

  return {
    audioState,
    ttsError,
    hasSavedProgress,
    isSpeaking: audioState === 'speaking',
    segments,
    currentSegment,
    segmentProgress,
    listen,
    pause,
    continuePlayback,
    restart,
    pauseAndSave,
    abort,
  };
}
