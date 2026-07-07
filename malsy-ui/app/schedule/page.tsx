'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardWidget from '../../components/ui/DashboardWidget';
import LockedLessonNotice from '../../components/ui/LockedLessonNotice';
import { usePortalSubjects } from '../../lib/studentPortalSubjects';
import { useStudentWeekSchedule } from '../../lib/useStudentWeekSchedule';
import {
  WEEK_DAYS,
  getSubjectMeta,
  getTodayName,
  getWeeklySessionCount,
  getSessionsForDayFromApi,
  learnHrefForSession,
  displayStatusLabel,
  routeForSession,
  getLockedMessage,
  formatSessionTimeRange,
  type DayName,
  type ScheduleSession,
} from '../../lib/studentSchedule';

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

export default function SchedulePage() {
  const router = useRouter();
  const todayName = getTodayName();
  const { subjects, loading: subjectsLoading } = usePortalSubjects();
  const subjectSignature = subjects.map((s) => s.subject_key).sort().join(',');
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);
  const { apiWeek } = useStudentWeekSchedule(subjectSignature);
  const weekDates = getCurrentWeekDates();

  const sessionCount = getWeeklySessionCount(apiWeek);

  function handleSessionClick(session: ScheduleSession) {
    const learnHref = learnHrefForSession(session);
    if (learnHref) {
      router.push(learnHref);
      return;
    }
    if (session.status === 'completed') {
      router.push(routeForSession(session, subjects));
      return;
    }
    setLockedNotice(getLockedMessage(session.lock_reason));
  }

  return (
    <div className="page-enter">
      <div className="g-left">
        <div>
          <div className="schedule-timetable">
            {WEEK_DAYS.map((day) => {
              const sessions = getSessionsForDayFromApi(day, apiWeek);
              const isToday = day === todayName;
              return (
                <div
                  key={day}
                  className={`schedule-timetable-row${isToday ? ' schedule-timetable-row--today' : ''}`}
                >
                  <div className="schedule-timetable-daycell">
                    <span className="schedule-timetable-daycell__name">{day}</span>
                    {weekDates[day] ? (
                      <span className="schedule-timetable-daycell__date">{weekDates[day].getDate()}</span>
                    ) : null}
                  </div>
                  <div className="schedule-timetable-cells">
                    {sessions.length === 0 ? (
                      <div className="schedule-timetable-empty">No sessions</div>
                    ) : (
                      sessions.map((session, idx) => {
                        const meta = getSubjectMeta(session.subject, subjects);
                        const timeLabel = formatSessionTimeRange(session.start_time, session.end_time);
                        const [startLabel, endLabel] = (timeLabel ?? '').split(' – ');
                        return (
                          <button
                            key={`${session.id}-${idx}`}
                            type="button"
                            className={`schedule-box schedule-box--${session.status}`}
                            style={{ '--schedule-box-accent': meta.color } as React.CSSProperties}
                            onClick={() => handleSessionClick(session)}
                          >
                            {startLabel ? (
                              <div className="schedule-box__time">
                                <span>{startLabel}</span>
                                {endLabel ? <span>{endLabel}</span> : null}
                              </div>
                            ) : null}
                            <div className="schedule-box__body">
                              <div className="schedule-box__subject">{session.subject}</div>
                              <div className="schedule-box__title">{session.title}</div>
                            </div>
                            <div className="schedule-box__footer">{displayStatusLabel(session)}</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DashboardWidget title="This Week" subtitle={`${sessionCount} sessions · ${WEEK_DAYS.length} days`}>
            <div className="schedule-week-active">Weekly schedule active</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {WEEK_DAYS.map((day) => (
                <div key={day} className="schedule-week-row">
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
                </div>
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

      <LockedLessonNotice
        open={Boolean(lockedNotice)}
        message={lockedNotice ?? ''}
        onClose={() => setLockedNotice(null)}
      />
    </div>
  );
}
