'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { auth } from '../../lib/auth';

// ── Game stats storage ───────────────────────────────────────────

const STORAGE_KEY = 'malsy_game_stats';
const MAX_PLAYS_PER_DAY = 3;

interface GameStat {
  totalScore: number;
  bestScore: number;
  playsToday: number;
  lastPlayDate: string;  // ISO date string YYYY-MM-DD
  streak: number;
  lastStreakDate: string; // last date they played (to detect consecutive days)
}

interface AllStats {
  hangman: GameStat;
  spelling: GameStat;
}

type GameKey = keyof AllStats;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultStat(): GameStat {
  return { totalScore: 0, bestScore: 0, playsToday: 0, lastPlayDate: '', streak: 0, lastStreakDate: '' };
}

function loadStats(userId: string): AllStats {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (!raw) return { hangman: defaultStat(), spelling: defaultStat() };
    return JSON.parse(raw) as AllStats;
  } catch {
    return { hangman: defaultStat(), spelling: defaultStat() };
  }
}

function saveStats(userId: string, stats: AllStats) {
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(stats));
}

function playsLeft(stat: GameStat): number {
  if (stat.lastPlayDate !== today()) return MAX_PLAYS_PER_DAY;
  return Math.max(0, MAX_PLAYS_PER_DAY - stat.playsToday);
}

function recordPlay(stat: GameStat): GameStat {
  const td = today();
  const isNewDay = stat.lastPlayDate !== td;

  let { streak, lastStreakDate } = stat;
  if (isNewDay) {
    // Extend streak if they played yesterday, else start fresh at 1
    streak = lastStreakDate === yesterday() ? streak + 1 : 1;
    lastStreakDate = td;
  }

  return {
    ...stat,
    playsToday: isNewDay ? 1 : stat.playsToday + 1,
    lastPlayDate: td,
    streak,
    lastStreakDate,
  };
}

function recordScore(stat: GameStat, score: number): GameStat {
  return {
    ...stat,
    totalScore: stat.totalScore + score,
    bestScore: Math.max(stat.bestScore, score),
  };
}

// ── Hangman data ─────────────────────────────────────────────────

const HANGMAN_WORDS = [
  { word: 'CHEMISTRY',    hint: 'The study of matter and its properties',         category: 'Science'        },
  { word: 'EXPERIMENT',   hint: 'A test to discover something',                   category: 'Science'        },
  { word: 'MOLECULE',     hint: 'A group of atoms bonded together',               category: 'Science'        },
  { word: 'GRAMMAR',      hint: 'Rules for using language correctly',             category: 'English'        },
  { word: 'VOCABULARY',   hint: 'Words you know and use',                         category: 'English'        },
  { word: 'SENTENCE',     hint: 'A group of words expressing a complete thought', category: 'English'        },
  { word: 'CONTINENT',    hint: 'Large landmasses on Earth',                      category: 'Geography'      },
  { word: 'CIVILIZATION', hint: 'Advanced human society',                         category: 'History'        },
  { word: 'GOVERNMENT',   hint: 'System that rules a country',                    category: 'Social Studies' },
  { word: 'CULTURE',      hint: 'Beliefs and customs of a group',                 category: 'Social Studies' },
  { word: 'EDUCATION',    hint: 'Process of learning',                            category: 'General'        },
  { word: 'KNOWLEDGE',    hint: 'Information and understanding',                  category: 'General'        },
  { word: 'STUDENT',      hint: 'Someone who learns',                             category: 'General'        },
  { word: 'TEACHER',      hint: 'Someone who teaches',                            category: 'General'        },
  { word: 'SCIENCE',      hint: 'Study of the natural world',                     category: 'Science'        },
];

// ── Spelling Bee data ────────────────────────────────────────────

const SPELLING_WORDS = [
  { word: 'CHEMISTRY',     hint: 'The study of matter and chemicals', difficulty: 1 },
  { word: 'EXPERIMENT',    hint: 'A scientific test',                 difficulty: 1 },
  { word: 'MOLECULE',      hint: 'A group of atoms',                  difficulty: 2 },
  { word: 'GRAMMAR',       hint: 'Rules of language',                 difficulty: 1 },
  { word: 'VOCABULARY',    hint: 'Words you know',                    difficulty: 2 },
  { word: 'SENTENCE',      hint: 'A complete thought in words',       difficulty: 1 },
  { word: 'CONTINENT',     hint: 'Large landmasses',                  difficulty: 1 },
  { word: 'CIVILIZATION',  hint: 'Advanced society',                  difficulty: 3 },
  { word: 'GOVERNMENT',    hint: 'System that rules',                 difficulty: 2 },
  { word: 'EDUCATION',     hint: 'Process of learning',               difficulty: 1 },
  { word: 'KNOWLEDGE',     hint: 'Information you know',              difficulty: 2 },
  { word: 'SCIENCE',       hint: 'Study of nature',                   difficulty: 1 },
  { word: 'MATHEMATICS',   hint: 'Study of numbers',                  difficulty: 2 },
  { word: 'GEOGRAPHY',     hint: 'Study of Earth',                    difficulty: 2 },
  { word: 'HISTORY',       hint: 'Study of the past',                 difficulty: 1 },
  { word: 'LITERATURE',    hint: 'Written works',                     difficulty: 2 },
  { word: 'PHYSICS',       hint: 'Study of motion and energy',        difficulty: 2 },
  { word: 'BIOLOGY',       hint: 'Study of living things',            difficulty: 2 },
  { word: 'ASTRONOMY',     hint: 'Study of space',                    difficulty: 3 },
  { word: 'PRONUNCIATION', hint: 'How to say a word',                 difficulty: 3 },
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MAX_WRONG = 6;
const TOTAL_WORDS = 10;

// ── Hangman modal ────────────────────────────────────────────────

function HangmanModal({ onClose }: { onClose: (score: number) => void }) {
  const pick = () => HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];

  const [word, setWord]         = useState(pick);
  const [guessed, setGuessed]   = useState<string[]>([]);
  const [wrong, setWrong]       = useState(0);
  const [score, setScore]       = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [status, setStatus]     = useState<'playing' | 'won' | 'lost'>('playing');

  const startNew = useCallback((keepScore = true) => {
    setWord(pick());
    setGuessed([]);
    setWrong(0);
    setHintUsed(false);
    setShowHint(false);
    setStatus('playing');
    if (!keepScore) setScore(0);
  }, []);

  function guessLetter(letter: string) {
    if (guessed.includes(letter) || status !== 'playing') return;
    const next = [...guessed, letter];
    setGuessed(next);
    if (!word.word.includes(letter)) {
      const w = wrong + 1;
      setWrong(w);
      if (w >= MAX_WRONG) { setStatus('lost'); setTimeout(() => startNew(false), 2800); }
    } else {
      const won = word.word.split('').every(l => next.includes(l));
      if (won) {
        const pts = 10 + (wrong === 0 ? 5 : 0);
        setScore(s => s + pts);
        setStatus('won');
        setTimeout(() => startNew(), 2200);
      }
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (k.length === 1 && k >= 'A' && k <= 'Z') guessLetter(k);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const letters = word.word.split('');
  const earnedNow = 10 + (wrong === 0 ? 5 : 0);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(score); }}>
      <div className="modal-box" style={{ maxWidth: 660 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,rgba(59,191,255,.18),rgba(91,33,245,.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔤</div>
            <div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 15 }}>Hangman</div>
              <div style={{ fontSize: 11, color: 'var(--g3)' }}>Score: {score} pts · press A–Z to guess</div>
            </div>
          </div>
          <button className="modal-close" onClick={() => onClose(score)}>✕</button>
        </div>

        <div className="modal-body">
          {status === 'won' && (
            <div className="auth-success" style={{ marginBottom: 16 }}>
              ✅ Correct! +{earnedNow} pts{wrong === 0 ? ' (perfect bonus!)' : ''} — next word…
            </div>
          )}
          {status === 'lost' && (
            <div className="auth-error" style={{ marginBottom: 16 }}>
              ❌ The word was <strong>{word.word}</strong> — score reset, new word incoming…
            </div>
          )}

          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <svg viewBox="0 0 200 260" style={{ width: 140, height: 175 }}>
                <line x1="20" y1="250" x2="180" y2="250" stroke="rgba(255,255,255,.25)" strokeWidth="4" strokeLinecap="round"/>
                <line x1="60" y1="250" x2="60"  y2="20"  stroke="rgba(255,255,255,.25)" strokeWidth="4" strokeLinecap="round"/>
                <line x1="60" y1="20"  x2="130" y2="20"  stroke="rgba(255,255,255,.25)" strokeWidth="4" strokeLinecap="round"/>
                <line x1="130" y1="20" x2="130" y2="50"  stroke="rgba(255,255,255,.25)" strokeWidth="4" strokeLinecap="round"/>
                {wrong >= 1 && <circle cx="130" cy="70" r="20" stroke="var(--coral)" strokeWidth="3" fill="none"/>}
                {wrong >= 2 && <line x1="130" y1="90"  x2="130" y2="150" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"/>}
                {wrong >= 3 && <line x1="130" y1="110" x2="100" y2="135" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"/>}
                {wrong >= 4 && <line x1="130" y1="110" x2="160" y2="135" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"/>}
                {wrong >= 5 && <line x1="130" y1="150" x2="105" y2="185" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"/>}
                {wrong >= 6 && <line x1="130" y1="150" x2="155" y2="185" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"/>}
              </svg>
              <div style={{ fontSize: 11, color: wrong >= MAX_WRONG ? 'var(--coral)' : 'var(--g3)' }}>
                {wrong} / {MAX_WRONG} wrong
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--vl)', marginBottom: 10 }}>
                Category: {word.category}
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18 }}>
                {letters.map((letter, i) => (
                  <div key={i} style={{
                    minWidth: 26, height: 38,
                    borderBottom: `2px solid ${guessed.includes(letter) ? 'var(--mint)' : 'rgba(255,255,255,.2)'}`,
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2,
                    fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 20,
                    color: guessed.includes(letter) ? 'var(--mint)' : 'transparent',
                    transition: 'color .2s, border-color .2s',
                  }}>{letter}</div>
                ))}
              </div>
              {showHint && (
                <div style={{ background: 'rgba(255,184,48,.08)', border: '1px solid rgba(255,184,48,.2)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--amber)', marginBottom: 14 }}>
                  💡 {word.hint}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-o btn-sm" onClick={() => { setShowHint(true); setHintUsed(true); }} disabled={hintUsed}>💡 Hint</button>
                <button className="btn btn-o btn-sm" onClick={() => startNew(false)}>New Game</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 20 }}>
            {LETTERS.map(letter => {
              const used = guessed.includes(letter);
              const correct = used && word.word.includes(letter);
              const miss    = used && !word.word.includes(letter);
              return (
                <button key={letter} onClick={() => guessLetter(letter)} disabled={used || status !== 'playing'} style={{
                  width: 33, height: 33, borderRadius: 7, border: '1px solid transparent',
                  fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 11, cursor: used ? 'default' : 'pointer',
                  background: correct ? 'rgba(0,229,160,.18)' : miss ? 'rgba(255,107,107,.12)' : 'rgba(255,255,255,.07)',
                  borderColor: correct ? 'rgba(0,229,160,.3)' : miss ? 'rgba(255,107,107,.2)' : 'rgba(255,255,255,.08)',
                  color: correct ? 'var(--mint)' : miss ? 'var(--coral)' : 'var(--w)',
                  opacity: used ? 0.6 : 1, transition: 'all .15s',
                }}>{letter}</button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Spelling Bee modal ───────────────────────────────────────────

function SpellingBeeModal({ onClose }: { onClose: (score: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [score, setScore]               = useState(0);
  const [level, setLevel]               = useState(1);
  const [correctCount, setCorrectCount] = useState(0);
  const [round, setRound]               = useState(0);
  const [hintUsed, setHintUsed]         = useState(false);
  const [showHint, setShowHint]         = useState(false);
  const [input, setInput]               = useState('');
  const [currentWord, setCurrentWord]   = useState(SPELLING_WORDS[0]);
  const [displayWord, setDisplayWord]   = useState('');
  const [message, setMessage]           = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [gameOver, setGameOver]         = useState(false);

  function buildDisplay(word: string, difficulty: number) {
    const hideCount = Math.ceil(word.length * (0.3 + difficulty * 0.1));
    const indices: number[] = [];
    while (indices.length < hideCount) {
      const i = Math.floor(Math.random() * word.length);
      if (!indices.includes(i)) indices.push(i);
    }
    return word.split('').map((c, i) => (indices.includes(i) ? '·' : c)).join(' ');
  }

  const loadWord = useCallback((r: number, lv: number, sc: number, cc: number) => {
    if (r >= TOTAL_WORDS) { setGameOver(true); return; }
    const pool = SPELLING_WORDS.filter(w => w.difficulty <= lv);
    const w = pool[Math.floor(Math.random() * pool.length)];
    setCurrentWord(w);
    setDisplayWord(buildDisplay(w.word, w.difficulty));
    setShowHint(false);
    setHintUsed(false);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  useEffect(() => { loadWord(0, 1, 0, 0); }, [loadWord]);

  function startGame() {
    setScore(0); setLevel(1); setCorrectCount(0); setRound(0);
    setGameOver(false); setMessage(null);
    loadWord(0, 1, 0, 0);
  }

  function checkSpelling() {
    const ans = input.trim().toUpperCase();
    if (!ans) return;
    const newRound = round + 1;
    setRound(newRound);

    if (ans === currentWord.word) {
      const pts = 10 + (!hintUsed ? 5 : 0) + currentWord.difficulty * 5;
      const newScore = score + pts;
      const newCorrect = correctCount + 1;
      setScore(newScore);
      setCorrectCount(newCorrect);
      let newLevel = level;
      if (newCorrect % 3 === 0 && level < 3) { newLevel = level + 1; setLevel(newLevel); }
      setMessage({ text: `✅ Correct! +${pts} pts`, type: 'success' });
      setTimeout(() => { setMessage(null); loadWord(newRound, newLevel, newScore, newCorrect); }, 1400);
    } else {
      setMessage({ text: `❌ The word was: ${currentWord.word}`, type: 'error' });
      setTimeout(() => { setMessage(null); loadWord(newRound, level, score, correctCount); }, 2000);
    }
  }

  function playAudio() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utt = new SpeechSynthesisUtterance(currentWord.word);
      utt.lang = 'en-US'; utt.rate = 0.8;
      speechSynthesis.speak(utt);
    }
  }

  const progress = (round / TOTAL_WORDS) * 100;
  const diffColors = ['', 'var(--mint)', 'var(--amber)', 'var(--coral)'];

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(score); }}>
      <div className="modal-box">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,rgba(255,184,48,.22),rgba(255,184,48,.06))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🐝</div>
            <div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 15 }}>Spelling Bee</div>
              <div style={{ fontSize: 11, color: 'var(--g3)' }}>Score: {score} · Level: {level}/3</div>
            </div>
          </div>
          <button className="modal-close" onClick={() => onClose(score)}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 999, height: 4, marginBottom: 6, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', borderRadius: 999, background: 'var(--mint)', transition: 'width .4s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--g3)', marginBottom: 18, display: 'flex', justifyContent: 'space-between' }}>
            <span>{round} / {TOTAL_WORDS} words</span>
            <span>{correctCount} correct</span>
          </div>

          {message && (
            <div className={message.type === 'success' ? 'auth-success' : 'auth-error'} style={{ marginBottom: 14 }}>
              {message.text}
            </div>
          )}

          {!gameOver ? (
            <>
              <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16, padding: '24px 20px', textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 30, letterSpacing: 10, color: 'var(--sky)', marginBottom: 4 }}>{displayWord}</div>
                <div style={{ fontSize: 10, color: diffColors[currentWord.difficulty], marginTop: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Difficulty {currentWord.difficulty}/3
                </div>
                {showHint && (
                  <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 10, padding: '6px 12px', background: 'rgba(255,184,48,.07)', borderRadius: 8 }}>
                    💡 {currentWord.hint}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button className="btn btn-o btn-sm" onClick={playAudio}>🔊 Hear it</button>
                <button className="btn btn-o btn-sm" onClick={() => { setShowHint(true); setHintUsed(true); }} disabled={hintUsed}>
                  💡 Hint {hintUsed ? '(−5 pts)' : ''}
                </button>
              </div>
              <form onSubmit={e => { e.preventDefault(); checkSpelling(); }} style={{ display: 'flex', gap: 8 }}>
                <input ref={inputRef} className="field-input" type="text" value={input}
                  onChange={e => setInput(e.target.value.toUpperCase())}
                  placeholder="Type the full word…" style={{ flex: 1 }}
                  autoCapitalize="characters" autoComplete="off" />
                <button type="submit" className="auth-submit"
                  style={{ width: 'auto', padding: '11px 22px', marginTop: 0 }}
                  disabled={!input.trim()}>Submit</button>
              </form>
              <button className="btn btn-o btn-sm" style={{ marginTop: 12 }} onClick={startGame}>New Game</button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>🎉</div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Game Complete!</div>
              <div style={{ color: 'var(--g3)', fontSize: 14, marginBottom: 24 }}>
                Final score: <strong style={{ color: 'var(--mint)', fontSize: 20 }}>{score} pts</strong>
                <br />
                <span style={{ fontSize: 12 }}>{correctCount} / {TOTAL_WORDS} words correct</span>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-v" onClick={startGame}>Play Again</button>
                <button className="btn btn-o" onClick={() => onClose(score)}>Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

function ChallengesPageInner() {
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const [stats, setStats] = useState<AllStats>({ hangman: defaultStat(), spelling: defaultStat() });
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const user = auth.getUser();
    const uid = user?.user_id ?? 'guest';
    setUserId(uid);
    setStats(loadStats(uid));
  }, []);

  function openGame(game: GameKey) {
    const stat = stats[game];
    if (playsLeft(stat) === 0) return;
    const updated = { ...stats, [game]: recordPlay(stat) };
    setStats(updated);
    saveStats(userId, updated);
    setActiveGame(game);
  }

  function closeGame(game: GameKey, score: number) {
    setActiveGame(null);
    if (score > 0) {
      setStats(prev => {
        const updated = { ...prev, [game]: recordScore(prev[game], score) };
        saveStats(userId, updated);
        return updated;
      });
    }
  }

  function renderPlayBtn(game: GameKey, className = 'btn btn-v btn-sm') {
    const left = playsLeft(stats[game]);
    return (
      <button
        className={className}
        disabled={left === 0}
        onClick={() => openGame(game)}
        title={left === 0 ? 'Come back tomorrow for more plays' : `${left} play${left !== 1 ? 's' : ''} left today`}
      >
        {left === 0 ? 'Done for today' : '▶ Play'}
      </button>
    );
  }

  function renderGameMeta(game: GameKey) {
    const s = stats[game];
    const left = playsLeft(s);
    return (
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--g3)', marginTop: 6, flexWrap: 'wrap' }}>
        <span>🏆 Best: <strong style={{ color: 'var(--amber)' }}>{s.bestScore > 0 ? `${s.bestScore} pts` : '—'}</strong></span>
        <span>📊 Total: <strong style={{ color: 'var(--mint)' }}>{s.totalScore > 0 ? `${s.totalScore} pts` : '—'}</strong></span>
        {s.streak > 0 && <span>🔥 <strong style={{ color: 'var(--coral)' }}>{s.streak}-day streak</strong></span>}
        <span style={{ color: left === 0 ? 'var(--coral)' : 'var(--g5)' }}>
          {left}/{MAX_PLAYS_PER_DAY} plays left today
        </span>
      </div>
    );
  }

  return (
    <div className="page-enter">
      {/* Banner cards */}
      <div className="g2" style={{ marginBottom: 24 }}>
        <div className="card" style={{ background: 'linear-gradient(135deg,rgba(255,184,48,.12),rgba(255,184,48,.04))', borderColor: 'rgba(255,184,48,.2)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
          <div className="card-title" style={{ fontSize: 16 }}>Daily Challenge</div>
          <div style={{ fontSize: 13, color: 'var(--g3)', margin: '6px 0 10px' }}>
            Play Hangman or Spelling Bee and beat your best score today
          </div>
          {renderGameMeta('hangman')}
          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-sm"
              style={{ background: 'var(--amber)', color: 'var(--navy)', border: 'none', borderRadius: 999, padding: '7px 14px', fontFamily: 'var(--fd)', fontSize: 11, fontWeight: 700, cursor: playsLeft(stats.hangman) === 0 ? 'not-allowed' : 'pointer', opacity: playsLeft(stats.hangman) === 0 ? 0.5 : 1 }}
              disabled={playsLeft(stats.hangman) === 0}
              onClick={() => openGame('hangman')}
            >
              {playsLeft(stats.hangman) === 0 ? 'Done for today' : 'Start Hangman'}
            </button>
          </div>
        </div>
        <div className="card" style={{ background: 'linear-gradient(135deg,rgba(91,33,245,.15),rgba(91,33,245,.04))', borderColor: 'rgba(91,33,245,.2)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🐝</div>
          <div className="card-title" style={{ fontSize: 16 }}>Spelling Bee</div>
          <div style={{ fontSize: 13, color: 'var(--g3)', margin: '6px 0 10px' }}>
            10 progressive words — difficulty climbs as you get them right
          </div>
          {renderGameMeta('spelling')}
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-v"
              disabled={playsLeft(stats.spelling) === 0}
              style={{ opacity: playsLeft(stats.spelling) === 0 ? 0.5 : 1, cursor: playsLeft(stats.spelling) === 0 ? 'not-allowed' : 'pointer' }}
              onClick={() => openGame('spelling')}>
              {playsLeft(stats.spelling) === 0 ? 'Done for today' : 'Play Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Active Challenges */}
      <div className="card-title" style={{ marginBottom: 16 }}>Active Challenges</div>

      {([
        {
          id: 'hangman' as GameKey,
          icon: '🔤', iconBg: 'linear-gradient(135deg,rgba(59,191,255,.18),rgba(59,191,255,.05))',
          name: 'Hangman', desc: 'Guess the hidden word letter by letter before the figure is complete',
          tip: 'Press A–Z on your keyboard to guess letters instantly',
          diff: 'Medium', diffStyle: { background: 'rgba(255,184,48,.12)', color: 'var(--amber)' },
          xp: '+10–15 pts',
        },
        {
          id: 'spelling' as GameKey,
          icon: '🐝', iconBg: 'linear-gradient(135deg,rgba(255,184,48,.2),rgba(255,184,48,.05))',
          name: 'Spelling Bee', desc: 'See the partial word, hear it spoken, then spell it out completely',
          tip: 'Skip the hint for +5 bonus pts — difficulty rises every 3 correct answers',
          diff: 'Easy → Hard', diffStyle: { background: 'rgba(0,229,160,.1)', color: 'var(--mint)' },
          xp: '+10–25 pts',
        },
      ]).map((ch, i) => (
        <div key={ch.id} className="challenge-item" style={{ marginBottom: 10 }}>
          <div className="ch-rank" style={{ color: i === 0 ? 'var(--amber)' : 'var(--g3)' }}>{i + 1}</div>
          <div className="ch-icon" style={{ background: ch.iconBg }}>{ch.icon}</div>
          <div className="ch-body">
            <div className="ch-name">{ch.name}</div>
            <div className="ch-desc">{ch.desc}</div>
            <div style={{ fontSize: 10, color: 'var(--g5)', marginTop: 4 }}>💡 {ch.tip}</div>
            {renderGameMeta(ch.id)}
          </div>
          <div className="ch-right">
            <div className="ch-xp">{ch.xp}</div>
            <div className="ch-xpl">per word</div>
            <div className="ch-diff" style={ch.diffStyle}>{ch.diff}</div>
          </div>
          {renderPlayBtn(ch.id)}
        </div>
      ))}

      {activeGame === 'hangman'  && <HangmanModal    onClose={score => closeGame('hangman', score)} />}
      {activeGame === 'spelling' && <SpellingBeeModal onClose={score => closeGame('spelling', score)} />}
    </div>
  );
}

export default function ChallengesPage() {
  return (
    <Suspense fallback={<div className="page-enter card-sub">Loading challenges…</div>}>
      <ChallengesPageInner />
    </Suspense>
  );
}
