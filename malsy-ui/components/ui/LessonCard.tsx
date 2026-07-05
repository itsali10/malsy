'use client';

import { Lock } from 'lucide-react';

interface LessonCardProps {
  title: string;
  subject: string;
  icon: React.ReactNode;
  thumbBg?: string;
  time?: string;
  statusLabel?: string;
  statusVariant?: 'available' | 'completed' | 'locked';
  locked?: boolean;
  onClick?: () => void;
}

export default function LessonCard({
  title,
  subject,
  icon,
  thumbBg = 'var(--color-primary-soft)',
  time,
  statusLabel,
  statusVariant = 'available',
  locked,
  onClick,
}: LessonCardProps) {
  const isLocked = locked ?? statusVariant === 'locked';

  return (
    <div
      className={[
        'lesson-card-ui',
        isLocked ? 'lesson-card-ui--locked' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <div className="lesson-card-ui__thumb" style={{ background: thumbBg }}>
        {icon}
        {isLocked ? (
          <span className="lesson-card-ui__lock-badge" aria-label="Locked">
            <Lock size={14} strokeWidth={2.5} />
          </span>
        ) : null}
      </div>
      <div className="lesson-card-ui__body">
        <div className="lesson-card-ui__subject">{subject}</div>
        <div className="lesson-card-ui__title">{title}</div>
        <div className="lesson-card-ui__meta">
          {time ? <span className="lesson-card-ui__time">{time}</span> : null}
          {statusLabel ? (
            <span className={`lesson-card-ui__status lesson-card-ui__status--${statusVariant}`}>
              {statusLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
