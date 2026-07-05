'use client';

import Link from 'next/link';
import { Clock, Lock, Play } from 'lucide-react';
import SectionHeader from './ui/SectionHeader';
import SubjectIcon from './ui/SubjectIcon';
import type { PortalSubject } from '../lib/studentPortalSubjects';
import { getSubjectMeta } from '../lib/studentSchedule';
import { journeyStatusLabel, type JourneyItem } from '../lib/studentJourney';

interface TodaysLearningJourneyProps {
  items: JourneyItem[];
  loading?: boolean;
  subjects: PortalSubject[];
}

function statusClass(status: JourneyItem['status']): string {
  return `journey-item journey-item--${status}`;
}

function statusBadgeClass(status: JourneyItem['status']): string {
  return `journey-item__status journey-item__status--${status}`;
}

export default function TodaysLearningJourney({
  items,
  loading,
  subjects,
}: TodaysLearningJourneyProps) {
  return (
    <section className="dashboard-section journey-section">
      <SectionHeader
        title="Today's Learning Journey"
        subtitle="Your scheduled lessons for today, in order"
      />

      {loading ? (
        <div className="journey-empty card-sub">Loading today&apos;s schedule…</div>
      ) : items.length === 0 ? (
        <div className="journey-empty card">
          <p>No lessons scheduled today.</p>
        </div>
      ) : (
        <div className="journey-list">
          {items.map((item, idx) => {
            const meta = getSubjectMeta(item.subject, subjects);
            return (
              <article key={item.id} className={statusClass(item.status)}>
                <div className="journey-item__rail">
                  <span className="journey-item__step">{idx + 1}</span>
                  {idx < items.length - 1 ? <span className="journey-item__line" aria-hidden /> : null}
                </div>

                <div className="journey-item__icon" style={{ background: meta.bg }}>
                  <SubjectIcon subject={item.subject} emoji={meta.icon} size={20} />
                </div>

                <div className="journey-item__body">
                  <div className="journey-item__top">
                    <span className="journey-item__subject">{item.subject}</span>
                    <span className={statusBadgeClass(item.status)}>
                      {item.status === 'locked' ? (
                        <Lock size={11} strokeWidth={2.5} aria-hidden />
                      ) : null}
                      {journeyStatusLabel(item.status)}
                    </span>
                  </div>
                  <h3 className="journey-item__title">{item.lessonTitle}</h3>
                  <div className="journey-item__meta">
                    <span className="journey-item__section">{item.sectionTitle}</span>
                    <span className="journey-item__time">
                      <Clock size={12} strokeWidth={2} aria-hidden />
                      {item.timeLabel}
                    </span>
                  </div>
                </div>

                {item.actionHref && item.actionLabel ? (
                  <Link href={item.actionHref} className="btn btn-p btn-sm journey-item__action">
                    <Play size={14} strokeWidth={2.5} aria-hidden />
                    {item.actionLabel}
                  </Link>
                ) : (
                  <div className="journey-item__action-spacer" aria-hidden />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
