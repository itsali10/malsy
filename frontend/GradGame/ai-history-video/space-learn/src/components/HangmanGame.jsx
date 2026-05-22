import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  HANGMAN_TIER_COUNT,
  getTierIndexForLevel,
  pickRandomWord,
  maxWrongForTier,
} from "../data/hangmanWords.js";
import "./HangmanGame.css";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function HangmanFigure({ wrongCount, maxWrong }) {
  const drawStage = maxWrong > 0 ? Math.min(6, Math.ceil((wrongCount / maxWrong) * 6)) : 0;
  const show = (n) => drawStage >= n;
  return (
    <svg className="hm-figure" viewBox="0 0 120 140" aria-hidden="true">
      <line x1="10" y1="130" x2="110" y2="130" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="30" y1="130" x2="30" y2="20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="28" y1="20" x2="85" y2="20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="75" y1="20" x2="75" y2="35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {show(1) && <circle cx="75" cy="48" r="12" fill="none" stroke="currentColor" strokeWidth="3" />}
      {show(2) && <line x1="75" y1="60" x2="75" y2="95" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      {show(3) && <line x1="75" y1="72" x2="55" y2="88" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      {show(4) && <line x1="75" y1="72" x2="95" y2="88" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      {show(5) && <line x1="75" y1="95" x2="58" y2="118" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      {show(6) && <line x1="75" y1="95" x2="92" y2="118" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}

export default function HangmanGame({ onBack }) {
  const [level, setLevel] = useState(1);
  const [puzzle, setPuzzle] = useState(() => pickRandomWord(0));
  const { word, hint } = puzzle;
  const [guessed, setGuessed] = useState(() => new Set());
  const [status, setStatus] = useState("playing");

  const tierIndex = getTierIndexForLevel(level);
  const maxWrong = maxWrongForTier(tierIndex);

  const wrongCount = useMemo(() => {
    return [...guessed].filter((l) => !word.includes(l)).length;
  }, [guessed, word]);

  const won = useMemo(() => {
    return word.split("").every((ch) => guessed.has(ch));
  }, [word, guessed]);

  const lost = wrongCount >= maxWrong && !won;

  useEffect(() => {
    if (status !== "playing") return;
    if (won) setStatus("won");
    else if (lost) setStatus("lost");
  }, [won, lost, status]);

  const startWord = useCallback((nextLevel, previousWord) => {
    const ti = getTierIndexForLevel(nextLevel);
    const entry = pickRandomWord(ti, previousWord);
    setPuzzle(entry);
    setGuessed(new Set());
    setStatus("playing");
    setLevel(nextLevel);
  }, []);

  const guess = useCallback(
    (letter) => {
      if (status !== "playing") return;
      if (guessed.has(letter)) return;
      setGuessed((prev) => new Set([...prev, letter]));
    },
    [guessed, status]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (status !== "playing") return;
      const k = e.key.toUpperCase();
      if (k.length === 1 && k >= "A" && k <= "Z") guess(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guess, status]);

  const onWinContinue = () => startWord(level + 1, word);
  const onLoseRetry = () => startWord(level, word);

  const tierLabel = tierIndex + 1;
  const isMaxTier = tierIndex >= HANGMAN_TIER_COUNT - 1;

  return (
    <section className="hm">
      <div className="hm__head">
        <h2 className="hm__title">Space Hangman</h2>
        <p className="hm__subtitle">
          Guess the space word — each solve raises the difficulty. Tier {tierLabel} / {HANGMAN_TIER_COUNT}
          {isMaxTier && level > HANGMAN_TIER_COUNT && " · max tier — words stay expert-level!"}
        </p>
        <p className="hm__meta">
          Level <strong>{level}</strong> · {maxWrong - wrongCount} wrong guess{maxWrong - wrongCount === 1 ? "" : "es"} left ·
          New word every round
        </p>
      </div>

      <div className="hm__panel">
        <p className="hm__clue" role="note">
          <span className="hm__clue-label">Hint</span>
          <span className="hm__clue-text">{hint}</span>
        </p>
        <div className="hm__word" aria-live="polite">
          {word.split("").map((ch, i) => (
            <span key={i} className="hm__letter-slot">
              {guessed.has(ch) || status === "lost" ? ch : "·"}
            </span>
          ))}
        </div>

        <div className="hm__figure-wrap">
          <HangmanFigure wrongCount={wrongCount} maxWrong={maxWrong} />
        </div>

        {status === "won" && (
          <div className="hm__banner hm__banner--win">
            <p>You got it — <strong>{word}</strong>!</p>
            <p className="hm__banner-hint">Next word comes from a harder list.</p>
            <button type="button" className="sl-btn sl-btn--primary" onClick={onWinContinue}>
              Next word (harder) →
            </button>
          </div>
        )}

        {status === "lost" && (
          <div className="hm__banner hm__banner--lose">
            <p>The word was <strong>{word}</strong>.</p>
            <p className="hm__banner-hint">Same difficulty — try a fresh word.</p>
            <button type="button" className="sl-btn sl-btn--accent" onClick={onLoseRetry}>
              New word (same tier)
            </button>
          </div>
        )}

        <div className="hm__keyboard">
          {LETTERS.map((L) => {
            const used = guessed.has(L);
            const inWord = word.includes(L);
            let cls = "hm__key sl-btn";
            if (used) cls += inWord ? " hm__key--hit" : " hm__key--miss";
            else cls += " sl-btn--ghost";
            return (
              <button
                key={L}
                type="button"
                className={cls}
                disabled={used || status !== "playing"}
                onClick={() => guess(L)}
              >
                {L}
              </button>
            );
          })}
        </div>

        <div className="hm__footer-actions">
          <button type="button" className="sl-btn sl-btn--ghost" onClick={() => startWord(1, null)}>
            Restart from easiest tier
          </button>
          <button type="button" className="sl-btn sl-btn--ghost" onClick={onBack}>
            ← Back to level map
          </button>
        </div>
      </div>
    </section>
  );
}
