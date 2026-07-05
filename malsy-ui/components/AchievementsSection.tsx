'use client';

import SectionHeader from './ui/SectionHeader';
import type { EarnedAchievement } from '../lib/studentAchievements';

interface AchievementsSectionProps {
  achievements: EarnedAchievement[];
  loading?: boolean;
}

export default function AchievementsSection({ achievements, loading }: AchievementsSectionProps) {
  return (
    <section className="dashboard-section achievements-section">
      <SectionHeader title="Achievements" subtitle="Badges you earn as you learn" />

      {loading ? (
        <div className="achievements-empty card-sub">Loading achievements…</div>
      ) : achievements.length === 0 ? (
        <div className="achievements-empty card">
          <div className="achievements-empty__icon" aria-hidden>
            🏅
          </div>
          <p>Complete your first lesson to earn your first badge.</p>
        </div>
      ) : (
        <div className="achievements-grid">
          {achievements.map((badge) => (
            <div key={badge.id} className="achievement-badge">
              <div className="achievement-badge__icon" style={{ background: badge.bg }}>
                {badge.icon}
              </div>
              <div className="achievement-badge__label" style={{ color: badge.color }}>
                {badge.label}
              </div>
              <div className="achievement-badge__desc">{badge.description}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
