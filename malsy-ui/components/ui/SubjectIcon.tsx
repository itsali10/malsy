'use client';

import {
  BookOpen,
  FlaskConical,
  Globe,
  Calculator,
  Languages,
  History,
  Atom,
  Palette,
  Music,
  Dumbbell,
  type LucideIcon,
} from 'lucide-react';

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  english: BookOpen,
  history: History,
  science: FlaskConical,
  math: Calculator,
  mathematics: Calculator,
  geography: Globe,
  arabic: Languages,
  physics: Atom,
  art: Palette,
  music: Music,
  pe: Dumbbell,
};

interface SubjectIconProps {
  subject: string;
  emoji?: string;
  size?: number;
  className?: string;
}

export default function SubjectIcon({ subject, emoji, size = 20, className = '' }: SubjectIconProps) {
  const key = subject.toLowerCase().split(/\s+/)[0];
  const Icon = SUBJECT_ICONS[key];

  if (Icon) {
    return <Icon size={size} strokeWidth={2} className={className} aria-hidden />;
  }

  if (emoji) {
    return <span className={`subject-icon-emoji ${className}`.trim()} aria-hidden>{emoji}</span>;
  }

  return <BookOpen size={size} strokeWidth={2} className={className} aria-hidden />;
}

export function renderSubjectIcon(subject: string, emoji?: string, size = 20) {
  return <SubjectIcon subject={subject} emoji={emoji} size={size} />;
}
