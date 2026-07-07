'use client';

import Link from 'next/link';
import { Clock, Lock, Play, Sparkles } from 'lucide-react';
import ProgressBar from './ui/ProgressBar';
import SubjectIcon from './ui/SubjectIcon';
import type { PortalSubject } from '../lib/studentPortalSubjects';
import { getLockedMessage, getSubjectMeta } from '../lib/studentSchedule';
import { journeyStatusDisplay, type JourneyItem } from '../lib/studentJourney';

interface TodaysLearningJourneyProps {
  items: JourneyItem[];
  dateLabel: string;
  loading?: boolean;
  subjects: PortalSubject[];
  onLockedClick?: (item: JourneyItem) => void;
}

function itemClass(item: JourneyItem): string {
  const parts = ['journey-item', `journey-item--${item.status}`];
  if (item.status === 'current') parts.push('journey-item--highlight');
  return parts.join(' ');
}

function statusBadgeClass(item: JourneyItem): string {
  const key =
    item.actionStatus === 'Completed'
      ? 'completed'
      : item.actionStatus === 'Locked'
        ? 'locked'
        : item.status === 'current'
          ? 'current'
          : 'upcoming';
  return `journey-item__status journey-item__status--${key}`;
}

export default function TodaysLearningJourney({
  items,
  dateLabel,
  loading,
  subjects,
  onLockedClick,
}: TodaysLearningJourneyProps) {
  return (
    <section className="dashboard-section journey-section">
      <div className="journey-header">
        <div>
          <div className="journey-header__eyebrow">
            <Sparkles size={14} strokeWidth={2.5} aria-hidden />
            Here&apos;s what we&apos;ll learn today!
          </div>
          <h2 className="journey-header__title">Today&apos;s Learning Journey</h2>
          <p className="journey-header__date">{dateLabel}</p>
        </div>
      </div>

      {loading ? (
        <div className="journey-empty card-sub">Loading today&apos;s schedule…</div>
      ) : items.length === 0 ? (
        <div className="journey-empty card journey-empty--friendly">
          <div className="journey-empty__icon" aria-hidden>☀️</div>
          <p>No lessons today. Enjoy your break!</p>
        </div>
      ) : (
        <div className="journey-list">
          {items.map((item, idx) => {
            const meta = getSubjectMeta(item.subject, subjects);
            const locked = item.actionStatus === 'Locked';
            const lockedMessage = getLockedMessage(item.lockReason);

            return (
              <article
                key={item.id}
                className={itemClass(item)}
                onClick={locked ? () => onLockedClick?.(item) : undefined}
                role={locked ? 'button' : undefined}
                tabIndex={locked ? 0 : undefined}
                onKeyDown={
                  locked
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onLockedClick?.(item);
                        }
                      }
                    : undefined
                }
              >
                <div className="journey-item__rail">
                  <span className="journey-item__step">{idx + 1}</span>
                  {idx < items.length - 1 ? <span className="journey-item__line" aria-hidden /> : null}
                </div>

                <div className="journey-item__icon" style={{ background: meta.bg }}>
                  <SubjectIcon subject={item.subject} emoji={meta.icon} size={22} />
                </div>

                <div className="journey-item__body">
                  <div className="journey-item__top">
                    <span className="journey-item__subject">{item.subject}</span>
                    <span className={statusBadgeClass(item)}>
                      {locked ? <Lock size={11} strokeWidth={2.5} aria-hidden /> : null}
                      {journeyStatusDisplay(item)}
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
                  {item.encouragement ? (
                    <p className="journey-item__encourage">{item.encouragement}</p>
                  ) : null}
                  {locked ? (
                    <p className="journey-item__locked-msg">{lockedMessage}</p>
                  ) : null}
                  {item.progressPercent > 0 ? (
                    <div className="journey-item__progress">
                      <ProgressBar value={item.progressPercent} color={meta.color} />
                      <span className="journey-item__progress-label">{item.progressPercent}%</span>
                    </div>
                  ) : null}
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
