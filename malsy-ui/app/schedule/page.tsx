'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import TimetableCard from '../../components/ui/TimetableCard';
import SubjectIcon from '../../components/ui/SubjectIcon';
import DashboardWidget from '../../components/ui/DashboardWidget';
import SectionHeader from '../../components/ui/SectionHeader';
import {
  WEEK_DAYS,
  apiWeekToSchedule,
  getSubjectMeta,
  getTodayName,
  getWeeklySessionCount,
  getSessionsForDayFromApi,
  routeForSession,
  getLockedMessage,
  type DayName,
  type ScheduleSession,
} from '../../lib/studentSchedule';
import { usePortalSubjects } from '../../lib/studentPortalSubjects';

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
      return 'Locked';
  }
}

export default function SchedulePage() {
  const router = useRouter();
  const todayName = getTodayName();
  const { subjects, loading: subjectsLoading } = usePortalSubjects();
  const [selected, setSelected] = useState<DayName>(todayName);
  const [apiWeek, setApiWeek] = useState<Partial<Record<DayName, ScheduleSession[]>>>({});
  const weekDates = getCurrentWeekDates();

  useEffect(() => {
    let cancelled = false;
    api.dashboard.week()
      .then((week) => {
        if (cancelled) return;
        if (!Array.isArray(week)) {
          console.warn('[portal] schedule fetch returned non-array — keeping previous week');
          return;
        }
        console.info('[portal] fetched lesson schedule', week.map((d) => ({
          day: d.day_of_week,
          sessions: d.sessions?.length ?? 0,
        })));
        setApiWeek((prev) => {
          const mapped = apiWeekToSchedule(week);
          const total = Object.values(mapped).flat().length;
          const byDay = WEEK_DAYS.map((d) => ({ day: d, count: mapped[d]?.length ?? 0 }));
          console.info('[portal] generated schedule by day', byDay, 'total=', total);
          if (total === 0 && Object.keys(prev).length === 0) {
            return mapped;
          }
          if (total === 0) {
            console.warn('[portal] mapped schedule empty — keeping previous week');
            return prev;
          }
          return mapped;
        });
      })
      .catch((err) => {
        console.warn('[portal] schedule fetch failed — keeping previous week', err);
      });
    return () => { cancelled = true; };
  }, [subjects]);

  const sessions = getSessionsForDayFromApi(selected, apiWeek);
  const sessionCount = getWeeklySessionCount(apiWeek);

  const headingBase =
    weekDates[selected]?.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }) ?? selected;
  const heading = selected === todayName ? `${headingBase} · Today` : headingBase;

  function handleSessionClick(session: ScheduleSession) {
    if (session.status === 'available' || session.status === 'completed') {
      router.push(routeForSession(session, subjects));
      return;
    }
    alert(getLockedMessage());
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
          <SectionHeader title={heading} subtitle="Tap a lesson to start learning" />

          <div className="schedule-session-list">
            {sessions.length === 0 ? (
              <div className="card-sub">No sessions today</div>
            ) : null}
            {sessions.map((session, idx) => {
              const meta = getSubjectMeta(session.subject, subjects);
              return (
                <TimetableCard
                  key={`${session.id}-${idx}`}
                  title={session.title}
                  subject={session.subject}
                  icon={<SubjectIcon subject={session.subject} emoji={meta.icon} size={20} />}
                  iconBg={meta.bg}
                  accentColor={meta.color}
                  status={session.status}
                  statusLabel={statusLabel(session.status)}
                  active={session.status === 'available'}
                  onClick={() => handleSessionClick(session)}
                />
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DashboardWidget title="This Week" subtitle={`${sessionCount} sessions · ${WEEK_DAYS.length} days`}>
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
                  <span className="schedule-week-row__count">
                    {(apiWeek[day]?.length ?? 0)} sessions
                  </span>
                </button>
              ))}
            </div>
          </DashboardWidget>

          <DashboardWidget title="My Subjects" subtitle="Enrolled this term">
            {subjectsLoading ? (
              <div className="card-sub" style={{ marginTop: 12 }}>Loading…</div>
            ) : subjects.length === 0 ? (
              <div className="card-sub" style={{ marginTop: 12 }}>No enrolled subjects yet.</div>
            ) : (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {subjects.map((subject) => {
                  const meta = getSubjectMeta(subject.subject_name, subjects);
                  return (
                    <div key={subject.subject_id} className="schedule-subject-row">
                      <div
                        className="schedule-subject-row__dot"
                        style={{ background: meta.color }}
                      />
                      <span className="schedule-subject-row__name">{subject.subject_name}</span>
                      <span className="schedule-subject-row__code">{subject.subject_code}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardWidget>
        </div>
      </div>
    </div>
  );
}
