'use client';
import { useState } from 'react';
import { PASS_THRESHOLD, type PlanetQuestion } from './data/planets';
import styles from './space-learn.module.css';

interface Props {
  questions: PlanetQuestion[];
  planetName: string;
  onPass: (result: { correct: number; total: number; ratio: number; percent: number }) => void;
  onFail: (result: { correct: number; total: number; ratio: number; percent: number }) => void;
  onContinueNext: () => void;
  nextLevelTitle?: string;
}

export default function Quiz({ questions, planetName, onPass, onFail, onContinueNext, nextLevelTitle }: Props) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);

  function pick(qi: number, oi: number) {
    if (submitted) return;
    setAnswers((prev) => { const n = [...prev]; n[qi] = oi; return n; });
  }

  function submit() {
    if (answers.some((a) => a === null)) { setFeedback('Answer every question first!'); return; }
    let correct = 0;
    questions.forEach((q, i) => { if (answers[i] === q.correctIndex) correct++; });
    const total = questions.length;
    const ratio = correct / total;
    const pct = Math.round(ratio * 100);
    const ok = ratio >= PASS_THRESHOLD;
    setSubmitted(true); setPassed(ok);
    setFeedback(ok
      ? `Great job! You scored ${pct}% (${correct}/${total}). Next planet unlocked 🚀`
      : `Score ${pct}% (${correct}/${total}) — need at least ${Math.round(PASS_THRESHOLD * 100)}% to unlock next level.`
    );
    if (ok) onPass({ correct, total, ratio, percent: pct });
    else onFail({ correct, total, ratio, percent: pct });
  }

  function retry() {
    setAnswers(questions.map(() => null));
    setSubmitted(false); setFeedback(null); setPassed(false);
  }

  return (
    <div className={styles.quiz}>
      <h3 className={styles.quizTitle}>{planetName} Quiz</h3>
      <p className={styles.quizRule}>Score at least {Math.round(PASS_THRESHOLD * 100)}% to unlock the next level.</p>
      <ol className={styles.quizList}>
        {questions.map((q, qi) => (
          <li key={qi} className={styles.quizItem}>
            <p className={styles.quizQ}>{q.q}</p>
            <div className={styles.quizOpts}>
              {q.options.map((opt, oi) => {
                const sel = answers[qi] === oi;
                const isCorrect = oi === q.correctIndex;
                let cls = styles.quizOpt;
                if (sel) cls += ` ${styles.quizOptSelected}`;
                if (submitted && sel) cls += isCorrect ? ` ${styles.quizOptOk}` : ` ${styles.quizOptBad}`;
                if (submitted && !sel && isCorrect) cls += ` ${styles.quizOptReveal}`;
                return (
                  <button key={oi} type="button" className={cls} disabled={submitted} onClick={() => pick(qi, oi)}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {!submitted && <button type="button" className={`${styles.slBtn} ${styles.slBtnPrimary}`} onClick={submit}>Submit answers</button>}
      {feedback && <div className={`${styles.quizFeedback} ${passed ? styles.quizFeedbackOk : styles.quizFeedbackBad}`}>{feedback}</div>}
      {submitted && passed && <button type="button" className={`${styles.slBtn} ${styles.slBtnAccent}`} onClick={onContinueNext}>{nextLevelTitle || 'Continue →'}</button>}
      {submitted && !passed && <button type="button" className={`${styles.slBtn} ${styles.slBtnGhost}`} onClick={retry}>Retry quiz</button>}
    </div>
  );
}
