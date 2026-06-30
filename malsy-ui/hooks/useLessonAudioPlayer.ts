'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  attachLipSync,
  clearAudioProgress,
  dispatchSpeaking,
  loadAudioProgress,
  paragraphsForTTS,
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
  const fetchChunkUrl = useCallback((index: number): Promise<string | null> => {
    const cached = urlCacheRef.current.get(index);
    if (cached) return cached;
    const chunks = chunksRef.current;
    if (index >= chunks.length) return Promise.resolve(null);
    const p = api.tts
      .speak(chunks[index])
      .then(({ audio_url }) => (audio_url.startsWith('http') ? audio_url : `${API_BASE}${audio_url}`))
      .catch(() => null);
    urlCacheRef.current.set(index, p);
    return p;
  }, []);

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
    (
      el: HTMLAudioElement,
      token: number,
      startTime: number,
      text?: string,
    ): Promise<'ended' | 'paused' | 'aborted'> => {
      audioRef.current = el;
      if (startTime > 0) {
        try { el.currentTime = startTime; } catch { /* before metadata */ }
      }

      let stopLipSync: (() => void) | null = null;
      let progressRaf = 0;

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
        const finish = (result: 'ended' | 'paused' | 'aborted') => {
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

        // Lip-sync starts once audio is producing sound.
        // Text drives per-letter RPM viseme shapes synced to the clip duration.
        el.onplaying = () => {
          if (token !== sessionRef.current) return;
          if (!stopLipSync) stopLipSync = attachLipSync(el, text);
          // Smoothly drive whiteboard word reveal off real playback position.
          if (!progressRaf) {
            const tick = () => {
              if (token !== sessionRef.current) return;
              const d = el.duration;
              if (Number.isFinite(d) && d > 0) {
                setSegmentProgress(Math.min(1, el.currentTime / d));
              }
              progressRaf = requestAnimationFrame(tick);
            };
            progressRaf = requestAnimationFrame(tick);
          }
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
        el.onerror = () => finish('ended');
        el.play().catch(() => finish('ended'));

        if (token !== sessionRef.current) finish('aborted');
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
        setCurrentSegment(i);
        setSegmentProgress(0);
        const seek = i === startIndex ? startTime : 0;
        if (i !== startIndex) currentTimeRef.current = 0;

        const src = await fetchChunkUrl(i);
        if (token !== sessionRef.current) return;
        if (!src) {
          setTtsError('Could not load lesson audio.');
          setState('idle');
          dispatchSpeaking(false, 0);
          return;
        }

        setState('speaking');
        const result = await playElement(new Audio(src), token, seek, chunks[i]);
        if (token !== sessionRef.current) return;
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
    [fetchChunkUrl, persistProgress, playElement, setState, sleep],
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
