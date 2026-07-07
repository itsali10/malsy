'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { Quiz } from '../../lib/api';
import PronunciationRecorder from '../PronunciationRecorder';
import ConfettiBurst from './ConfettiBurst';

type QuizPhase = 'active' | 'answering' | 'hint' | 'remediation' | 'correct';

interface Feedback {
  text: string;
  kind: 'hint' | 'remediation' | 'correct';
  hintCount?: number;
}

interface PremiumQuizPanelProps {
  quiz: Quiz;
  phase: QuizPhase;
  answer: string;
  answerIndex: number;
  feedback: Feedback | null;
  isListeningMode: boolean;
  isSpeakingMode: boolean;
  sectionKey?: string | null;
  onAnswerChange: (value: string) => void;
  onAnswerIndexChange: (index: number) => void;
  onSubmit: (audioBase64?: string) => void;
  onContinue: () => void;
  continueLabel: string;
  answeredQuestionIndices?: number[];
}

function challengeMeta(quiz: Quiz, sectionKey?: string | null, isListening?: boolean, isSpeaking?: boolean) {
  const type = (quiz.type || quiz.skill || sectionKey || '').toLowerCase();
  if (isListening || type.includes('listen')) {
    return { emoji: '🎧', label: 'Listening Challenge', badge: 'listening', badgeLabel: 'Listening' };
  }
  if (isSpeaking || type.includes('speak') || type.includes('pronunciation')) {
    return { emoji: '🎤', label: 'Pronunciation Challenge', badge: 'pronunciation', badgeLabel: 'Pronunciation' };
  }
  if (type.includes('grammar') || sectionKey === 'grammar') {
    return { emoji: '✏️', label: 'Grammar Challenge', badge: 'grammar', badgeLabel: 'Grammar' };
  }
  if (type.includes('writing') || sectionKey === 'writing') {
    return { emoji: '📝', label: 'Writing Challenge', badge: 'writing', badgeLabel: 'Writing' };
  }
  if (type.includes('reading') || sectionKey === 'reading') {
    return { emoji: '📖', label: 'Reading Challenge', badge: 'reading', badgeLabel: 'Reading' };
  }
  return { emoji: '📘', label: 'Quiz Challenge', badge: 'reading', badgeLabel: 'Quiz' };
}

export default function PremiumQuizPanel({
  quiz,
  phase,
  answer,
  answerIndex,
  feedback,
  isListeningMode,
  isSpeakingMode,
  sectionKey,
  onAnswerChange,
  onAnswerIndexChange,
  onSubmit,
  onContinue,
  continueLabel,
  answeredQuestionIndices = [],
}: PremiumQuizPanelProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [resultState, setResultState] = useState<'idle' | 'checking' | 'revealed'>('idle');
  const [lastSelectedIndex, setLastSelectedIndex] = useState(-1);

  const meta = challengeMeta(quiz, sectionKey, isListeningMode, isSpeakingMode);
  const totalQuestions = Math.max(
    1,
    quiz.lesson_question_total ?? quiz.listening_question_total ?? 1,
  );
  const currentIndex = quiz.lesson_question_index ?? quiz.listening_question_index ?? 0;
  const completedCount = answeredQuestionIndices.length;
  const progressPct = Math.round(((completedCount + (phase === 'correct' ? 1 : 0)) / totalQuestions) * 100);
  const questionsRemaining = Math.max(0, totalQuestions - currentIndex - (phase === 'correct' ? 1 : 0));
  const estimatedSec = Math.max(15, questionsRemaining * 22);

  const hasFeedback = phase === 'hint' || phase === 'remediation' || phase === 'correct';
  const canRetry = phase === 'hint' || phase === 'remediation';
  const isCorrect = phase === 'correct';
  const isWrong = phase === 'hint' || phase === 'remediation';
  const locked = phase === 'correct' || phase === 'answering';

  useEffect(() => {
    if (phase === 'answering') {
      setResultState('checking');
      setLastSelectedIndex(answerIndex);
      return;
    }
    if (hasFeedback) {
      const timer = window.setTimeout(() => {
        setResultState('revealed');
        if (isCorrect) {
          setShowConfetti(true);
          window.setTimeout(() => setShowConfetti(false), 1200);
        }
      }, 380);
      return () => window.clearTimeout(timer);
    }
    setResultState('idle');
  }, [phase, hasFeedback, isCorrect, answerIndex]);

  const barFilled = Math.round((progressPct / 100) * 15);

  return (
    <motion.section
      className="pq-quiz"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      aria-label="Quiz"
    >
      {/* Top progress */}
      <div className="pq-progress-top">
        <div className="pq-progress-top__bar-row">
          <span className="pq-progress-top__ticks" aria-hidden>
            {'━'.repeat(barFilled)}
            <span className="pq-progress-top__ticks-empty">{'━'.repeat(Math.max(0, 15 - barFilled))}</span>
          </span>
          <span className="pq-progress-top__pct">{progressPct}%</span>
        </div>
        <div className="pq-progress-top__meta">
          <span>Questions Remaining: <strong>{questionsRemaining}</strong></span>
          <span>Estimated Time: <strong>{estimatedSec} seconds</strong></span>
        </div>
      </div>

      {/* Question card */}
      <motion.div
        className="pq-question-card"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="pq-question-card__head">
          <span className={`pq-type-badge pq-type-badge--${meta.badge}`}>
            {meta.emoji} {meta.badgeLabel}
          </span>
          <span className="pq-challenge-label">
            {meta.emoji} {meta.label}
          </span>
        </div>

        <div className="pq-question-counter">
          Question {currentIndex + 1} of {totalQuestions}
        </div>

        <div className="pq-dots" role="list" aria-label="Question progress">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const answered = answeredQuestionIndices.includes(i) || (isCorrect && i === currentIndex);
            const current = i === currentIndex;
            return (
              <span
                key={i}
                role="listitem"
                className={[
                  'pq-dot',
                  answered ? 'pq-dot--done' : '',
                  current ? 'pq-dot--current' : '',
                ].filter(Boolean).join(' ')}
                aria-current={current ? 'step' : undefined}
              />
            );
          })}
        </div>

        <h3 className="pq-question-text">{quiz.question}</h3>
      </motion.div>

      {/* Answers */}
      {quiz.options && quiz.options.length > 0 ? (
        <div className="pq-answers" role="listbox" aria-label="Answer choices">
          {quiz.options.map((opt, idx) => {
            const selected = answer === opt || answerIndex === idx;
            const wasSubmitted = lastSelectedIndex === idx && resultState === 'revealed';
            const showCorrect = wasSubmitted && isCorrect;
            const showWrong = wasSubmitted && isWrong;
            return (
              <motion.button
                key={`${opt}-${idx}`}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={locked}
                className={[
                  'pq-answer',
                  selected ? 'pq-answer--selected' : '',
                  showCorrect ? 'pq-answer--correct' : '',
                  showWrong ? 'pq-answer--wrong' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  if (!locked) {
                    onAnswerChange(opt);
                    onAnswerIndexChange(idx);
                  }
                }}
                whileHover={locked ? undefined : { y: -4, boxShadow: '0 12px 32px rgba(139, 108, 255, 0.22)' }}
                whileTap={locked ? undefined : { scale: 0.98 }}
                animate={
                  showWrong
                    ? { x: [0, -6, 6, -4, 4, 0] }
                    : showCorrect
                      ? { scale: [1, 1.02, 1] }
                      : {}
                }
                transition={{ duration: 0.35 }}
              >
                <span className="pq-answer__badge">{String.fromCharCode(65 + idx)}</span>
                <span className="pq-answer__text">{opt}</span>
                {selected && (
                  <motion.span
                    className="pq-answer__check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                  >
                    <Check size={18} aria-hidden />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
      ) : isSpeakingMode ? (
        <div className="pq-speaking-wrap">
          <PronunciationRecorder
            sentence={quiz.sentence || quiz.question}
            disabled={phase === 'correct'}
            onRecorded={b64 => onSubmit(b64)}
          />
        </div>
      ) : (
        <div className="pq-open-answer">
          <textarea
            rows={4}
            className="pq-open-answer__input"
            placeholder="Type your answer here…"
            value={answer}
            onChange={e => onAnswerChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) onSubmit(); }}
            disabled={locked}
            aria-label="Your answer"
          />
          <div className="pq-open-answer__hint">Ctrl + Enter to submit</div>
        </div>
      )}

      {/* Hint / remediation / correct feedback — only after answering */}
      {hasFeedback && feedback && (
        <div className={`lesson-feedback lesson-feedback--${feedback.kind}`}>
          <div className="lesson-feedback__label">
            {feedback.kind === 'correct'
              ? 'Correct!'
              : feedback.kind === 'hint'
                ? `Hint ${(feedback.hintCount ?? 0) + 1}`
                : 'Let me explain that again'}
          </div>
          <div className="lesson-feedback__text">{feedback.text}</div>
        </div>
      )}

      {showConfetti && <ConfettiBurst />}

      {/* Submit / Continue */}
      {phase === 'correct' ? (
        <motion.button
          type="button"
          className="pq-submit"
          onClick={onContinue}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="pq-submit__icon" aria-hidden>➜</span>
          {continueLabel}
        </motion.button>
      ) : !isSpeakingMode ? (
        <motion.button
          type="button"
          className="pq-submit"
          onClick={() => onSubmit()}
          disabled={!answer.trim() || phase === 'answering'}
          whileHover={!answer.trim() || phase === 'answering' ? undefined : { scale: 1.02 }}
          whileTap={!answer.trim() || phase === 'answering' ? undefined : { scale: 0.98 }}
        >
          {phase === 'answering' ? (
            <>
              <Loader2 size={20} className="pq-submit__spin" aria-hidden />
              Checking…
            </>
          ) : (
            <>
              <span className="pq-submit__icon" aria-hidden>➜</span>
              {canRetry ? 'Try Again' : 'Submit Answer'}
            </>
          )}
        </motion.button>
      ) : null}

      {/* Bottom navigator */}
      {totalQuestions > 1 && (
        <nav className="pq-nav" aria-label="Question navigation">
          <button type="button" className="pq-nav__btn" disabled={currentIndex <= 0}>
            <ChevronLeft size={18} aria-hidden />
            Previous
          </button>
          <div className="pq-nav__counter">
            <span className="pq-nav__nums">
              {Array.from({ length: totalQuestions }, (_, i) => {
                const answered = answeredQuestionIndices.includes(i);
                const current = i === currentIndex;
                return (
                  <span
                    key={i}
                    className={[
                      'pq-nav__num',
                      answered ? 'pq-nav__num--answered' : '',
                      current ? 'pq-nav__num--current' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {i + 1}
                  </span>
                );
              })}
            </span>
            <span className="pq-nav__label">Question Navigator</span>
          </div>
          <button type="button" className="pq-nav__btn" disabled={!isCorrect}>
            Next
            <ChevronRight size={18} aria-hidden />
          </button>
        </nav>
      )}
    </motion.section>
  );
}
