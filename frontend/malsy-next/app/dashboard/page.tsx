'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import TeacherPanel from '@/components/TeacherPanel';
import ChatBot from '@/components/ChatBot';
import SettingsModal from '@/components/SettingsModal';
import { logout } from '@/lib/auth';
import { getProgressPercent } from '@/lib/progress';
import { recordVisit, getWeeklyActivity, checkAndUnlock, getEarned, getAll, BadgeDef } from '@/lib/achievements';
import { getStudentById } from '@/lib/database';
import { examScheduleConfig } from '@/core/exam-schedule-config';
import {
  isLoggedInToBackend,
  apiDashboardNextSession,
  apiDashboardMyWeek,
  apiDashboardMySubjects,
  type ApiSchedule,
  type ApiWeekDay,
  type ApiMySubject,
} from '@/lib/api';
import type { Student } from '@/lib/database';
import type { AuthContext } from '@/lib/auth';
import styles from './dashboard.module.css';

function DashboardContent({ ctx }: { ctx: AuthContext }) {
  const router = useRouter();
  const [student, setStudent] = useState<Student>(ctx.student as Student);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<{ text: string; subtext?: string } | null>(null);

  // FastAPI backend data (optional — gracefully hidden if backend offline)
  const [nextSession, setNextSession] = useState<ApiSchedule | null>(null);
  const [myWeek, setMyWeek] = useState<ApiWeekDay[] | null>(null);
  const [mySubjects, setMySubjects] = useState<ApiMySubject[] | null>(null);
  const [backendLoaded, setBackendLoaded] = useState(false);

  const firstName = (student.name?.trim() || 'Student').split(' ')[0];
  const engPct = getProgressPercent(student, 'english');
  const sciPct = getProgressPercent(student, 'science');
  const ssPct = getProgressPercent(student, 'socialStudies');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const streakDays = getWeeklyActivity(student.id).filter((d) => d.active).length;
  const weeklyActivity = getWeeklyActivity(student.id);
  const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const earnedBadges = getEarned(student.id);
  const allBadges = getAll();

  function showToast(title: string, body?: string) {
    setToast({ text: title, subtext: body });
    setTimeout(() => setToast(null), 3200);
  }

  const checkAchievements = useCallback((s: Student) => {
    const newBadges = checkAndUnlock(s);
    newBadges.forEach((badge: BadgeDef, i: number) => {
      setTimeout(() => {
        showToast(`${badge.icon} New Achievement Unlocked!`, `${badge.title} — ${badge.description}`);
      }, i * 1800);
    });
  }, []);

  useEffect(() => {
    recordVisit(student.id);
    checkAchievements(student);
  }, [student, checkAchievements]);

  useEffect(() => {
    if (!isLoggedInToBackend()) return;
    Promise.all([
      apiDashboardNextSession(),
      apiDashboardMyWeek(),
      apiDashboardMySubjects(),
    ]).then(([ns, wk, subs]) => {
      setNextSession(ns);
      setMyWeek(wk);
      setMySubjects(subs);
      setBackendLoaded(true);
    }).catch(() => {});
  }, []);

  function refreshStudent() {
    const updated = getStudentById(student.id);
    if (updated) setStudent(updated);
  }

  function getBannerRec() {
    if (engPct === 0 && sciPct === 0 && ssPct === 0) return { subject: 'english', text: 'Start with English Lesson 1 — Grammar Foundations. Your journey begins here!', btn: 'Start English →' };
    if (engPct < 100 && engPct <= sciPct && engPct <= ssPct) return { subject: 'english', text: `You are ${engPct}% through English. Keep going!`, btn: `Continue English (${engPct}%) →` };
    if (sciPct < 100 && sciPct <= ssPct) return { subject: 'science', text: `You are ${sciPct}% through Science. Let's explore more!`, btn: `Continue Science (${sciPct}%) →` };
    if (ssPct < 100) return { subject: 'socialStudies', text: `You are ${ssPct}% through Social Studies. History and Geography await!`, btn: `Continue Social Studies (${ssPct}%) →` };
    return { subject: null, text: 'Amazing! You have completed all subjects. Try the games or review your grade report.', btn: 'View Grades →' };
  }

  const rec = getBannerRec();

  function handleBannerClick() {
    if (rec.subject) router.push(`/subject/${rec.subject}`);
    else router.push('/grades');
  }

  // Exam schedule helpers
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const sorted = [...examScheduleConfig.exams].sort((a, b) => a.date.localeCompare(b.date));
  const nextIdx = sorted.findIndex((e) => e.date >= today);
  const dayOrder: string[] = [];
  sorted.forEach((e) => { if (!dayOrder.includes(e.date)) dayOrder.push(e.date); });

  function formatDay(iso: string) {
    return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function dotClass(key: string) {
    if (key === 'english') return styles.dotEnglish;
    if (key === 'science') return styles.dotScience;
    if (key === 'socialStudies') return styles.dotSocial;
    return styles.dotDefault;
  }

  let flatIdx = 0;

  return (
    <div className={styles.wrapper}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span>🎓 Malsy</span>
          <span className={styles.brandDot} />
        </div>
        <p className={styles.greeting}>
          {greeting}, <span className={styles.nameAccent}>{firstName}</span> 👋 Ready to learn?
        </p>
        <div className={styles.headerRight}>
          <div className={styles.streakPill}>🔥 <span>{streakDays}</span> day streak</div>
          <div className={styles.profileChip}>
            <div className={styles.avatarWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={student.picture} alt={student.name} className={styles.avatar} />
              <button className={styles.avatarEdit} onClick={() => setShowSettings(true)} title="Edit photo">📷</button>
            </div>
            <div className={styles.profileInfo}>
              <span className={styles.profileName}>{student.name}</span>
              <span className={styles.profileId}>ID: <strong>{student.id}</strong></span>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={() => { if (confirm('Log out?')) logout(ctx.sessionToken); router.replace('/login'); }}>
            Logout
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className={styles.body}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <TeacherPanel name={firstName} engPct={engPct} sciPct={sciPct} ssPct={ssPct} />

          {/* Progress */}
          <div className={styles.card}>
            <p className={styles.cardLabel}>YOUR PROGRESS</p>
            <div className={styles.ringList}>
              {[
                { key: 'english', icon: '📚', label: 'English', pct: engPct, cls: styles.barEnglish },
                { key: 'science', icon: '🔬', label: 'Science', pct: sciPct, cls: styles.barScience },
                { key: 'social', icon: '🌍', label: 'Social Studies', pct: ssPct, cls: styles.barSocial },
              ].map((s) => (
                <div className={styles.ringRow} key={s.key}>
                  <div className={`${styles.ringIcon} ${styles[`icon-${s.key}`]}`}>{s.icon}</div>
                  <div className={styles.ringInfo}>
                    <div className={styles.ringLabel}>{s.label}</div>
                    <div className={styles.progressTrack}>
                      <div className={`${styles.progressFill} ${s.cls}`} style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                  <span className={styles.ringPct}>{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly activity */}
          <div className={styles.card}>
            <p className={styles.cardLabel}>WEEKLY ACTIVITY</p>
            <div className={styles.weekDots}>
              {weeklyActivity.map((day) => {
                const dow = new Date(day.date + 'T12:00:00').getDay();
                return (
                  <div className={styles.weekDot} key={day.date}>
                    <div className={`${styles.dotCircle} ${day.active ? styles.dotActive : ''}`}>
                      {day.active ? '✅' : '·'}
                    </div>
                    <span className={styles.dotLabel}>{dayLabels[dow]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className={styles.main}>
          {/* AI Banner */}
          <div className={styles.aiBanner}>
            <span className={styles.bannerIcon}>🤖</span>
            <div className={styles.bannerText}>
              <h3>Hi {firstName}! Here is what your AI tutor recommends today 🤖</h3>
              <p>{rec.text}</p>
            </div>
            <button className={styles.bannerBtn} onClick={handleBannerClick}>{rec.btn}</button>
          </div>

          {/* Subject Carousel (simplified navigation cards) */}
          <div>
            <p className={styles.sectionTitle}>
              📚 Subjects
              <span className={styles.titlePill}>Choose a subject to start</span>
            </p>
            <div className={styles.subjectGrid}>
              {[
                { slug: 'english', label: 'English', icon: '📖', pct: engPct, cls: styles.fillEnglish, pctCls: styles.pctEnglish },
                { slug: 'science', label: 'Science', icon: '🔬', pct: sciPct, cls: styles.fillScience, pctCls: styles.pctScience },
                { slug: 'socialStudies', label: 'Social Studies', icon: '🌍', pct: ssPct, cls: styles.fillSocial, pctCls: styles.pctSocial },
              ].map((s) => (
                <Link href={`/subject/${s.slug}`} key={s.slug} className={styles.subjectCard}>
                  <div className={styles.subjectCardIcon}>{s.icon}</div>
                  <h3>{s.label}</h3>
                  <div className={styles.cardProgressWrap}>
                    <div className={styles.cardLevelRow}>
                      <span className={styles.cardLevelLabel}>Progress</span>
                      <span className={`${styles.cardPct} ${s.pctCls}`}>{s.pct}%</span>
                    </div>
                    <div className={styles.cardTrack}>
                      <div className={`${styles.cardFill} ${s.cls}`} style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                  <button className={styles.startBtn}>Start learning →</button>
                </Link>
              ))}
            </div>
          </div>

          {/* Action cards row */}
          <div className={styles.cardsRow}>
            <Link href="/games" className={`${styles.actionCard} ${styles.games}`}>
              <div className={`${styles.actionIcon} ${styles.gamesIcon}`}>🎮</div>
              <div className={styles.actionText}>
                <h3>Educational Games</h3>
                <p>Hangman &amp; Spelling Bee</p>
                <div className={styles.actionBadges}>
                  <span className={`${styles.pill} ${styles.pillGames}`}>Hangman</span>
                  <span className={`${styles.pill} ${styles.pillGames}`}>Spelling Bee</span>
                </div>
              </div>
            </Link>
            <Link href="/grades" className={`${styles.actionCard} ${styles.grades}`}>
              <div className={`${styles.actionIcon} ${styles.gradesIcon}`}>📊</div>
              <div className={styles.actionText}>
                <h3>Grade Report</h3>
                <p>View your semester grades</p>
                <div className={styles.actionBadges}>
                  <span className={`${styles.pill} ${styles.pillGrades}`}>Semester 1 &amp; 2</span>
                </div>
              </div>
            </Link>
            <Link href="/virtual-school" className={`${styles.actionCard} ${styles.history}`}>
              <div className={`${styles.actionIcon} ${styles.historyIcon}`}>🏛️</div>
              <div className={styles.actionText}>
                <h3>History Videos</h3>
                <p>AI-generated lesson clips</p>
              </div>
            </Link>
            <Link href="/space-learn" className={`${styles.actionCard} ${styles.space}`}>
              <div className={`${styles.actionIcon} ${styles.spaceIcon}`}>🚀</div>
              <div className={styles.actionText}>
                <h3>Space Learn</h3>
                <p>Explore the planets</p>
              </div>
            </Link>
          </div>

          {/* Achievements */}
          <div>
            <p className={styles.sectionTitle}>
              🏆 Achievements
              <span className={styles.titlePill}>{earnedBadges.length} earned</span>
            </p>
            {earnedBadges.length === 0 ? (
              <p className={styles.noBadges}>Complete lessons to earn your first badge! 🌟</p>
            ) : (
              <div className={styles.achievementsGrid}>
                {allBadges.map((def) => {
                  const isEarned = earnedBadges.some((b) => b.id === def.id);
                  return (
                    <div key={def.id} className={`${styles.badgeChip} ${isEarned ? '' : styles.badgeLocked}`} title={def.description}>
                      <span className={styles.badgeIcon}>{def.icon}</span>
                      <div className={styles.badgeInfo}>
                        <p className={styles.badgeTitle}>{def.title}</p>
                        <p className={styles.badgeDesc}>{def.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Exam schedule */}
          <div>
            <p className={styles.sectionTitle}>
              📅 {examScheduleConfig.title}
              <span className={styles.titlePill}>{dayOrder.length} day{dayOrder.length !== 1 ? 's' : ''} · {sorted.length} session{sorted.length !== 1 ? 's' : ''}</span>
            </p>
            <div className={styles.scheduleCard}>
              <div className={styles.scheduleHeader}>
                <p className={styles.scheduleSubtitle}>{examScheduleConfig.subtitle}</p>
                <span className={styles.yearPill}>{examScheduleConfig.academicYearLabel}</span>
              </div>
              <div className={styles.scheduleDays}>
                {dayOrder.map((dateIso) => {
                  const items = sorted.filter((e) => e.date === dateIso).sort((a, b) => a.startTime.localeCompare(b.startTime));
                  const isToday = dateIso === today;
                  return (
                    <div key={dateIso} className={`${styles.dayBlock} ${isToday ? styles.dayToday : ''}`}>
                      <div className={styles.dayHead}>
                        <span className={styles.dayTitle}>{formatDay(dateIso)}</span>
                        {isToday && <span className={styles.dayChip}>Today</span>}
                      </div>
                      <ul className={styles.sessionList}>
                        {items.map((exam) => {
                          const isNext = flatIdx === nextIdx;
                          flatIdx++;
                          return (
                            <li key={exam.subject} className={`${styles.session} ${isNext ? styles.sessionNext : ''}`}>
                              <span className={styles.sessionTime}>{exam.startTime} – {exam.endTime}</span>
                              <div className={styles.sessionMain}>
                                <span className={`${styles.fe_dot} ${dotClass(exam.subjectKey)}`} />
                                <span className={styles.sessionSubj}>{exam.subject}</span>
                                {isNext && <span className={styles.nextBadge}>Next up</span>}
                              </div>
                              {(exam.room || exam.notes) && (
                                <div className={styles.sessionMeta}>{[exam.room, exam.notes].filter(Boolean).join(' · ')}</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* ── Learning Platform (FastAPI) ── shown only when JWT is present + data loaded */}
          {backendLoaded && (nextSession || (myWeek && myWeek.length > 0) || (mySubjects && mySubjects.length > 0)) && (
            <div>
              <p className={styles.sectionTitle}>
                🏫 Learning Platform
                <span className={styles.titlePill}>Live schedule</span>
              </p>

              <div className={styles.cardsRow} style={{ flexWrap: 'wrap', gap: '1rem' }}>
                {/* Next session card */}
                {nextSession && (
                  <div className={styles.actionCard} style={{ flex: '1 1 260px' }}>
                    <div className={styles.actionIcon}>⏰</div>
                    <div className={styles.actionText}>
                      <h3>Next Session</h3>
                      <p style={{ fontWeight: 600 }}>{nextSession.subject?.subject_name ?? 'Class'}</p>
                      <p style={{ fontSize: '0.82rem', opacity: 0.75 }}>
                        {nextSession.day_of_week} · {nextSession.start_time} – {nextSession.end_time}
                        {nextSession.location ? ` · ${nextSession.location}` : ''}
                      </p>
                      <span className={styles.pill} style={{ marginTop: '0.4rem', display: 'inline-block' }}>{nextSession.session_type}</span>
                    </div>
                  </div>
                )}

                {/* Enrolled subjects count */}
                {mySubjects && mySubjects.length > 0 && (
                  <div className={styles.actionCard} style={{ flex: '1 1 220px' }}>
                    <div className={styles.actionIcon}>📋</div>
                    <div className={styles.actionText}>
                      <h3>My Subjects</h3>
                      <p style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0.2rem 0' }}>{mySubjects.length}</p>
                      <p style={{ fontSize: '0.82rem', opacity: 0.75 }}>enrolled subjects</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
                        {mySubjects.slice(0, 4).map((s) => (
                          <span key={s.subject_id} className={styles.pill}>{s.subject_name}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Weekly timetable */}
              {myWeek && myWeek.length > 0 && (
                <div className={styles.scheduleCard} style={{ marginTop: '1rem' }}>
                  <div className={styles.scheduleHeader}>
                    <p className={styles.scheduleSubtitle}>My Week Timetable</p>
                  </div>
                  <div className={styles.scheduleDays}>
                    {myWeek.map((day) => (
                      <div key={day.day_of_week} className={styles.dayBlock}>
                        <div className={styles.dayHead}>
                          <span className={styles.dayTitle}>{day.day_of_week}</span>
                        </div>
                        <ul className={styles.sessionList}>
                          {day.sessions.map((s) => (
                            <li key={s.schedule_id} className={styles.session}>
                              <span className={styles.sessionTime}>{s.start_time} – {s.end_time}</span>
                              <div className={styles.sessionMain}>
                                <span className={styles.sessionSubj}>{s.subject?.subject_name ?? s.subject_id}</span>
                              </div>
                              {s.location && <div className={styles.sessionMeta}>{s.location}</div>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ChatBot */}
      <ChatBot student={student} />

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          student={student}
          onPhotoUpdated={(url) => { setStudent((s) => ({ ...s, picture: url })); refreshStudent(); }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`achievement-toast show`}>
          <div className="achievement-toast-title">{toast.text}</div>
          {toast.subtext && <div className="achievement-toast-body">{toast.subtext}</div>}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return <AuthGuard>{(ctx) => <DashboardContent ctx={ctx} />}</AuthGuard>;
}
