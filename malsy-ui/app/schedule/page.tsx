'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  WEEK_DAYS,
  getAllSubjects,
  getSubjectMeta,
  getTodayName,
  getWeeklySessionCount,
  getSessionsForDay,
  routeForSubject,
  type DayName,
  type ScheduleSession,
} from '../../lib/studentSchedule';

const DAY_ABBR: Record<DayName, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

function getCurrentWeekDates(): Record<DayName, Date> {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  const dates = {} as Record<DayName, Date>;
  WEEK_DAYS.forEach((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates[day] = d;
  });
  return dates;
}

function statusLabel(status: ScheduleSession['status']): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'completed':
      return 'Completed';
    default:
      return 'Scheduled';
  }
}

function statusClass(status: ScheduleSession['status']): string {
  switch (status) {
    case 'available':
      return 'schedule-status schedule-status--available';
    case 'completed':
      return 'schedule-status schedule-status--completed';
    default:
      return 'schedule-status schedule-status--locked';
  }
}

export default function SchedulePage() {
  const router = useRouter();
  const todayName = getTodayName();
  const [selected, setSelected] = useState<DayName>(todayName);
  const weekDates = getCurrentWeekDates();

  const sessions = getSessionsForDay(selected);
  const subjects = getAllSubjects();
  const sessionCount = getWeeklySessionCount();

  const headingBase =
    weekDates[selected]?.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }) ?? selected;
  const heading = selected === todayName ? `${headingBase} · Today` : headingBase;

  function handleSessionClick(session: ScheduleSession) {
    if (session.status === 'available') {
      router.push(routeForSubject(session.subject));
      return;
    }
    alert(`This ${session.subject} session is scheduled for ${selected}, not today.`);
  }

  return (
    <div className="page-enter">
      <div className="week-bar">
        {WEEK_DAYS.map((day) => (
          <div
            key={day}
            onClick={() => setSelected(day)}
            className={[
              'day-btn',
              day === todayName ? 'today' : '',
              'has-class',
              day === selected ? 'selected' : '',
            ]
              .join(' ')
              .trim()}
            style={{ cursor: 'pointer' }}
          >
            <div className="day-name">{DAY_ABBR[day]}</div>
            <div className="day-num">{weekDates[day]?.getDate()}</div>
          </div>
        ))}
      </div>

      <div className="g-left">
        <div>
          <div className="card-title" style={{ marginBottom: 16 }}>{heading}</div>

          <div className="schedule-session-list">
            {sessions.map((session) => {
              const meta = getSubjectMeta(session.subject);
              return (
                <div
                  key={session.id}
                  className={`schedule-session-card${session.status === 'available' ? ' schedule-session-card--active' : ''}`}
                  onClick={() => handleSessionClick(session)}
                  style={{ borderLeftColor: meta.color }}
                >
                  <div className="schedule-session-card__time">{session.time}</div>
                  <div className="schedule-session-card__icon" style={{ background: meta.bg }}>
                    {meta.icon}
                  </div>
                  <div className="schedule-session-card__body">
                    <div className="schedule-session-card__title">{session.title}</div>
                    <div className="schedule-session-card__meta">{session.subject}</div>
                  </div>
                  <span className={statusClass(session.status)}>{statusLabel(session.status)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-title">This Week</div>
            <div className="card-sub">
              {sessionCount} sessions · {WEEK_DAYS.length} days
            </div>
            <div className="schedule-week-active">Weekly schedule active</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {WEEK_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(day)}
                  className={`schedule-week-row${day === selected ? ' schedule-week-row--selected' : ''}`}
                >
                  <span
                    className="schedule-week-row__day"
                    style={{ color: day === todayName ? 'var(--vl)' : 'var(--g2)' }}
                  >
                    {day}
                    {day === todayName ? ' · Today' : ''}
                  </span>
                  <span className="schedule-week-row__count">2 sessions</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">My Subjects</div>
            <div className="card-sub">Enrolled this term</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {subjects.map((subject) => {
                const meta = getSubjectMeta(subject);
                return (
                  <div key={subject} className="schedule-subject-row">
                    <div
                      className="schedule-subject-row__dot"
                      style={{ background: meta.color }}
                    />
                    <span className="schedule-subject-row__name">{subject}</span>
                    <span className="schedule-subject-row__code">{meta.code}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
