'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AvatarWidget from '../AvatarWidget';

interface TutorPanelProps {
  greeting?: string;
  bubbleText: string;
  speaking: boolean;
  expression?: 'idle' | 'happy' | 'encourage' | 'speaking';
}

export default function TutorPanel({
  greeting = "Hi! I'm Jasmine — Your AI Learning Buddy",
  bubbleText,
  speaking,
  expression = 'idle',
}: TutorPanelProps) {
  const [typed, setTyped] = useState('');
  const [showBubble, setShowBubble] = useState(false);

  useEffect(() => {
    setShowBubble(false);
    setTyped('');
    const showTimer = window.setTimeout(() => setShowBubble(true), 120);
    return () => window.clearTimeout(showTimer);
  }, [bubbleText]);

  useEffect(() => {
    if (!showBubble) return;
    let i = 0;
    setTyped('');
    const interval = window.setInterval(() => {
      i += 1;
      setTyped(bubbleText.slice(0, i));
      if (i >= bubbleText.length) window.clearInterval(interval);
    }, speaking ? 18 : 12);
    return () => window.clearInterval(interval);
  }, [bubbleText, showBubble, speaking]);

  const exprClass =
    expression === 'happy'
      ? 'pq-tutor--happy'
      : expression === 'encourage'
        ? 'pq-tutor--encourage'
        : speaking
          ? 'pq-tutor--speaking'
          : '';

  return (
    <aside className={`teacher-stage pq-tutor ${exprClass}${speaking ? ' teacher-stage--speaking' : ''}`}>
      <p className="lesson-tutor__greeting">{greeting}</p>

      <AnimatePresence mode="wait">
        {showBubble && (
          <motion.div
            key={bubbleText}
            className="pq-tutor__bubble"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.25 }}
          >
            <span className="pq-tutor__bubble-text">
              {typed}
              {typed.length < bubbleText.length && (
                <span className="pq-tutor__cursor" aria-hidden>|</span>
              )}
            </span>
            <span className="pq-tutor__bubble-tail" aria-hidden />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="avatar-wrapper pq-tutor__avatar-wrap"
        animate={
          speaking
            ? { y: [0, -3, 0], scale: [1, 1.01, 1] }
            : { y: [0, -5, 0], scale: [1, 1.008, 1] }
        }
        transition={{
          duration: speaking ? 1.2 : 3.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <AvatarWidget variant="lesson" />
      </motion.div>
    </aside>
  );
}
