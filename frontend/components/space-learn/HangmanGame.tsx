'use client';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { HANGMAN_TIER_COUNT, getTierIndexForLevel, pickRandomWord, maxWrongForTier } from './data/hangmanWords';
import styles from './space-learn.module.css';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function HangmanFigure({ wrongCount, maxWrong }: { wrongCount: number; maxWrong: number }) {
  const drawStage = maxWrong > 0 ? Math.min(6, Math.ceil((wrongCount / maxWrong) * 6)) : 0;
  const show = (n: number) => drawStage >= n;
  return (
    <svg className={styles.hmFigure} viewBox="0 0 120 140" aria-hidden="true">
      <line x1="10" y1="130" x2="110" y2="130" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="30" y1="130" x2="30" y2="20"  stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="28" y1="20"  x2="85" y2="20"  stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="75" y1="20"  x2="75" y2="35"  stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {show(1) && <circle cx="75" cy="48" r="12" fill="none" stroke="currentColor" strokeWidth="3" />}
      {show(2) && <line x1="75" y1="60" x2="75" y2="95" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      {show(3) && <line x1="75" y1="72" x2="55" y2="88" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      {show(4) && <line x1="75" y1="72" x2="95" y2="88" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      {show(5) && <line x1="75" y1="95" x2="58" y2="118" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      {show(6) && <line x1="75" y1="95" x2="92" y2="118" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}

interface Props { onBack: () => void; }

export default function HangmanGame({ onBack }: Props) {
  const [level, setLevel] = useState(1);
  const [puzzle, setPuzzle] = useState(() => pickRandomWord(0));
  const { word, hint } = puzzle;
  const [guessed, setGuessed] = useState(() => new Set<string>());
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');

  const tierIndex = getTierIndexForLevel(level);
  const maxWrong = maxWrongForTier(tierIndex);

  const wrongCount = useMemo(() => [...guessed].filter((l) => !word.includes(l)).length, [guessed, word]);
  const won  = useMemo(() => word.split('').every((ch) => guessed.has(ch)), [word, guessed]);
  const lost = wrongCount >= maxWrong && !won;

  useEffect(() => {
    if (status !== 'playing') return;
    if (won)       setStatus('won');
    else if (lost) setStatus('lost');
  }, [won, lost, status]);

  const startWord = useCallback((nextLevel: number, previousWord: string | null) => {
    const ti = getTierIndexForLevel(nextLevel);
    setPuzzle(pickRandomWord(ti, previousWord));
    setGuessed(new Set());
    setStatus('playing');
    setLevel(nextLevel);
  }, []);

  const guess = useCallback((letter: string) => {
    if (status !== 'playing' || guessed.has(letter)) return;
    setGuessed((prev) => new Set([...prev, letter]));
  }, [guessed, status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (k.length === 1 && k >= 'A' && k <= 'Z') guess(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guess]);

  const tierLabel = tierIndex + 1;
  const isMaxTier = tierIndex >= HANGMAN_TIER_COUNT - 1;

  return (
    <section className={styles.hm}>
      <div className={styles.hmHead}>
        <h2 className={styles.hmTitle}>Space Hangman</h2>
        <p className={styles.hmSubtitle}>
          Guess the space word — each solve raises the difficulty. Tier {tierLabel} / {HANGMAN_TIER_COUNT}
          {isMaxTier && level > HANGMAN_TIER_COUNT && ' · max tier — words stay expert-level!'}
        </p>
        <p className={styles.hmMeta}>
          Level <strong>{level}</strong> · {maxWrong - wrongCount} wrong guess{maxWrong - wrongCount === 1 ? '' : 'es'} left · New word every round
        </p>
      </div>
      <div className={styles.hmPanel}>
        <p className={styles.hmClue}><span className={styles.hmClueLabel}>Hint</span><span>{hint}</span></p>
        <div className={styles.hmWord} aria-live="polite">
          {word.split('').map((ch, i) => (
            <span key={i} className={styles.hmLetterSlot}>{guessed.has(ch) || status === 'lost' ? ch : '·'}</span>
          ))}
        </div>
        <div className={styles.hmFigureWrap}>
          <HangmanFigure wrongCount={wrongCount} maxWrong={maxWrong} />
        </div>
        {status === 'won' && (
          <div className={`${styles.hmBanner} ${styles.hmBannerWin}`}>
            <p>You got it — <strong>{word}</strong>!</p>
            <p>Next word comes from a harder list.</p>
            <button type="button" className={`${styles.slBtn} ${styles.slBtnPrimary}`} onClick={() => startWord(level + 1, word)}>Next word (harder) →</button>
          </div>
        )}
        {status === 'lost' && (
          <div className={`${styles.hmBanner} ${styles.hmBannerLose}`}>
            <p>The word was <strong>{word}</strong>.</p>
            <p>Same difficulty — try a fresh word.</p>
            <button type="button" className={`${styles.slBtn} ${styles.slBtnAccent}`} onClick={() => startWord(level, word)}>New word (same tier)</button>
          </div>
        )}
        <div className={styles.hmKeyboard}>
          {LETTERS.map((L) => {
            const used = guessed.has(L);
            const inWord = word.includes(L);
            let cls = `${styles.hmKey} ${styles.slBtn}`;
            if (used) cls += inWord ? ` ${styles.hmKeyHit}` : ` ${styles.hmKeyMiss}`;
            else cls += ` ${styles.slBtnGhost}`;
            return (
              <button key={L} type="button" className={cls} disabled={used || status !== 'playing'} onClick={() => guess(L)}>{L}</button>
            );
          })}
        </div>
        <div className={styles.hmFooterActions}>
          <button type="button" className={`${styles.slBtn} ${styles.slBtnGhost}`} onClick={() => startWord(1, null)}>Restart from easiest tier</button>
          <button type="button" className={`${styles.slBtn} ${styles.slBtnGhost}`} onClick={onBack}>← Back to level map</button>
        </div>
      </div>
    </section>
  );
}
