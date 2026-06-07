'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getStudentById, updateGameScore } from '@/lib/database';
import { getSession } from '@/lib/database';
import styles from './hangman.module.css';

const WORDS = [
  { word: 'CHEMISTRY', hint: 'The study of matter and its properties', category: 'Science' },
  { word: 'EXPERIMENT', hint: 'A test to discover something', category: 'Science' },
  { word: 'MOLECULE', hint: 'A group of atoms bonded together', category: 'Science' },
  { word: 'GRAMMAR', hint: 'Rules for using language correctly', category: 'English' },
  { word: 'VOCABULARY', hint: 'Words you know and use', category: 'English' },
  { word: 'SENTENCE', hint: 'A group of words expressing a complete thought', category: 'English' },
  { word: 'CONTINENT', hint: 'Large landmasses on Earth', category: 'Geography' },
  { word: 'CIVILIZATION', hint: 'Advanced human society', category: 'History' },
  { word: 'GOVERNMENT', hint: 'System that rules a country', category: 'Social Studies' },
  { word: 'CULTURE', hint: 'Beliefs and customs of a group', category: 'Social Studies' },
  { word: 'EDUCATION', hint: 'Process of learning', category: 'General' },
  { word: 'KNOWLEDGE', hint: 'Information and understanding', category: 'General' },
  { word: 'STUDENT', hint: 'Someone who learns', category: 'General' },
  { word: 'TEACHER', hint: 'Someone who teaches', category: 'General' },
  { word: 'SCIENCE', hint: 'Study of the natural world', category: 'Science' },
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PARTS = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
const MAX_WRONG = 6;

export default function HangmanPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState(0);
  const [word, setWord] = useState(WORDS[0]);
  const [guessed, setGuessed] = useState<string[]>([]);
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('currentSession');
    if (!token || !getSession(token)) { router.replace('/login'); return; }
    const data = localStorage.getItem('currentStudent');
    if (data) {
      const s = JSON.parse(data);
      const student = getStudentById(s.id);
      if (student) { setStudentId(s.id); setBestScore(student.games.hangman.bestScore); }
    }
    startNewGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNewGame = useCallback(() => {
    setWord(WORDS[Math.floor(Math.random() * WORDS.length)]);
    setGuessed([]);
    setWrong(0);
    setHintUsed(false);
    setShowHint(false);
    setMessage(null);
  }, []);

  function guessLetter(letter: string) {
    if (guessed.includes(letter)) return;
    const newGuessed = [...guessed, letter];
    setGuessed(newGuessed);
    if (!word.word.includes(letter)) {
      const newWrong = wrong + 1;
      setWrong(newWrong);
      if (newWrong >= MAX_WRONG) {
        setMessage({ text: `Game Over! The word was: ${word.word}`, type: 'error' });
        setScore(0);
        setTimeout(startNewGame, 3000);
      }
    } else {
      const allGuessed = word.word.split('').every((l) => newGuessed.includes(l));
      if (allGuessed) {
        const earned = 10 + (wrong === 0 ? 5 : 0);
        const newScore = score + earned;
        setScore(newScore);
        setMessage({ text: 'Congratulations! You guessed it! 🎉', type: 'success' });
        if (studentId && newScore > 0) {
          const updated = updateGameScore(studentId, 'hangman', newScore);
          if (updated) setBestScore(updated.hangman.bestScore);
        }
        setTimeout(startNewGame, 2000);
      }
    }
  }

  const letters = word.word.split('');
  const won = letters.every((l) => guessed.includes(l));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/games')}>← Games</button>
        <h1>Hangman 🔤</h1>
        <div className={styles.scores}>
          <span>Score: <strong>{score}</strong></span>
          <span>Best: <strong>{bestScore}</strong></span>
        </div>
      </header>

      <main className={styles.content}>
        {message && <div className={`${styles.msg} ${styles[message.type]}`}>{message.text}</div>}

        <div className={styles.gameArea}>
          <div className={styles.left}>
            {/* SVG Hangman */}
            <svg className={styles.hangmanSvg} viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg">
              <line x1="20" y1="250" x2="180" y2="250" stroke="#333" strokeWidth="4"/>
              <line x1="60" y1="250" x2="60" y2="20" stroke="#333" strokeWidth="4"/>
              <line x1="60" y1="20" x2="130" y2="20" stroke="#333" strokeWidth="4"/>
              <line x1="130" y1="20" x2="130" y2="50" stroke="#333" strokeWidth="4"/>
              {wrong >= 1 && <circle cx="130" cy="70" r="20" stroke="#333" strokeWidth="3" fill="none"/>}
              {wrong >= 2 && <line x1="130" y1="90" x2="130" y2="150" stroke="#333" strokeWidth="3"/>}
              {wrong >= 3 && <line x1="130" y1="110" x2="100" y2="135" stroke="#333" strokeWidth="3"/>}
              {wrong >= 4 && <line x1="130" y1="110" x2="160" y2="135" stroke="#333" strokeWidth="3"/>}
              {wrong >= 5 && <line x1="130" y1="150" x2="105" y2="185" stroke="#333" strokeWidth="3"/>}
              {wrong >= 6 && <line x1="130" y1="150" x2="155" y2="185" stroke="#333" strokeWidth="3"/>}
            </svg>
            <p className={styles.wrongCount}>{wrong} / {MAX_WRONG} wrong</p>
          </div>

          <div className={styles.right}>
            <div className={styles.category}>Category: {word.category}</div>
            <div className={styles.wordDisplay}>
              {letters.map((letter, i) => (
                <span key={i} className={`${styles.letterSlot} ${guessed.includes(letter) ? styles.revealed : ''}`}>
                  {guessed.includes(letter) ? letter : '_'}
                </span>
              ))}
            </div>

            {showHint && <div className={styles.hintBox}>Hint: {word.hint}</div>}

            <div className={styles.controls}>
              <button className={styles.hintBtn} onClick={() => { setShowHint(true); setHintUsed(true); }} disabled={hintUsed}>Hint</button>
              <button className={styles.newGameBtn} onClick={() => { setScore(0); startNewGame(); }}>New Game</button>
            </div>

            <div className={styles.keyboard}>
              {LETTERS.map((letter) => (
                <button
                  key={letter}
                  className={`${styles.key} ${guessed.includes(letter) ? (word.word.includes(letter) ? styles.keyCorrect : styles.keyWrong) : ''}`}
                  onClick={() => guessLetter(letter)}
                  disabled={guessed.includes(letter) || won || wrong >= MAX_WRONG}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
