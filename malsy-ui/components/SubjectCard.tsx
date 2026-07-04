'use client';

import Link from 'next/link';
import ProgressBar from './ui/ProgressBar';

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
  const key = subjectName.toLowerCase().split(/\s+/)[0];
  const href = `/lessons/subject/${key}`;

  return (
    <Link key={subjectId} href={href}>
      <div className="subject-card">
        <div className="subj-ico" style={{ background: bg }}>{icon}</div>
        <div className="subj-body">
          <div className="subj-name">{subjectName}</div>
          <div className="subj-meta">{sessionsCount} sessions enrolled</div>
          <div style={{ marginTop: 6 }}>
            <ProgressBar value={0} color={color} />
          </div>
        </div>
        <div className="subj-pct" style={{ color }}>—</div>
      </div>
    </Link>
  );
}
