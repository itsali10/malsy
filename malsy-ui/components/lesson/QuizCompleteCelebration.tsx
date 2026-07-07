'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Home, RotateCcw } from 'lucide-react';

export interface QuizStats {
  scoreLabel: string;
  xpEarned: number;
  coinsEarned: number;
  accuracyPct: number;
  hintsUsed: number;
  timeSpentSec: number;
}

interface QuizCompleteCelebrationProps {
  title?: string;
  message: React.ReactNode;
  stats: QuizStats;
  showNextUnit?: boolean;
  nextLessonTitle?: string | null;
  onReview?: () => void;
  onContinue?: () => void;
  onNextUnit?: () => void;
  onNextLesson?: () => void;
  onHome: () => void;
}

function formatTime(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export default function QuizCompleteCelebration({
  title = 'Excellent!',
  message,
  stats,
  showNextUnit,
  nextLessonTitle,
  onReview,
  onContinue,
  onNextUnit,
  onNextLesson,
  onHome,
}: QuizCompleteCelebrationProps) {
  return (
    <motion.div
      className="pq-complete"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        className="pq-complete__star"
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
        aria-hidden
      >
        ⭐
      </motion.div>

      <h2 className="pq-complete__title">{title}</h2>
      <div className="pq-complete__msg">{message}</div>

      <div className="pq-complete__stats">
        <div className="pq-complete__stat pq-complete__stat--hero">
          <span className="pq-complete__stat-label">Score</span>
          <span className="pq-complete__stat-value">{stats.scoreLabel}</span>
        </div>
        <div className="pq-complete__stat">
          <span className="pq-complete__stat-label">XP earned</span>
          <span className="pq-complete__stat-value">+{stats.xpEarned}</span>
        </div>
        <div className="pq-complete__stat">
          <span className="pq-complete__stat-label">Coins earned</span>
          <span className="pq-complete__stat-value">🪙 {stats.coinsEarned}</span>
        </div>
        <div className="pq-complete__stat">
          <span className="pq-complete__stat-label">Accuracy</span>
          <span className="pq-complete__stat-value">{stats.accuracyPct}%</span>
        </div>
        <div className="pq-complete__stat">
          <span className="pq-complete__stat-label">Hints used</span>
          <span className="pq-complete__stat-value">{stats.hintsUsed}</span>
        </div>
        <div className="pq-complete__stat">
          <span className="pq-complete__stat-label">Time spent</span>
          <span className="pq-complete__stat-value">{formatTime(stats.timeSpentSec)}</span>
        </div>
      </div>

      <div className="pq-complete__actions">
        {onReview && (
          <button type="button" className="pq-complete__btn pq-complete__btn--glass" onClick={onReview}>
            <RotateCcw size={18} aria-hidden />
            Review Answers
          </button>
        )}
        {onContinue && (
          <button type="button" className="pq-complete__btn pq-complete__btn--primary" onClick={onContinue}>
            Continue Lesson
            <ArrowRight size={18} aria-hidden />
          </button>
        )}
        {showNextUnit && onNextUnit && (
          <button type="button" className="pq-complete__btn pq-complete__btn--primary" onClick={onNextUnit}>
            Start Next Unit
            <ArrowRight size={18} aria-hidden />
          </button>
        )}
        {nextLessonTitle && onNextLesson && (
          <button type="button" className="pq-complete__btn pq-complete__btn--primary" onClick={onNextLesson}>
            Next Lesson: {nextLessonTitle}
            <ArrowRight size={18} aria-hidden />
          </button>
        )}
        <button type="button" className="pq-complete__btn pq-complete__btn--glass" onClick={onHome}>
          <Home size={18} aria-hidden />
          Return Home
        </button>
      </div>
    </motion.div>
  );
}
