'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import AuthGuard from '@/components/AuthGuard';
import { getStudentById, setChemistryLabVisited } from '@/lib/database';
import { isLinearLessonLocked, isSocialLessonLocked, completeLesson } from '@/lib/progress';
import { learningConfig } from '@/core/learning-config';
import {
  isLoggedInToBackend,
  apiPostEvaluation,
  apiSessionStart,
  apiSessionAnswer,
  type ApiSessionStartResponse,
} from '@/lib/api';
import type { AuthContext } from '@/lib/auth';
import type { Student } from '@/lib/database';
import styles from './subject.module.css';

const ReadingExercise = dynamic(() => import('@/components/ReadingExercise'), { ssr: false });

type SubjectSlug = 'english' | 'science' | 'socialStudies';
const VALID = ['english', 'science', 'socialStudies'];

interface LessonPanelState {
  lessonId: number;
  sectionKey?: string;
}

function SubjectContent({ ctx }: { ctx: AuthContext }) {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as SubjectSlug;

  const [student, setStudent] = useState<Student>(ctx.student as Student);
  const [panel, setPanel] = useState<LessonPanelState | null>(null);
  const [rxOpen, setRxOpen] = useState(false);
  const [toast, setToast] = useState('');

  // AI Teacher panel state
  const [aiTeacherOpen, setAiTeacherOpen] = useState(false);
  const [aiTeacherLessonId, setAiTeacherLessonId] = useState<number | null>(null);
  const [aiSession, setAiSession] = useState<ApiSessionStartResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiFeedback, setAiFeedback] = useState<{ correct?: boolean; hint?: string; remediation?: string } | null>(null);

  if (!VALID.includes(slug)) {
    router.replace('/dashboard');
    return null;
  }

  function refresh() {
    const updated = getStudentById(student.id);
    if (updated) setStudent(updated);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  function handleCompleteLesson(subject: string, lessonId: number, sectionKey?: string) {
    completeLesson(student.id, subject, lessonId, sectionKey || null);
    showToast(`Great work! Lesson ${lessonId} completed.`);
    refresh();
    setPanel(null);

    // Persist completion to FastAPI backend (silent if offline)
    if (isLoggedInToBackend()) {
      apiPostEvaluation({
        subject_id: subject,
        content_id: sectionKey ? `${sectionKey}-${lessonId}` : String(lessonId),
        lesson_completed: true,
        completion_date: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  async function openAiTeacher(lessonId: number) {
    setAiTeacherLessonId(lessonId);
    setAiTeacherOpen(true);
    setAiSession(null);
    setAiFeedback(null);
    setAiAnswer('');
    setAiLoading(true);
    const res = await apiSessionStart(student.id, String(lessonId));
    setAiSession(res);
    setAiLoading(false);
  }

  async function submitAiAnswer() {
    if (!aiAnswer.trim() || !aiTeacherLessonId) return;
    setAiLoading(true);
    const res = await apiSessionAnswer(student.id, aiAnswer.trim());
    if (res) {
      setAiFeedback({ correct: res.correct, hint: res.hint, remediation: res.remediation });
      if (res.teacher_text || res.quiz) {
        setAiSession((prev) => prev ? { ...prev, teacher_text: res.teacher_text, quiz: res.quiz ?? null, next_action: res.next_action } : prev);
        setAiFeedback(null);
      }
      if (res.next_action === 'all_complete') {
        showToast('AI Teacher session complete!');
        setAiTeacherOpen(false);
      }
    }
    setAiAnswer('');
    setAiLoading(false);
  }

  // ── English / Science (linear) ───────────────────────────────────────────
  function renderLinearSubject() {
    const cfg = learningConfig[slug as 'english' | 'science'];
    const progress = student.progress[slug as 'english' | 'science'];
    const completedLessons = progress.completedLessons;

    const panelLesson = panel ? cfg.lessons.find((l) => l.id === panel.lessonId) : null;
    const panelCompleted = panel ? completedLessons.includes(panel.lessonId) : false;
    const panelLocked = panel ? isLinearLessonLocked(completedLessons, panel.lessonId) && !panelCompleted : false;
    const hasRx = slug === 'english' && panelLesson?.readingExercises && panelLesson.readingExercises.length > 0;

    return (
      <div className={styles.layout}>
        {slug === 'science' && (
          <section className={styles.labCard}>
            <div className={styles.labIcon}>⚗️</div>
            <h2>{learningConfig.science.chemistryLab.title}</h2>
            <p>{learningConfig.science.chemistryLab.description}</p>
            <button
              className={styles.btnStart}
              onClick={() => {
                setChemistryLabVisited(student.id);
                router.push('/lab');
              }}
            >
              Open Chemistry Lab
            </button>
          </section>
        )}

        <div className={styles.contentGrid}>
          <section>
            <div className={styles.lessonsContainer}>
              {cfg.lessons.map((lesson) => {
                const isCompleted = completedLessons.includes(lesson.id);
                const isLocked = isLinearLessonLocked(completedLessons, lesson.id) && !isCompleted;
                const cls = isCompleted ? styles.completed : isLocked ? styles.locked : styles.available;
                return (
                  <article key={lesson.id} className={`${styles.lessonCard} ${cls}`} onClick={() => setPanel({ lessonId: lesson.id })}>
                    <div className={styles.lessonNumber}>Lesson {lesson.id}</div>
                    <h3>{lesson.name}</h3>
                    <p>{lesson.description}</p>
                    <div className={styles.lessonStatus}>{isCompleted ? 'Completed' : isLocked ? 'Locked' : 'Ready to Start'}</div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className={styles.detailPanel}>
            {!panel ? (
              <><h3>{cfg.title} Lesson Panel</h3><p>Select any unlocked lesson to view details and mark progress.</p></>
            ) : panelLocked ? (
              <><h3>Lesson {panel.lessonId} is locked</h3><p>Complete Lesson {panel.lessonId - 1} first to unlock this lesson.</p></>
            ) : panelLesson ? (
              <>
                <h3>{panelLesson.name}</h3>
                <p>{panelLesson.description}</p>
                <div className={`${styles.detailStatus} ${panelCompleted ? styles.detailDone : styles.detailActive}`}>
                  {panelCompleted ? 'This lesson is completed.' : 'This lesson is ready.'}
                </div>
                {hasRx && !panelCompleted && (
                  <button className={styles.rxOpenBtn} onClick={() => setRxOpen(true)}>🎤 Start Reading Exercise</button>
                )}
                {isLoggedInToBackend() && (
                  <button className={styles.rxOpenBtn} style={{ marginTop: '8px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }} onClick={() => openAiTeacher(panel.lessonId)}>
                    🤖 Ask AI Teacher
                  </button>
                )}
                <button
                  className={`${styles.btnStart} ${panelCompleted ? styles.btnDisabled : ''}`}
                  disabled={panelCompleted}
                  style={{ marginTop: '10px' }}
                  onClick={() => !panelCompleted && handleCompleteLesson(slug, panel.lessonId)}
                >
                  {panelCompleted ? 'Already Completed' : 'Mark Lesson as Completed'}
                </button>
              </>
            ) : null}
          </aside>
        </div>

        {slug === 'science' && (
          <div className={styles.videoSection}>
            <h3 className={styles.videoTitle}>🚀 Learn About Space</h3>
            <div className={styles.videoEmpty}>
              <span>📂</span>
              <p>No videos uploaded yet</p>
              <p style={{ fontSize: '.85rem', opacity: .7 }}>Register videos in <code>videos/manifest.ts</code> to show them here.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Social Studies ───────────────────────────────────────────────────────
  function renderSocialStudies() {
    const cfg = learningConfig.socialStudies;
    const sections = student.progress.socialStudies.sections;

    const sectionIcons: Record<string, string> = { history: '🏛️', geography: '🗺️' };

    const panelSection = panel?.sectionKey
      ? cfg.sections.find((s) => s.key === panel.sectionKey)
      : null;
    const panelLesson = panelSection ? panelSection.lessons.find((l) => l.id === panel!.lessonId) : null;
    const panelCompleted = panel && panel.sectionKey
      ? sections[panel.sectionKey as 'history' | 'geography'].includes(panel.lessonId)
      : false;
    const panelLocked = panel && panel.sectionKey && !panelCompleted
      ? isSocialLessonLocked(sections[panel.sectionKey as 'history' | 'geography'], panel.lessonId)
      : false;

    return (
      <div className={`${styles.layout} ${styles.socialLayout}`}>
        <section className={styles.socialSections}>
          {cfg.sections.map((section) => (
            <div key={section.key} className={styles.socialBlock}>
              <h2>{sectionIcons[section.key] || '📖'} {section.title}</h2>
              <div className={styles.lessonsContainer}>
                {section.lessons.map((lesson) => {
                  const sectionLessons = sections[section.key as 'history' | 'geography'];
                  const isCompleted = sectionLessons.includes(lesson.id);
                  const isLocked = isSocialLessonLocked(sectionLessons, lesson.id) && !isCompleted;
                  const cls = isCompleted ? styles.completed : isLocked ? styles.locked : styles.available;
                  return (
                    <article key={lesson.id} className={`${styles.lessonCard} ${cls}`} onClick={() => setPanel({ lessonId: lesson.id, sectionKey: section.key })}>
                      <div className={styles.lessonNumber}>{section.key.toUpperCase()} - Lesson {lesson.id}</div>
                      <h3>{lesson.name}</h3>
                      <p>{lesson.description}</p>
                      <div className={styles.lessonStatus}>{isCompleted ? 'Completed' : isLocked ? 'Locked' : 'Ready to Start'}</div>
                    </article>
                  );
                })}
              </div>
              <div className={styles.videoSection}>
                <h3 className={styles.videoTitle}>{sectionIcons[section.key] || '📹'} {section.title} Videos</h3>
                <div className={styles.videoEmpty}><span>📂</span><p>No videos yet. Add MP4s to register them.</p></div>
              </div>
            </div>
          ))}
        </section>

        <aside className={styles.detailPanel}>
          {!panel ? (
            <><h3>Social Studies Lesson Panel</h3><p>Select any unlocked lesson to view details and mark progress.</p></>
          ) : panelLocked ? (
            <><h3>Lesson {panel.lessonId} is locked</h3><p>Complete the previous lesson in this section first.</p></>
          ) : panelLesson && panelSection ? (
            <>
              <h3>{panelSection.title}: {panelLesson.name}</h3>
              <p>{panelLesson.description}</p>
              <div className={`${styles.detailStatus} ${panelCompleted ? styles.detailDone : styles.detailActive}`}>
                {panelCompleted ? 'This lesson is completed.' : 'Ready for the student. Mark complete after finishing.'}
              </div>
              {isLoggedInToBackend() && (
                <button className={styles.rxOpenBtn} style={{ marginTop: '8px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }} onClick={() => openAiTeacher(panel.lessonId)}>
                  🤖 Ask AI Teacher
                </button>
              )}
              <button
                className={`${styles.btnStart} ${panelCompleted ? styles.btnDisabled : ''}`}
                disabled={panelCompleted}
                onClick={() => !panelCompleted && handleCompleteLesson('socialStudies', panel.lessonId, panel.sectionKey)}
              >
                {panelCompleted ? 'Already Completed' : 'Mark Lesson as Completed'}
              </button>
            </>
          ) : null}
        </aside>
      </div>
    );
  }

  const subjectTitle = learningConfig[slug as keyof typeof learningConfig]?.title || slug;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Back</button>
        <h1 className={styles.pageTitle}>{subjectTitle}</h1>
      </header>

      <main className={styles.content}>
        {slug === 'socialStudies' ? renderSocialStudies() : renderLinearSubject()}
      </main>

      {rxOpen && panel && slug === 'english' && (() => {
        const lesson = learningConfig.english.lessons.find((l) => l.id === panel.lessonId);
        return lesson?.readingExercises ? (
          <ReadingExercise
            sentences={[...lesson.readingExercises]}
            lessonName={lesson.name}
            onCompleted={() => {
              handleCompleteLesson('english', panel.lessonId);
              setRxOpen(false);
            }}
            onClose={() => setRxOpen(false)}
          />
        ) : null;
      })()}

      {toast && <div className={styles.toast}>{toast}</div>}

      {/* AI Teacher Modal */}
      {aiTeacherOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1e1b4b', borderRadius: '1rem', padding: '1.5rem', maxWidth: 520, width: '100%', color: '#e0e7ff', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>🤖 AI Teacher — Lesson {aiTeacherLessonId}</h3>
              <button onClick={() => setAiTeacherOpen(false)} style={{ background: 'none', border: 'none', color: '#a5b4fc', fontSize: '1.4rem', cursor: 'pointer' }}>×</button>
            </div>

            {aiLoading && <p style={{ opacity: .7 }}>Thinking…</p>}

            {!aiLoading && aiSession && (
              <>
                {aiSession.teacher_text && (
                  <p style={{ background: 'rgba(99,102,241,.2)', borderRadius: '.5rem', padding: '.75rem', marginBottom: '1rem', lineHeight: 1.6 }}>{aiSession.teacher_text}</p>
                )}

                {aiFeedback && (
                  <div style={{ borderRadius: '.5rem', padding: '.75rem', marginBottom: '1rem', background: aiFeedback.correct ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)' }}>
                    <strong>{aiFeedback.correct ? '✅ Correct!' : '❌ Not quite.'}</strong>
                    {aiFeedback.hint && <p style={{ margin: '.3rem 0 0', fontSize: '.9rem' }}>💡 Hint: {aiFeedback.hint}</p>}
                    {aiFeedback.remediation && <p style={{ margin: '.3rem 0 0', fontSize: '.9rem' }}>📖 {aiFeedback.remediation}</p>}
                  </div>
                )}

                {aiSession.quiz && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontWeight: 600, marginBottom: '.5rem' }}>{aiSession.quiz.question}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                      {aiSession.quiz.options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => setAiAnswer(opt)}
                          style={{ textAlign: 'left', padding: '.5rem .75rem', borderRadius: '.4rem', border: `2px solid ${aiAnswer === opt ? '#6366f1' : 'rgba(165,180,252,.3)'}`, background: aiAnswer === opt ? 'rgba(99,102,241,.3)' : 'transparent', color: '#e0e7ff', cursor: 'pointer' }}
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!aiSession.quiz && (
                  <textarea
                    value={aiAnswer}
                    onChange={(e) => setAiAnswer(e.target.value)}
                    placeholder="Type your answer…"
                    rows={3}
                    style={{ width: '100%', borderRadius: '.5rem', border: '1px solid rgba(165,180,252,.3)', background: 'rgba(255,255,255,.05)', color: '#e0e7ff', padding: '.6rem', fontSize: '.95rem', resize: 'none', boxSizing: 'border-box' }}
                  />
                )}

                <button
                  onClick={submitAiAnswer}
                  disabled={!aiAnswer.trim() || aiLoading}
                  style={{ marginTop: '.75rem', width: '100%', padding: '.7rem', borderRadius: '.5rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: !aiAnswer.trim() ? .5 : 1 }}
                >
                  Submit Answer
                </button>
              </>
            )}

            {!aiLoading && !aiSession && (
              <p style={{ opacity: .7 }}>Could not connect to the AI Teacher. Please ensure the backend is running.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubjectPage() {
  return <AuthGuard>{(ctx) => <SubjectContent ctx={ctx} />}</AuthGuard>;
}
