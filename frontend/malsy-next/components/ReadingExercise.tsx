'use client';

import { useState, useRef, useEffect } from 'react';
import { isLoggedInToBackend, apiTts } from '@/lib/api';
import styles from './ReadingExercise.module.css';

const EXCELLENT_THRESHOLD = 0.9;
const GOOD_THRESHOLD = 0.6;

interface ScoredWord { word: string; spoken: string; similarity: number; grade: 'excellent' | 'good' | 'wrong'; }

interface Props {
  sentences: string[];
  lessonName: string;
  onCompleted: () => void;
  onClose: () => void;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function tokenize(text: string) { return text.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/).filter(Boolean); }

function wordSimilarity(expected: string, spoken: string) {
  if (!spoken) return 0;
  if (expected === spoken) return 1;
  const dist = levenshtein(expected, spoken);
  return 1 - dist / Math.max(expected.length, spoken.length);
}

function gradeWord(sim: number, spoken: string): 'excellent' | 'good' | 'wrong' {
  if (!spoken) return 'wrong';
  if (sim >= EXCELLENT_THRESHOLD) return 'excellent';
  if (sim >= GOOD_THRESHOLD) return 'good';
  return 'wrong';
}

function computeScore(scored: ScoredWord[]) {
  if (!scored.length) return 0;
  const total = scored.reduce((s, e) => s + (e.grade === 'excellent' ? 1 : e.grade === 'good' ? 0.5 : 0), 0);
  return Math.round((total / scored.length) * 100);
}

export default function ReadingExercise({ sentences, lessonName, onCompleted, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [scored, setScored] = useState<ScoredWord[] | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [status, setStatus] = useState('Press the microphone button to start reading.');
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [completed, setCompleted] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      const expected = tokenize(sentences[idx]);
      const spoken = tokenize(transcript);
      const scoredWords: ScoredWord[] = expected.map((word, i) => {
        const sp = spoken[i] || '';
        const sim = wordSimilarity(word, sp);
        return { word, spoken: sp, similarity: sim, grade: gradeWord(sim, sp) };
      });
      const s = computeScore(scoredWords);
      setScored(scoredWords);
      setScore(s);
      const feedbackText = s >= 85
        ? `Excellent reading! You scored ${s} out of 100. Keep it up!`
        : s >= 55
        ? `Good effort! You scored ${s} out of 100. Try again to improve.`
        : `Keep practising! You scored ${s} out of 100. You will get better.`;
      setStatus(s >= 85 ? 'Excellent reading! Keep it up!' : s >= 55 ? 'Good effort! Try again to improve.' : 'Keep practising! You will get better.');
      setListening(false);

      // Play TTS teacher feedback via FastAPI if backend is available (score >= 55)
      if (s >= 55 && isLoggedInToBackend()) {
        apiTts(feedbackText).then((res) => {
          if (res?.audio_url) {
            if (ttsAudioRef.current) ttsAudioRef.current.pause();
            const audio = new Audio(res.audio_url);
            ttsAudioRef.current = audio;
            audio.play().catch(() => {});
          }
        }).catch(() => {});
      }
    };
    rec.onerror = () => { setStatus('Could not understand. Try speaking more clearly.'); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec;

    return () => { rec.abort(); };
  }, [idx, sentences]);

  function startListening() {
    setScored(null); setScore(null);
    setStatus('Listening… read the sentence aloud.');
    setListening(true);
    recRef.current?.start();
  }

  function stopListening() {
    recRef.current?.abort();
    setListening(false);
    setStatus('Press the microphone button to start reading.');
  }

  function retry() {
    setScored(null); setScore(null);
    setStatus('Press the microphone button to start reading.');
  }

  function next() {
    if (idx < sentences.length - 1) {
      setIdx(idx + 1);
      setScored(null); setScore(null);
      setStatus('Press the microphone button to start reading.');
    } else {
      setCompleted(true);
      setStatus('All sentences completed. Great work!');
      onCompleted();
    }
  }

  const sentence = sentences[idx];
  const words = sentence.replace(/[.,!?]/g, '').split(/\s+/).filter(Boolean);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel} role="dialog" aria-modal="true">
        <button className={styles.close} onClick={onClose} type="button">×</button>
        <p className={styles.lessonTitle}>{lessonName}</p>

        <div className={styles.scoreBadge}>
          <span>{score !== null ? `${score}/100` : '—'}</span>
          <span>pts</span>
        </div>

        <div className={styles.legend}>
          <span className={`${styles.legendDot} ${styles.excellent}`} /> Excellent
          <span className={`${styles.legendDot} ${styles.good}`} /> Good
          <span className={`${styles.legendDot} ${styles.wrong}`} /> Wrong / Missed
        </div>

        <div className={styles.sentenceBox}>
          {words.map((w, i) => {
            const grade = scored ? scored[i]?.grade : undefined;
            return (
              <span key={i} className={`${styles.word} ${grade ? styles[grade] : ''}`}>{w}</span>
            );
          })}
        </div>

        <div className={styles.status}>{status}</div>
        <div className={styles.counter}>Sentence {idx + 1} of {sentences.length}</div>

        <div className={styles.controls}>
          <button className={`${styles.btn} ${styles.btnRetry}`} onClick={retry} title="Try again">↺</button>
          <button
            className={`${styles.btn} ${styles.btnSpeak} ${listening ? styles.btnListening : ''}`}
            onClick={listening ? stopListening : startListening}
            title={listening ? 'Stop' : 'Start speaking'}
            disabled={!supported}
          >
            {listening ? '⏹' : '🎤'}
          </button>
          <button className={`${styles.btn} ${styles.btnNext}`} onClick={next} disabled={completed} title="Next sentence">→</button>
        </div>

        {!supported && (
          <p className={styles.noSupport}>Your browser does not support speech recognition. Try Chrome or Edge.</p>
        )}
      </div>
    </div>
  );
}
