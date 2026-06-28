'use client';

import { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const WORD_POOL = [
  'apple', 'beautiful', 'celebrate', 'discover', 'elephant',
  'friendship', 'grateful', 'happiness', 'important', 'journey',
  'knowledge', 'language', 'mountain', 'necessary', 'orange',
  'powerful', 'question', 'rainbow', 'scientist', 'together',
  'umbrella', 'victory', 'wonderful', 'explain', 'yesterday',
  'challenge', 'describe', 'example', 'feather', 'garden',
  'thunder', 'whisper', 'crystal', 'ancient', 'brilliant',
  'courage', 'delight', 'golden', 'harvest', 'curious',
  'adventure', 'freedom', 'nervous', 'patient', 'respect',
  'silence', 'triumph', 'universe', 'wisdom', 'balance',
];

function pickWords(n = 6): string[] {
  const copy = [...WORD_POOL];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ── Scoring ───────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[a.length][b.length];
}

function scoreWord(expected: string, spoken: string, confidence: number): number {
  const e = expected.toLowerCase().trim();
  const s = spoken.toLowerCase().trim();
  if (e === s) return Math.round(85 + confidence * 15);
  if (s.includes(e) || e.includes(s)) return Math.round(75 + confidence * 10);
  const dist = levenshtein(e, s);
  const maxLen = Math.max(e.length, s.length);
  const similarity = Math.max(0, 1 - dist / maxLen);
  return Math.round(similarity * 80 + confidence * 10);
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--mint)';
  if (score >= 60) return 'var(--amber)';
  return '#ff7070';
}

// ── Web Speech API types ──────────────────────────────────────────

interface SpeechResultAlternative { transcript: string; confidence: number; }
interface SpeechResultItem { 0: SpeechResultAlternative; isFinal: boolean; length: number; }
interface SpeechResultList { 0: SpeechResultItem; length: number; }
interface SpeechEvent { results: SpeechResultList; }
interface SpeechErrorEvent { error: string; }

function getSpeechRecognition(): { new(): SpeechRecognitionInstance } | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// ── Types ─────────────────────────────────────────────────────────

interface WordScore { word: string; spoken: string; score: number; }
type Phase = 'ready' | 'listening' | 'result' | 'error' | 'unsupported';

// ── Word round ────────────────────────────────────────────────────

function WordRound({
  word, index, total, onDone,
}: {
  word: string; index: number; total: number; onDone: (ws: WordScore) => void;
}) {
  const [phase, setPhase]       = useState<Phase>(() =>
    getSpeechRecognition() ? 'ready' : 'unsupported'
  );
  const [result, setResult]     = useState<WordScore | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [interim, setInterim]   = useState('');
  const recRef = useRef<SpeechRecognitionInstance | null>(null);

  function startListening() {
    const SR = getSpeechRecognition();
    if (!SR) { setPhase('unsupported'); return; }

    setInterim('');
    setErrorMsg('');
    setResult(null);

    const rec = new SR();
    recRef.current = rec;
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    let gotResult = false;

    rec.onresult = (e: SpeechEvent) => {
      const item = e.results[0];
      const alt  = item[0];
      if (item.isFinal) {
        gotResult = true;
        const spoken     = alt.transcript.toLowerCase().trim();
        const confidence = alt.confidence ?? 0.7;
        const score      = scoreWord(word, spoken, confidence);
        const ws: WordScore = { word, spoken, score };
        setResult(ws);
        setPhase('result');
      } else {
        setInterim(alt.transcript);
      }
    };

    rec.onerror = (e: SpeechErrorEvent) => {
      if (e.error === 'no-speech') {
        setErrorMsg("No speech detected. Make sure your microphone is on and say the word clearly.");
      } else if (e.error === 'not-allowed') {
        setErrorMsg("Microphone access was denied. Please allow microphone access and try again.");
      } else {
        setErrorMsg(`Recognition error: ${e.error}. Try again.`);
      }
      setPhase('error');
    };

    rec.onend = () => {
      if (!gotResult) {
        setPhase('error');
        setErrorMsg(m => m || "No result received. Please try again.");
      }
    };

    rec.start();
    setPhase('listening');
  }

  function stopListening() {
    recRef.current?.stop();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            width: 28, height: 4, borderRadius: 99,
            background: i < index ? 'var(--mint)' : i === index ? 'var(--vl)' : 'rgba(255,255,255,.1)',
            transition: 'background .3s',
          }} />
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--g4)' }}>Word {index + 1} of {total}</div>

      {/* Word */}
      <div style={{ fontSize: 56, fontWeight: 900, color: 'var(--w)', letterSpacing: '.04em', fontFamily: 'var(--fd)', textAlign: 'center' }}>
        {word}
      </div>

      {/* Unsupported */}
      {phase === 'unsupported' && (
        <div style={{
          background: 'rgba(255,60,60,.07)', border: '1px solid rgba(255,60,60,.2)',
          borderRadius: 12, padding: '14px 20px', fontSize: 13, color: '#ff7070',
          textAlign: 'center', maxWidth: 360, lineHeight: 1.6,
        }}>
          Speech recognition is not available in this browser. Please use Chrome or Edge.
        </div>
      )}

      {/* Ready */}
      {phase === 'ready' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--g3)' }}>Tap the button, then say the word out loud.</div>
          <button className="auth-submit" onClick={startListening} style={{ maxWidth: 220 }}>
            🎤 Speak Now
          </button>
        </div>
      )}

      {/* Listening */}
      {phase === 'listening' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#ff4444', boxShadow: '0 0 8px rgba(255,68,68,.7)',
              animation: 'pulse 1s ease-in-out infinite',
            }} />
            <span style={{ color: '#ff9090', fontWeight: 700, fontSize: 14 }}>Listening…</span>
          </div>

          {interim && (
            <div style={{
              fontSize: 20, color: 'var(--vl)', fontWeight: 600, letterSpacing: '.03em',
              minHeight: 30, fontStyle: 'italic',
            }}>
              {interim}
            </div>
          )}

          <button className="btn btn-o" onClick={stopListening} style={{ marginTop: 4 }}>
            Stop
          </button>
        </div>
      )}

      {/* Result */}
      {phase === 'result' && result && (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(result.score), fontFamily: 'var(--fd)', lineHeight: 1 }}>
              {result.score}
            </div>
            <div style={{ fontSize: 13, color: 'var(--g4)', marginTop: 4 }}>/ 100</div>
            <div style={{ fontSize: 14, color: 'var(--g2)', marginTop: 10 }}>
              {result.score >= 90 ? 'Perfect pronunciation!' :
               result.score >= 75 ? 'Well done!' :
               result.score >= 60 ? 'Almost there — try once more!' :
               'Keep practising!'}
            </div>
          </div>

          <div style={{
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 14, padding: '14px 18px', marginBottom: 18,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '6px 10px', fontSize: 13 }}>
              <div style={{ color: 'var(--g4)' }}>Expected:</div>
              <div style={{ fontWeight: 700, color: 'var(--g2)' }}>{word}</div>
              <div style={{ color: 'var(--g4)' }}>You said:</div>
              <div style={{ fontWeight: 700, color: scoreColor(result.score) }}>
                {result.spoken || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>—</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-o" onClick={() => { setResult(null); setPhase('ready'); }}>Try Again</button>
            <button className="btn btn-v" onClick={() => onDone(result)}>
              {index + 1 < total ? 'Next →' : 'See Results →'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 360 }}>
          <div style={{
            background: 'rgba(255,60,60,.07)', border: '1px solid rgba(255,60,60,.2)',
            borderRadius: 12, padding: '12px 18px', fontSize: 13, color: '#ff7070',
            textAlign: 'center', lineHeight: 1.5,
          }}>
            {errorMsg || 'Something went wrong. Please try again.'}
          </div>
          <button className="btn btn-o" onClick={() => { setErrorMsg(''); setPhase('ready'); }}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

// ── Summary ───────────────────────────────────────────────────────

function Summary({ scores, onRestart }: { scores: WordScore[]; onRestart: () => void }) {
  const avg = Math.round(scores.reduce((s, w) => s + w.score, 0) / scores.length);
  const router = useRouter();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--g4)', marginBottom: 8 }}>Overall Score</div>
        <div style={{ fontSize: 68, fontWeight: 900, color: scoreColor(avg), fontFamily: 'var(--fd)', lineHeight: 1 }}>
          {avg}
        </div>
        <div style={{ fontSize: 13, color: 'var(--g4)', marginTop: 4 }}>out of 100</div>
        <div style={{ fontSize: 14, color: 'var(--g2)', marginTop: 14, lineHeight: 1.6 }}>
          {avg >= 90 ? 'Excellent — your pronunciation is very clear!' :
           avg >= 75 ? 'Good work! Review the words highlighted in red.' :
           avg >= 60 ? 'Keep practising — focus on the difficult words.' :
           "Don't give up — each attempt improves your pronunciation!"}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scores.map((ws, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12,
            background: 'rgba(255,255,255,.03)',
            border: `1px solid ${ws.score >= 80 ? 'rgba(0,229,160,.15)' : ws.score >= 60 ? 'rgba(255,184,48,.15)' : 'rgba(255,60,60,.15)'}`,
            borderRadius: 12, padding: '12px 16px',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--w)', marginBottom: 2 }}>{ws.word}</div>
              {ws.spoken && ws.spoken !== ws.word ? (
                <div style={{ fontSize: 12, color: 'var(--g4)' }}>
                  You said: <span style={{ color: scoreColor(ws.score) }}>{ws.spoken}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--mint)' }}>Recognized correctly ✓</div>
              )}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: scoreColor(ws.score), minWidth: 36, textAlign: 'right' }}>
              {ws.score}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button className="btn btn-o" onClick={onRestart}>Same Words</button>
        <button className="btn btn-v" onClick={() => router.push('/lessons/pronunciation')}>New Words</button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

function PronunciationTest() {
  const router = useRouter();
  const params = useSearchParams();
  const lessonName = params.get('lesson_title') ?? 'Pronunciation Practice';

  const [words]     = useState<string[]>(() => pickWords(6));
  const [wordIndex, setWordIndex] = useState(0);
  const [scores,    setScores]    = useState<WordScore[]>([]);
  const [done,      setDone]      = useState(false);

  function handleWordDone(ws: WordScore) {
    const next = [...scores, ws];
    setScores(next);
    if (wordIndex + 1 >= words.length) setDone(true);
    else setWordIndex(i => i + 1);
  }

  function restart() { setScores([]); setWordIndex(0); setDone(false); }

  return (
    <div className="page-enter" style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
        <button
          onClick={() => router.push('/lessons/subject/english')}
          style={{
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 8, padding: '5px 14px', color: 'var(--g2)',
            cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fb)',
          }}
        >
          ← Back to Lessons
        </button>
        <span style={{ color: 'var(--g5)', fontSize: 13 }}>/</span>
        <span style={{ color: 'var(--vl)', fontSize: 13, fontWeight: 600 }}>English</span>
        <span style={{ color: 'var(--g5)', fontSize: 13 }}>/</span>
        <span style={{ color: 'var(--w)', fontSize: 13 }}>{lessonName}</span>
      </div>

      <div style={{
        background: 'rgba(91,33,245,.05)', border: '1px solid rgba(91,33,245,.2)',
        borderRadius: 24, padding: '40px 36px',
        minHeight: 380, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {done
          ? <Summary scores={scores} onRestart={restart} />
          : <WordRound key={wordIndex} word={words[wordIndex]} index={wordIndex} total={words.length} onDone={handleWordDone} />
        }
      </div>
    </div>
  );
}

export default function PronunciationPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="modal-spinner" />
      </div>
    }>
      <PronunciationTest />
    </Suspense>
  );
}
