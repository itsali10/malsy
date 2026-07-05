'use client';

import {
  buildSectionStatuses,
  LANGUAGE_LESSON_SECTIONS,
  sectionProgressPercent,
  usesLanguageSections,
} from '../lib/lesson-sections';

interface LessonSectionNavProps {
  chapterId: string;
  unitPart: number;
  maxUnlocked: number;
  switching?: boolean;
  onSelect: (index: number) => void;
}

export default function LessonSectionNav({
  chapterId,
  unitPart,
  maxUnlocked,
  switching = false,
  onSelect,
}: LessonSectionNavProps) {
  const isLanguage = usesLanguageSections(chapterId);

  if (!isLanguage) {
    return (
      <div className="lesson-parts">
        <span className="lesson-parts__label">Part {unitPart + 1} of 2</span>
        <div className="lesson-parts__pills">
          {([0, 1] as const).map(p => {
            const unlocked = p <= maxUnlocked;
            const active = p === unitPart;
            return (
              <button
                key={p}
                type="button"
                disabled={!unlocked || active || switching}
                onClick={() => onSelect(p)}
                className={[
                  'lesson-part-pill',
                  active ? 'lesson-part-pill--active' : '',
                  unlocked ? 'lesson-part-pill--unlocked' : 'lesson-part-pill--locked',
                ].filter(Boolean).join(' ')}
              >
                Part {p + 1}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const statuses = buildSectionStatuses(unitPart, maxUnlocked);
  const progressPct = sectionProgressPercent(unitPart, maxUnlocked);

  return (
    <div className="lesson-section-nav">
      <div className="lesson-section-nav__grid">
        {statuses.map(s => (
          <button
            key={s.key}
            type="button"
            disabled={s.locked || s.active || switching}
            onClick={() => onSelect(s.index)}
            className={[
              'lesson-section-card',
              s.active ? 'lesson-section-card--active' : '',
              s.completed ? 'lesson-section-card--completed' : '',
              s.locked ? 'lesson-section-card--locked' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="lesson-section-card__icon" aria-hidden>{s.icon}</span>
            <span className="lesson-section-card__title">{s.title}</span>
            <span className="lesson-section-card__status">
              {s.completed ? '✔ Completed' : s.active ? 'Active' : s.locked ? 'Locked' : 'Ready'}
            </span>
          </button>
        ))}
      </div>
      <div className="lesson-section-progress">
        <div className="lesson-section-progress__label">
          Lesson Progress — {progressPct}%
        </div>
        <div className="lesson-section-progress__track">
          <div className="lesson-section-progress__fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="lesson-section-progress__steps">
          {LANGUAGE_LESSON_SECTIONS.map((sec, i) => (
            <span
              key={sec.key}
              className={[
                'lesson-section-progress__step',
                i < unitPart ? 'lesson-section-progress__step--done' : '',
                i === unitPart ? 'lesson-section-progress__step--current' : '',
              ].filter(Boolean).join(' ')}
            >
              {sec.title} {i < unitPart ? '✔' : i === unitPart ? '○' : '·'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
