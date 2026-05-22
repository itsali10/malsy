import React, { useState } from "react";
import { PASS_THRESHOLD } from "../data/planets.js";

export default function Quiz({ questions, planetName, onPass, onFail, onContinueNext, nextLevelTitle }) {
  const [answers, setAnswers] = useState(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  /** True only when score is ≥ PASS_THRESHOLD (e.g. 70%) — next level unlocks only then. */
  const [passedQuiz, setPassedQuiz] = useState(false);

  const pick = (qi, optIndex) => {
    if (submitted) return;
    setAnswers((prev) => {
      const n = [...prev];
      n[qi] = optIndex;
      return n;
    });
  };

  const submit = () => {
    if (answers.some((a) => a === null)) {
      setFeedback("Answer every question first!");
      return;
    }
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) correct++;
    });
    const total = questions.length;
    const ratio = correct / total;
    const pct = Math.round(ratio * 100);
    // Require at least 70% (same as PASS_THRESHOLD) to unlock the next level
    const passed = ratio >= PASS_THRESHOLD;
    setSubmitted(true);
    setPassedQuiz(passed);
    setFeedback(
      passed
        ? `Great job! You scored ${pct}% (${correct}/${total}). Next planet unlocked 🚀`
        : `Score ${pct}% (${correct}/${total}) — you need at least ${Math.round(PASS_THRESHOLD * 100)}% to unlock the next level.`
    );
    if (passed) onPass?.({ correct, total, ratio, percent: pct });
    else onFail?.({ correct, total, ratio, percent: pct });
  };

  const retry = () => {
    setAnswers(questions.map(() => null));
    setSubmitted(false);
    setFeedback(null);
    setPassedQuiz(false);
  };

  return (
    <div className="sl-quiz">
      <h3 className="sl-quiz__title">{planetName} quiz</h3>
      <p className="sl-quiz__rule">Score at least {Math.round(PASS_THRESHOLD * 100)}% to unlock the next level.</p>
      <ol className="sl-quiz__list">
        {questions.map((q, qi) => (
          <li key={qi} className="sl-quiz__item">
            <p className="sl-quiz__q">{q.q}</p>
            <div className="sl-quiz__opts">
              {q.options.map((opt, oi) => {
                const sel = answers[qi] === oi;
                const showResult = submitted;
                const isCorrect = oi === q.correctIndex;
                let cls = "sl-quiz__opt";
                if (sel) cls += " sl-quiz__opt--selected";
                if (showResult && sel) cls += isCorrect ? " sl-quiz__opt--ok" : " sl-quiz__opt--bad";
                if (showResult && !sel && isCorrect) cls += " sl-quiz__opt--reveal";
                return (
                  <button
                    key={oi}
                    type="button"
                    className={cls}
                    disabled={submitted}
                    onClick={() => pick(qi, oi)}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {!submitted && (
        <button type="button" className="sl-btn sl-btn--primary sl-btn--big" onClick={submit}>
          Submit answers
        </button>
      )}
      {feedback && (
        <div className={`sl-quiz__feedback ${passedQuiz ? "sl-quiz__feedback--ok" : "sl-quiz__feedback--bad"}`}>
          {feedback}
        </div>
      )}
      {submitted && passedQuiz && onContinueNext && (
        <button type="button" className="sl-btn sl-btn--accent sl-btn--big sl-quiz__next" onClick={onContinueNext}>
          {nextLevelTitle || "Continue →"}
        </button>
      )}
      {submitted && !passedQuiz && (
        <button type="button" className="sl-btn sl-btn--ghost" onClick={retry}>
          Retry quiz
        </button>
      )}
    </div>
  );
}
