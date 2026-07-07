'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StatCard from '../components/ui/StatCard';
import AvatarWidget from '../components/AvatarWidget';
import TodaysLearningJourney from '../components/TodaysLearningJourney';
import LockedLessonNotice from '../components/ui/LockedLessonNotice';
import {
  api,
  UserRead,
  LessonEvaluationRead,
  ContinueLearningRead,
  EnrollmentRead,
} from '../lib/api';
import { auth } from '../lib/auth';
import { usePortalSubjects } from '../lib/studentPortalSubjects';
import { useRefreshOnWindowFocus } from '../lib/studentPortalRefresh';
import { useStudentWeekSchedule } from '../lib/useStudentWeekSchedule';
import {
  getTodayName,
  getSessionsForDayFromApi,
  getLockedMessage,
} from '../lib/studentSchedule';
import { buildEnrollmentTimeMap, buildTodaysJourneyItems } from '../lib/studentJourney';
import { buildContinueLearningHref } from '../lib/studentResume';
import { getStreak } from '../lib/streak';

function avg(arr: (number | undefined)[]): number {
  const vals = arr.filter((v): v is number => v !== undefined && v > 0);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

export default function DashboardPage() {
  const todayName = getTodayName();
  const { subjects, loading: subjectsLoading } = usePortalSubjects();
  const subjectSignature = useMemo(
    () => subjects.map((s) => s.subject_key).sort().join(','),
    [subjects],
  );
  const { apiWeek, loading: scheduleLoading } = useStudentWeekSchedule(subjectSignature);

  const [user, setUser] = useState<UserRead | null>(auth.getUser());
  const [evals, setEvals] = useState<LessonEvaluationRead[]>([]);
  const [continueLearning, setContinueLearning] = useState<ContinueLearningRead | null>(null);
  const [timeBySubject, setTimeBySubject] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  function loadStudentData() {
    return (async () => {
      const u = await api.auth.me().catch(() => auth.getUser());
      if (u) {
        setUser(u);
        auth.setUser(u);
        setStreak(getStreak(u.user_id));
      }

      const [resume, enrollments, evaluationRows] = await Promise.all([
        api.dashboard.continueLearning().catch(() => null),
        api.enrollments.mine().catch(() => [] as EnrollmentRead[]),
        api.evaluations.mine().catch(() => []),
      ]);

      if (resume && u && String(resume.student_id) === String(u.user_id)) {
        setContinueLearning(resume);
      } else {
        setContinueLearning(null);
      }
      setEvals(Array.isArray(evaluationRows) ? evaluationRows : []);

      const slots = (Array.isArray(enrollments) ? enrollments : []).map((row) => ({
        day_of_week: row.schedule.day_of_week,
        start_time: row.schedule.start_time,
        end_time: row.schedule.end_time,
        subject_name: row.schedule.subject.subject_name,
      }));
      setTimeBySubject(buildEnrollmentTimeMap(slots, todayName));
    })();
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadStudentData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [todayName, subjectSignature]);

  useRefreshOnWindowFocus(() => {
    loadStudentData();
  });

  const todayDateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const resumeByKey = useMemo(() => {
    const map: Record<string, ContinueLearningRead['subjects'][number]> = {};
    for (const row of continueLearning?.subjects ?? []) {
      map[row.subject_key] = row;
    }
    return map;
  }, [continueLearning]);

  const todaySessions = getSessionsForDayFromApi(todayName, apiWeek);

  const journeyItems = useMemo(
    () =>
      buildTodaysJourneyItems(
        todaySessions,
        resumeByKey,
        timeBySubject,
        continueLearning?.primary?.chapter_id,
      ),
    [todaySessions, resumeByKey, timeBySubject, continueLearning?.primary?.chapter_id],
  );

  const firstName = user?.first_name ?? 'there';

  const completed = evals.filter((e) => e.lesson_completed).length;
  const grammar = avg(evals.map((e) => e.grammar_score));
  const comprehension = avg(evals.map((e) => e.comprehension_score));
  const pronunciation = avg(evals.map((e) => e.pronunciation_score));
  const overallAvg = avg(evals.map((e) => e.overall_score));
  const quizAvg =
    overallAvg ||
    (grammar || comprehension || pronunciation ? avg([grammar, comprehension, pronunciation]) : 0);

  const journeyLoading = scheduleLoading || subjectsLoading || loading;

  const continueHref = useMemo(() => {
    const primary = continueLearning?.primary;
    if (primary) {
      const href = buildContinueLearningHref(primary);
      if (href) return href;
    }
    return '/lessons';
  }, [continueLearning]);

  return (
    <div className="page-enter dashboard-page">
      <div className="welcome-banner">
        <div className="welcome-content">
          <div className="dash-greeting">
            Welcome back, <span>{firstName}!</span>
          </div>
          <div className="dash-tagline">
            {loading
              ? 'Loading your progress…'
              : completed > 0
                ? `${completed} lesson${completed > 1 ? 's' : ''} completed — keep it up!`
                : 'Ready to start your first lesson?'}
          </div>
          <div className="welcome-actions">
            <Link href={continueHref}>
              <button type="button" className="btn btn-v">
                Continue lesson
              </button>
            </Link>
            <Link href="/schedule">
              <button type="button" className="btn btn-o">
                View schedule
              </button>
            </Link>
          </div>
        </div>
        <div className="welcome-teacher-stage">
          <div className="avatar-wrapper">
            <AvatarWidget variant="dashboard" />
          </div>
        </div>
      </div>

      <div className="stat-row dashboard-stat-row">
        <StatCard value={String(completed || 0)} label="Lessons done" color="var(--vl)" />
        <StatCard value={quizAvg ? `${quizAvg}%` : '—'} label="Quiz average" color="var(--mint)" />
        <StatCard value={String(streak)} label="Day streak" color="var(--amber)" />
        <StatCard value={String(subjects.length)} label="Subjects" color="var(--sky)" />
      </div>

      <TodaysLearningJourney
        items={journeyItems}
        dateLabel={todayDateLabel}
        loading={journeyLoading}
        subjects={subjects}
        onLockedClick={(item) => setLockedNotice(getLockedMessage(item.lockReason))}
      />

      <LockedLessonNotice
        open={Boolean(lockedNotice)}
        message={lockedNotice ?? ''}
        onClose={() => setLockedNotice(null)}
      />
    </div>
  );
}
