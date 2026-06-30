'use client';

import Link from 'next/link';
import ProgressBar from './ui/ProgressBar';
import { getLockedMessage, isSubjectUnlocked } from '../lib/studentSchedule';

interface SubjectCardProps {
  subjectId: string;
  subjectName: string;
  sessionsCount: number;
  icon: string;
  color: string;
  bg: string;
}

export default function SubjectCard({
  subjectId,
  subjectName,
  sessionsCount,
  icon,
  color,
  bg,
}: SubjectCardProps) {
  const unlocked = isSubjectUnlocked(subjectName);
  const key = subjectName.toLowerCase().split(/\s+/)[0];
  const href = `/lessons/subject/${key}`;

  const card = (
    <div className={`subject-card${unlocked ? '' : ' locked'}`}>
      <div className="subj-ico" style={{ background: bg }}>{icon}</div>
      <div className="subj-body">
        <div className="subj-name">{subjectName}</div>
        <div className="subj-meta">{sessionsCount} sessions enrolled</div>
        <div style={{ marginTop: 6 }}>
          <ProgressBar value={0} color={color} />
        </div>
        {!unlocked && (
          <div className="subject-lock-msg">{getLockedMessage()}</div>
        )}
      </div>
      {unlocked ? (
        <div className="subj-pct" style={{ color }}>—</div>
      ) : (
        <span className="lock-badge">🔒 Locked</span>
      )}
    </div>
  );

  if (unlocked) {
    return (
      <Link key={subjectId} href={href}>
        {card}
      </Link>
    );
  }

  return (
    <div
      key={subjectId}
      role="button"
      tabIndex={0}
      aria-disabled
      onClick={() => alert(getLockedMessage())}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          alert(getLockedMessage());
        }
      }}
    >
      {card}
    </div>
  );
}
