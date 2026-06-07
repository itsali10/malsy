'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getStudentById, updateGameScore } from '@/lib/database';
import { getSession } from '@/lib/database';
import styles from './spelling-bee.module.css';

const WORDS = [
  { word: 'CHEMISTRY', hint: 'The study of matter and chemicals', difficulty: 1 },
  { word: 'EXPERIMENT', hint: 'A scientific test', difficulty: 1 },
  { word: 'MOLECULE', hint: 'A group of atoms', difficulty: 2 },
  { word: 'GRAMMAR', hint: 'Rules of language', difficulty: 1 },
  { word: 'VOCABULARY', hint: 'Words you know', difficulty: 2 },
  { word: 'SENTENCE', hint: 'A complete thought in words', difficulty: 1 },
  { word: 'CONTINENT', hint: 'Large landmasses', difficulty: 1 },
  { word: 'CIVILIZATION', hint: 'Advanced society', difficulty: 3 },
  { word: 'GOVERNMENT', hint: 'System that rules', difficulty: 2 },
  { word: 'EDUCATION', hint: 'Process of learning', difficulty: 1 },
  { word: 'KNOWLEDGE', hint: 'Information you know', difficulty: 2 },
  { word: 'SCIENCE', hint: 'Study of nature', difficulty: 1 },
  { word: 'MATHEMATICS', hint: 'Study of numbers', difficulty: 2 },
  { word: 'GEOGRAPHY', hint: 'Study of Earth', difficulty: 2 },
  { word: 'HISTORY', hint: 'Study of the past', difficulty: 1 },
  { word: 'LITERATURE', hint: 'Written works', difficulty: 2 },
  { word: 'PHYSICS', hint: 'Study of motion and energy', difficulty: 2 },
  { word: 'BIOLOGY', hint: 'Study of living things', difficulty: 2 },
  { word: 'ASTRONOMY', hint: 'Study of space', difficulty: 3 },
  { word: 'PRONUNCIATION', hint: 'How to say a word', difficulty: 3 },
];

const TOTAL_WORDS = 10;

export default function SpellingBeePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState(0);
  const [currentWord, setCurrentWord] = useState(WORDS[0]);
  const [displayWord, setDisplayWord] = useState('');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [correctCount, setCorrectCount] = useState(0);
  const [round, setRound] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [hint, setHint] = useState('');
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [progress, setProgress] = useState(0);

  function buildDisplay(word: string, difficulty: number) {
    const hideCount = Math.ceil(word.length * (0.3 + difficulty * 0.1));
    const indices: number[] = [];
    while (indices.length < hideCount) {
      const i = Math.floor(Math.random() * word.length);
      if (!indices.includes(i)) indices.push(i);
    }
    return word.split('').map((c, i) => (indices.includes(i) ? '_' : c)).join(' ');
  }

  const loadWord = useCallback((r: number, lv: number, sc: number, cc: number) => {
    if (r >= TOTAL_WORDS) {
      setGameOver(true);
      setMessage({ text: `Game Complete! Final Score: ${sc} 🎉`, type: 'success' });
      if (studentId && sc > 0) {
        const updated = updateGameScore(studentId, 'spellingBee', sc);
        if (updated) setBestScore(updated.spellingBee.bestScore);
      }
      return;
    }
    const available = WORDS.filter((w) => w.difficulty <= lv);
    const w = available[Math.floor(Math.random() * available.length)];
    setCurrentWord(w);
    setDisplayWord(buildDisplay(w.word, w.difficulty));
    setHint('');
    setHintUsed(false);
    setInput('');
    setProgress((r / TOTAL_WORDS) * 100);
    inputRef.current?.focus();
  }, [studentId]);

  function startGame() {
    setScore(0); setLevel(1); setCorrectCount(0); setRound(0);
    setGameOver(false); setMessage(null);
    loadWord(0, 1, 0, 0);
  }

  useEffect(() => {
    const token = localStorage.getItem('currentSession');
    if (!token || !getSession(token)) { router.replace('/login'); return; }
    const data = localStorage.getItem('currentStudent');
    if (data) {
      const s = JSON.parse(data);
      const student = getStudentById(s.id);
      if (student) { setStudentId(s.id); setBestScore(student.games.spellingBee.bestScore); }
    }
    loadWord(0, 1, 0, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function checkSpelling() {
    const ans = input.trim().toUpperCase();
    if (!ans) { setMessage({ text: 'Please enter a word!', type: 'error' }); return; }

    const newRound = round + 1;
    setRound(newRound);
    setProgress((newRound / TOTAL_WORDS) * 100);

    if (ans === currentWord.word) {
      const pts = 10 + (!hintUsed ? 5 : 0) + currentWord.difficulty * 5;
      const newScore = score + pts;
      const newCorrect = correctCount + 1;
      setScore(newScore);
      setCorrectCount(newCorrect);

      let newLevel = level;
      if (newCorrect % 3 === 0 && level < 3) { newLevel = level + 1; setLevel(newLevel); }
      setMessage({ text: `Correct! +${pts} points! 🎉`, type: 'success' });
      setTimeout(() => { setMessage(null); loadWord(newRound, newLevel, newScore, newCorrect); }, 1500);
    } else {
      setMessage({ text: `Incorrect! The word was: ${currentWord.word}`, type: 'error' });
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/games')}>← Games</button>
        <h1>Spelling Bee 🐝</h1>
        <div className={styles.scores}>
          <span>Score: <strong>{score}</strong></span>
          <span>Level: <strong>{level}</strong></span>
          <span>Best: <strong>{bestScore}</strong></span>
        </div>
      </header>

      <main className={styles.content}>
        {message && <div className={`${styles.msg} ${styles[message.type]}`}>{message.text}</div>}

        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.counter}>{round} / {TOTAL_WORDS} words · Correct: {correctCount}</p>

        {!gameOver ? (
          <div className={styles.gameCard}>
            <p className={styles.wordDisplay}>{displayWord}</p>
            {hint && <p className={styles.hintText}>Hint: {hint}</p>}

            <div className={styles.controls}>
              <button className={styles.audioBtn} onClick={playAudio} title="Hear the word">🔊</button>
              <button className={styles.hintBtn} onClick={() => { setHint(currentWord.hint); setHintUsed(true); }} disabled={hintUsed}>Hint</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); checkSpelling(); }} className={styles.inputRow}>
              <input
                ref={inputRef}
                type="text"
                className={styles.spellingInput}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type the full word…"
                autoCapitalize="characters"
              />
              <button type="submit" className={styles.submitBtn}>Submit</button>
            </form>

            <button className={styles.newGameBtn} onClick={startGame}>New Game</button>
          </div>
        ) : (
          <div className={styles.gameOver}>
            <h2>Game Complete! 🎉</h2>
            <p>Final Score: <strong>{score}</strong></p>
            <button className={styles.newGameBtn} onClick={startGame}>Play Again</button>
            <button className={styles.backBtn2} onClick={() => router.push('/games')}>Back to Games</button>
          </div>
        )}
      </main>
    </div>
  );
}
