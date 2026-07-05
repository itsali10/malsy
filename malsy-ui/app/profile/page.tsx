'use client';

import { useEffect, useMemo, useState } from 'react';
import { auth } from '../../lib/auth';
import { api, type UserRead, type LessonEvaluationRead, type ContinueLearningSubjectRead } from '../../lib/api';
import { getStreak } from '../../lib/streak';
import { usePortalSubjects } from '../../lib/studentPortalSubjects';
import { getSubjectMeta } from '../../lib/studentSchedule';
import { computeEarnedAchievements } from '../../lib/studentAchievements';

function avgScores(arr: (number | undefined | null)[]): number | null {
  const vals = arr.filter((v): v is number => v != null && v > 0);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserRead | null>(null);
  const [streak, setStreak] = useState(0);
  const [evals, setEvals] = useState<LessonEvaluationRead[]>([]);
  const [resumeSubjects, setResumeSubjects] = useState<ContinueLearningSubjectRead[]>([]);
  const [loading, setLoading] = useState(true);
  const { subjects, loading: subjectsLoading } = usePortalSubjects();

  useEffect(() => {
    Promise.all([
      api.auth.me().catch(() => auth.getUser()),
      api.evaluations.mine().catch(() => []),
      api.dashboard.continueLearning().catch(() => null),
    ]).then(([u, rows, resume]) => {
      if (u) {
        setUser(u);
        auth.setUser(u);
        setStreak(getStreak(u.user_id));
      }
      setEvals(Array.isArray(rows) ? rows : []);
      setResumeSubjects(resume?.subjects ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const completed = evals.filter((e) => e.lesson_completed).length;
  const quizAvg = avgScores(evals.map((e) => e.overall_score));

  const achievements = useMemo(
    () => computeEarnedAchievements(evals, resumeSubjects, streak),
    [evals, resumeSubjects, streak],
  );

  const initials = user
    ? `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase() || '?'
    : '??';
  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : '—';
  const gradeLabel = user?.grade_level
    ? `Grade ${user.grade_level}`
    : user?.role ?? '';

  const loadingAny = loading || subjectsLoading;

  return (
    <div className="page-enter">
      {/* Hero */}
      <div className="profile-hero">
        <div className="prof-top">
          <div className="prof-av">{initials}</div>
          <div>
            <div className="prof-name">{fullName}</div>
            <div className="prof-class">{gradeLabel}</div>
            {user?.email && (
              <div style={{ fontSize: 12, color: 'var(--g3)', marginTop: 2 }}>{user.email}</div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn btn-o btn-sm">Edit Profile</button>
            <button className="btn btn-v btn-sm">Share Profile</button>
          </div>
        </div>

        <div className="prof-stats">
          <div className="ps-item">
            <div className="ps-n" style={{ color: 'var(--vl)' }}>{completed}</div>
            <div className="ps-l">Lessons Done</div>
          </div>
          <div className="ps-item">
            <div className="ps-n" style={{ color: 'var(--mint)' }}>
              {quizAvg != null ? `${quizAvg}%` : 'No quizzes yet'}
            </div>
            <div className="ps-l">Quiz Average</div>
          </div>
          <div className="ps-item">
            <div className="ps-n" style={{ color: 'var(--amber)' }}>🔥 {streak}</div>
            <div className="ps-l">Day Streak</div>
          </div>
          <div className="ps-item">
            <div className="ps-n" style={{ color: 'var(--sky)' }}>{subjects.length}</div>
            <div className="ps-l">Enrolled Subjects</div>
          </div>
        </div>
      </div>

      <div className="g2">
        {/* Enrolled subjects — same source as Dashboard / Schedule */}
        <div className="card">
          <div className="card-title">My Subjects</div>
          <div className="card-sub">Published & enrolled this term</div>
          {loadingAny ? (
            <div className="card-sub" style={{ marginTop: 12 }}>Loading…</div>
          ) : subjects.length === 0 ? (
            <div className="card-sub" style={{ marginTop: 12 }}>No enrolled subjects yet.</div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {subjects.map((subject) => {
                const meta = getSubjectMeta(subject.subject_name, subjects);
                return (
                  <div key={subject.subject_id} className="schedule-subject-row">
                    <div className="schedule-subject-row__dot" style={{ background: meta.color }} />
                    <span className="schedule-subject-row__name">{subject.icon} {subject.subject_name}</span>
                    <span className="schedule-subject-row__code">{subject.subject_code}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Badges — only earned achievements from real progress */}
        <div className="card">
          <div className="card-title">Badges Earned</div>
          <div className="card-sub">
            {loadingAny
              ? 'Loading…'
              : achievements.length > 0
                ? `${achievements.length} badge${achievements.length === 1 ? '' : 's'} earned`
                : 'Earn badges as you complete lessons'}
          </div>
          {loadingAny ? null : achievements.length === 0 ? (
            <div className="card-sub" style={{ marginTop: 16, lineHeight: 1.5 }}>
              Complete your first lesson to earn your first badge.
            </div>
          ) : (
            <div className="badge-shelf">
              {achievements.map((badge) => (
                <div key={badge.id} className="badge-item">
                  <div className="badge-ico" style={{ background: badge.bg }}>{badge.icon}</div>
                  <div className="badge-lbl" style={{ color: badge.color }}>{badge.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
