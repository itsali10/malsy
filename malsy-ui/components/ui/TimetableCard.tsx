'use client';

import { Lock } from 'lucide-react';

export type TimetableStatus = 'available' | 'completed' | 'locked';

interface TimetableCardProps {
  title: string;
  subject: string;
  icon: React.ReactNode;
  iconBg: string;
  accentColor: string;
  status: TimetableStatus;
  statusLabel: string;
  time?: string;
  progress?: number;
  active?: boolean;
  onClick?: () => void;
}

function statusClass(status: TimetableStatus): string {
  switch (status) {
    case 'available':
      return 'timetable-card__status timetable-card__status--available';
    case 'completed':
      return 'timetable-card__status timetable-card__status--completed';
    default:
      return 'timetable-card__status timetable-card__status--locked';
  }
}

export default function TimetableCard({
  title,
  subject,
  icon,
  iconBg,
  accentColor,
  status,
  statusLabel,
  time,
  progress,
  active,
  onClick,
}: TimetableCardProps) {
  const isLocked = status === 'locked';

  return (
    <div
      className={[
        'timetable-card',
        active ? 'timetable-card--active' : '',
        isLocked ? 'timetable-card--locked' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        ...({ '--timetable-accent': accentColor } as React.CSSProperties),
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      {time ? <div className="timetable-card__time">{time}</div> : null}

      <div className="timetable-card__icon" style={{ background: iconBg }}>
        {icon}
      </div>

      <div className="timetable-card__body">
        <div className="timetable-card__title">{title}</div>
        <div className="timetable-card__subject">{subject}</div>
        {typeof progress === 'number' && progress > 0 ? (
          <div className="timetable-card__progress">
            <div className="timetable-card__progress-bar">
              <div className="timetable-card__progress-fill" style={{ width: `${progress}%`, background: accentColor }} />
            </div>
            <span className="timetable-card__progress-label">{progress}%</span>
          </div>
        ) : null}
      </div>

      <span className={statusClass(status)}>
        {isLocked ? <Lock size={12} strokeWidth={2.5} aria-hidden /> : null}
        {statusLabel}
      </span>
    </div>
  );
}
