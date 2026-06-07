'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './virtual-school.module.css';

// ── Types ──────────────────────────────────────────────────────────────────────
interface QuizQuestion { question: string; options: string[]; correctIndex: number; }
interface HistoryLessonPayload {
  ready: boolean; videoUrl: string | null; scriptUrl: string | null;
  lessonTitle: string | null; quiz: { questions: QuizQuestion[] } | null; script: string | null;
}

type Screen = 'home' | 'lesson';
type Topic  = 'history' | 'space';

const TOPIC_META: Record<Topic, { title: string; blurb: string }> = {
  history: { title: 'History Lesson', blurb: 'Video saves as history_lesson.mp4 — watch anytime without regenerating.' },
  space:   { title: 'Space Science (generate here first)', blurb: 'Sora saves space_home_lesson.mp4 — then open Space Adventure for scenes & quizzes.' },
};

export default function VirtualSchoolPage() {
  const router = useRouter();
  const [screen, setScreen]   = useState<Screen>('home');
  const [topic, setTopic]     = useState<Topic>('history');
  const [status, setStatus]   = useState<{ msg: string; state: 'idle' | 'generating' | 'completed' | 'failed' }>({ msg: '', state: 'idle' });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState<string | null>(null);
  const [script, setScript]   = useState<string | null>(null);
  const [scriptUrl, setScriptUrl] = useState<string | null>(null);
  const [quiz, setQuiz]       = useState<{ questions: QuizQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [score, setScore]     = useState<{ correct: number; total: number } | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── Fetch saved history lesson on mount / topic switch ──
  useEffect(() => {
    if (screen !== 'lesson' || topic !== 'history') return;
    fetch('/api/history-lesson')
      .then((r) => r.json())
      .then((d: HistoryLessonPayload) => {
        setHasSaved(d.ready);
        if (d.ready && d.quiz?.questions?.length) setQuiz(d.quiz);
      })
      .catch(() => setHasSaved(false));
  }, [screen, topic]);

  function openLesson(t: Topic) {
    setTopic(t); setScreen('lesson');
    setVideoUrl(null); setLessonTitle(null); setScript(null); setScriptUrl(null);
    setQuiz(null); setAnswers([]); setScore(null);
    setStatus({ msg: '', state: 'idle' });
  }

  function goHome() {
    setScreen('home'); setHasSaved(false); setGenerating(false);
    setStatus({ msg: '', state: 'idle' }); setVideoUrl(null);
  }

  async function watchSaved() {
    try {
      const r = await fetch('/api/history-lesson');
      const d: HistoryLessonPayload = await r.json();
      if (!d.ready || !d.videoUrl) { setStatus({ msg: 'No saved video. Generate first.', state: 'failed' }); return; }
      applyLesson(d.lessonTitle, d.videoUrl, d.script, d.scriptUrl, d.quiz);
    } catch (e) { setStatus({ msg: String((e as Error).message), state: 'failed' }); }
  }

  function applyLesson(title: string | null, vUrl: string | null, scr: string | null, sUrl: string | null, q: { questions: QuizQuestion[] } | null) {
    setLessonTitle(title); setVideoUrl(vUrl); setScript(scr); setScriptUrl(sUrl);
    if (q?.questions?.length) { setQuiz(q); setAnswers(q.questions.map(() => null)); }
    setStatus({ msg: 'Video ready.', state: 'completed' });
  }

  async function pollStatus(jobId: string) {
    try {
      const r = await fetch(`/api/status/${encodeURIComponent(jobId)}`);
      const d = await r.json() as { status: string; error?: string; videoUrl?: string; lessonTitle?: string; script?: string; scriptUrl?: string; quiz?: { questions: QuizQuestion[] } };
      if (d.status === 'generating') {
        setStatus({ msg: 'Generating video with Sora… This may take several minutes.', state: 'generating' });
        setTimeout(() => pollStatus(jobId), 4000);
      } else if (d.status === 'completed') {
        setGenerating(false);
        applyLesson(d.lessonTitle ?? null, d.videoUrl ?? null, d.script ?? null, d.scriptUrl ?? null, d.quiz ?? null);
        if (topic === 'history') setHasSaved(true);
      } else {
        setGenerating(false);
        setStatus({ msg: 'Failed: ' + (d.error || 'Unknown'), state: 'failed' });
      }
    } catch (e) {
      setGenerating(false);
      setStatus({ msg: String((e as Error).message), state: 'failed' });
    }
  }

  async function generate() {
    setGenerating(true); setVideoUrl(null); setScript(null); setScriptUrl(null); setQuiz(null); setScore(null);
    setStatus({ msg: 'Starting…', state: 'generating' });
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic }) });
      const data = await res.json() as { jobId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Request failed');
      pollStatus(data.jobId!);
    } catch (e) {
      setGenerating(false);
      setStatus({ msg: 'Error: ' + (e as Error).message, state: 'failed' });
    }
  }

  function submitQuiz() {
    if (!quiz) return;
    let correct = 0;
    quiz.questions.forEach((q, i) => { if (answers[i] === q.correctIndex) correct++; });
    setScore({ correct, total: quiz.questions.length });
  }

  return (
    <div className={styles.page}>
      {screen === 'home' && (
        <div className={styles.homeScreen}>
          <h1>Virtual School</h1>
          <p className={styles.tagline}>Pick a subject. <strong>History</strong>: Sora + quiz. <strong>Space science</strong>: Space Adventure levels + videos. <strong>Science lab</strong>: virtual chemistry simulator.</p>
          <div className={styles.homeGrid}>
            <button type="button" className={`${styles.topicTile} ${styles.tileHistory}`} onClick={() => openLesson('history')}>
              <strong>History</strong>
              <span>Ancient Egypt &amp; more — cartoon pyramid teacher</span>
            </button>
            <button type="button" className={`${styles.topicTile} ${styles.tileSpace}`} onClick={() => router.push('/space-learn')}>
              <strong>Space Science</strong>
              <span>Solar system intro, planet pairs, and quizzes</span>
            </button>
            <button type="button" className={`${styles.topicTile} ${styles.tileScience}`} onClick={() => router.push('/lab')}>
              <strong>Science Lab</strong>
              <span>Open the virtual chemistry lab project</span>
            </button>
          </div>
        </div>
      )}

      {screen === 'lesson' && (
        <div className={styles.lessonScreen}>
          <div className={styles.lessonHead}>
            <h1>{TOPIC_META[topic].title}</h1>
            <button type="button" className={styles.backBtn} onClick={goHome}>← Choose another subject</button>
          </div>
          <p className={styles.tagline}>{TOPIC_META[topic].blurb}</p>

          {topic === 'space' && (
            <div className={styles.spaceHint}>
              <strong>Space:</strong> Generate here first — saves <code>space_home_lesson.mp4</code> for Space Adventure.
              Then{' '}<button type="button" className={styles.saLink} onClick={() => router.push('/space-adventure')}>Open Space Adventure →</button>
            </div>
          )}

          <div className={styles.card}>
            <h2>Lesson video</h2>
            <p className={styles.cardHint}>
              {hasSaved ? 'Watch the saved video or regenerate (Sora can take several minutes).' : 'Click Generate to create the lesson video (Sora can take several minutes).'}
            </p>
            <div className={styles.videoActions}>
              {hasSaved && <button type="button" className={styles.btnSecondary} onClick={watchSaved}>Watch saved video</button>}
              <button type="button" className={styles.btnPrimary} disabled={generating} onClick={generate}>
                {hasSaved ? 'Regenerate (Sora)' : 'Generate lesson'}
              </button>
            </div>
            {status.msg && <div className={`${styles.statusBox} ${styles[status.state]}`}>{status.msg}</div>}
            {lessonTitle && <p className={styles.lessonTitle}>{lessonTitle}</p>}
            {videoUrl && (
              /* eslint-disable-next-line jsx-a11y/media-has-caption */
              <video className={styles.video} src={videoUrl + `?_=${Date.now()}`} controls muted={false} />
            )}
            {script && (
              <div className={styles.scriptPanel}>
                <h3>Lesson script</h3>
                <p>{script}</p>
                {scriptUrl && <a className={styles.scriptLink} href={scriptUrl} download>Download script (.txt)</a>}
              </div>
            )}
          </div>

          {topic === 'history' && (
            <div className={`${styles.card} ${styles.quizCard}`}>
              <h2>History quiz</h2>
              {!quiz && <p className={styles.quizIntro}>Questions appear once you generate a lesson (based on the video script).</p>}
              {quiz && !score && (
                <>
                  <ol className={styles.quizList}>
                    {quiz.questions.map((q, qi) => (
                      <li key={qi} className={styles.qBlock}>
                        <strong>Q{qi + 1}. {q.question}</strong>
                        {q.options.map((opt, oi) => (
                          <label key={oi} className={`${styles.qOpt} ${answers[qi] === oi ? styles.qOptSelected : ''}`}>
                            <input type="radio" name={`q${qi}`} value={oi} checked={answers[qi] === oi} onChange={() => setAnswers((prev) => { const n = [...prev]; n[qi] = oi; return n; })} />
                            {opt}
                          </label>
                        ))}
                      </li>
                    ))}
                  </ol>
                  <button type="button" className={styles.btnPrimary} onClick={submitQuiz}>Submit answers</button>
                </>
              )}
              {score && (
                <div className={`${styles.scoreBox} ${score.correct / score.total >= 0.8 ? styles.scoreGood : score.correct / score.total >= 0.5 ? styles.scoreOk : styles.scoreLow}`}>
                  <p>Score: {score.correct} / {score.total} ({Math.round((score.correct / score.total) * 100)}%)</p>
                  <button type="button" className={styles.btnSecondary} onClick={() => { setScore(null); setAnswers(quiz!.questions.map(() => null)); }}>Try again</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
