'use client';

import { motion } from 'framer-motion';

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: (Math.random() - 0.5) * 280,
  y: -(40 + Math.random() * 120),
  rotate: Math.random() * 360,
  color: ['#8B6CFF', '#AFA8FF', '#BEE7FF', '#FFD6E8', '#FFE9A7', '#C8F7DC'][i % 6],
  delay: Math.random() * 0.15,
}));

export default function ConfettiBurst() {
  return (
    <div className="pq-confetti" aria-hidden>
      {PARTICLES.map(p => (
        <motion.span
          key={p.id}
          className="pq-confetti__piece"
          style={{ background: p.color }}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
          animate={{
            opacity: [1, 1, 0],
            x: p.x,
            y: p.y,
            scale: [1, 1.2, 0.6],
            rotate: p.rotate,
          }}
          transition={{ duration: 0.9, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
