'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './space-adventure.module.css';

// ── Config (from original config.js) ──────────────────────────────────────────
interface QuizQuestion { q: string; options: string[]; correctIndex: number; hint: string; }
interface Scene {
  id: number; key: string; title: string; guideText: string;
  interaction: null | { type: 'quiz'; questions: QuizQuestion[] } | { type: 'finale' };
}

const DEMO_VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';
const SCENES: Scene[] = [
  { id: 1, key: 'intro',              title: 'Our solar system',  guideText: 'Watch the intro, then go to each planet pair and quiz.', interaction: null },
  { id: 2, key: 'pair_mercury_venus', title: 'Mercury & Venus',   guideText: 'The inner rocky worlds — then answer 2 questions.',      interaction: { type: 'quiz', questions: [
    { q: 'Which planet is closest to the Sun?', options: ['Mercury','Venus','Earth','Mars'], correctIndex: 0, hint: 'Think smallest orbit!' },
    { q: 'Venus is known for thick clouds and extreme ______.', options: ['Cold','Heat','Ice','Calm weather'], correctIndex: 1, hint: 'It is hotter than Earth!' },
  ]}},
  { id: 3, key: 'pair_earth_mars',    title: 'Earth & Mars',      guideText: 'Home and the red neighbor — quiz time.',                 interaction: { type: 'quiz', questions: [
    { q: 'Which planet has liquid water oceans and life as we know it?', options: ['Mars','Earth','Venus','Jupiter'], correctIndex: 1, hint: 'You live here!' },
    { q: 'Mars looks red because of ______ on its surface.', options: ['Ice','Iron rust / dust','Trees','Gold'], correctIndex: 1, hint: 'Rusty color!' },
  ]}},
  { id: 4, key: 'pair_jupiter_saturn',title: 'Jupiter & Saturn',  guideText: 'Gas giants and rings — 2 questions.',                   interaction: { type: 'quiz', questions: [
    { q: 'Which planet is the largest in our solar system?', options: ['Saturn','Jupiter','Neptune','Earth'], correctIndex: 1, hint: 'Great Red Spot!' },
    { q: 'Saturn is famous for its bright ______.', options: ['Oceans','Rings','Craters','Polar ice caps'], correctIndex: 1, hint: 'Beautiful bands around the planet!' },
  ]}},
  { id: 5, key: 'pair_uranus_neptune',title: 'Uranus & Neptune',  guideText: 'The ice giants at the edge — last quiz!',               interaction: { type: 'quiz', questions: [
    { q: 'Uranus is unusual because its rotation axis is very ______.', options: ['Fast','Tilted','Hot','Small'], correctIndex: 1, hint: 'It rolls along its orbit!' },
    { q: 'Neptune is known for strong ______ and deep blue color.', options: ['Forests','Winds and storms','Deserts','Rings only'], correctIndex: 1, hint: 'Very windy planet!' },
  ]}},
  { id: 6, key: 'finale', title: 'Mission complete', guideText: 'Great work, explorer!', interaction: { type: 'finale' } },
];

const QUIZ_MAX_POINTS = 8;

// ── Component ─────────────────────────────────────────────────────────────────
export default function SpaceAdventurePage() {
  const router = useRouter();
  const [showIntro, setShowIntro] = useState(true);
  const [sceneIdx, setSceneIdx]   = useState(0);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [genStatus, setGenStatus] = useState('');
  const [generating, setGenerating] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [phase, setPhase]         = useState<'video' | 'quiz' | 'done'>('video');
  const [answers, setAnswers]     = useState<(number | null)[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<{ correct: number; total: number } | null>(null);

  const scene = SCENES[sceneIdx];
  const progress = Math.round((sceneIdx / (SCENES.length - 1)) * 100);
  const videoSrc = videoUrls[scene?.key] ?? null;

  const refreshVideos = useCallback(() => {
    fetch('/api/space-adventure-videos')
      .then((r) => r.json())
      .then((d: { videos?: Record<string, string> }) => setVideoUrls(d.videos || {}))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshVideos(); }, [refreshVideos]);

  async function pollJob(jobId: string) {
    try {
      const r = await fetch(`/api/status/${encodeURIComponent(jobId)}`);
      const d = await r.json() as { status: string; progressStep?: number; progressLabel?: string; error?: string };
      if (d.status === 'generating') {
        setGenStatus(`Sora: ${d.progressStep ?? 0}/5 — ${d.progressLabel ?? '…'}`);
        setTimeout(() => pollJob(jobId), 5000);
        return;
      }
      setGenerating(false);
      if (d.status === 'completed') { setGenStatus('All 5 scene videos saved!'); refreshVideos(); }
      else setGenStatus('Failed: ' + (d.error || 'unknown'));
    } catch (e) { setGenerating(false); setGenStatus(String((e as Error).message)); }
  }

  async function generateSora() {
    setGenerating(true); setGenStatus('Starting…');
    try {
      const r = await fetch('/api/generate-space-adventure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json() as { jobId?: string; error?: string };
      if (!r.ok) throw new Error(d.error || 'Request failed');
      pollJob(d.jobId!);
    } catch (e) { setGenerating(false); setGenStatus(String((e as Error).message)); }
  }

  function startLesson() { setShowIntro(false); setSceneIdx(0); setPhase('video'); }

  function resetQuiz() {
    const sc = SCENES[sceneIdx];
    if (sc.interaction?.type === 'quiz') {
      setAnswers(sc.interaction.questions.map(() => null));
    }
    setSubmitted(false); setQuizResult(null);
  }

  function goToScene(idx: number) {
    setSceneIdx(idx);
    const sc = SCENES[idx];
    setPhase('video');
    if (sc.interaction?.type === 'quiz') setAnswers(sc.interaction.questions.map(() => null));
    setSubmitted(false); setQuizResult(null);
  }

  function afterVideo() {
    if (scene.interaction?.type === 'quiz') setPhase('quiz');
    else if (scene.interaction?.type === 'finale') setPhase('done');
    else advanceScene();
  }

  function submitQuiz() {
    const inter = scene.interaction;
    if (inter?.type !== 'quiz') return;
    let correct = 0;
    inter.questions.forEach((q, i) => { if (answers[i] === q.correctIndex) correct++; });
    setTotalScore((s) => s + correct);
    setSubmitted(true); setQuizResult({ correct, total: inter.questions.length });
  }

  function advanceScene() {
    if (sceneIdx < SCENES.length - 1) goToScene(sceneIdx + 1);
  }

  return (
    <div className={styles.page}>
      <div className={styles.stars} aria-hidden="true" />
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={() => router.push('/virtual-school')}>← Virtual School</button>
        <div className={styles.brand}><span>🚀</span> Space Adventure</div>
        <div className={styles.progressOuter}>
          <div className={styles.progressWrap}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          </div>
          <span className={styles.progressLabel}>{progress}%</span>
        </div>
      </header>

      {/* ── Intro Overlay ── */}
      {showIntro && (
        <div className={styles.introOverlay}>
          <div className={styles.introCard}>
            <h2>Welcome to Space Science</h2>
            <p>Real lesson videos are <strong>OpenAI Sora</strong> files on your server (<code>space_intro.mp4</code> … <code>space_pair4.mp4</code>). Generate them here, or they&apos;ll fall back to a demo clip.</p>
            <button type="button" className={styles.btnSecondary} disabled={generating} onClick={generateSora}>
              {generating ? '⏳ Generating…' : 'Generate lesson videos (Sora)'}
            </button>
            {genStatus && <p className={styles.genStatus}>{genStatus}</p>}
            <button type="button" className={styles.btnPrimary} onClick={startLesson}>Start lesson</button>
          </div>
        </div>
      )}

      {!showIntro && (
        <div className={styles.layout}>
          {/* Sidebar */}
          <aside className={styles.sidebar}>
            <div className={styles.rocket}>🚀</div>
            <div className={styles.bubble}>{scene?.guideText ?? 'Ready!'}</div>
            <div className={styles.score}>Score: {totalScore} / {QUIZ_MAX_POINTS}</div>
          </aside>

          {/* Main */}
          <main className={styles.main}>
            {phase === 'done' || scene.interaction?.type === 'finale' ? (
              <div className={styles.finale}>
                <h1>🎉 Mission Complete!</h1>
                <p className={styles.finalScore}>You scored <strong>{totalScore}</strong> out of {QUIZ_MAX_POINTS} quiz points!</p>
                <p>{totalScore >= 6 ? '🏆 Excellent explorer! You mastered the solar system.' : totalScore >= 4 ? '👍 Good work! Keep studying the planets.' : '📚 Keep exploring — revisit the scenes to improve!'}</p>
                <button type="button" className={styles.btnPrimary} onClick={() => { setShowIntro(false); goToScene(0); setTotalScore(0); }}>Play again</button>
              </div>
            ) : (
              <>
                <h1 className={styles.sceneTitle}>{scene.title}</h1>

                {/* Scene navigation */}
                <div className={styles.sceneTabs}>
                  {SCENES.filter((s) => s.interaction?.type !== 'finale').map((s, i) => (
                    <button key={s.id} type="button" className={`${styles.sceneTab} ${sceneIdx === i ? styles.sceneTabActive : ''}`} onClick={() => goToScene(i)}>{s.title}</button>
                  ))}
                </div>

                {/* Video */}
                {phase === 'video' && (
                  <div className={styles.videoSection}>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      key={videoSrc ?? 'demo'}
                      className={styles.video}
                      src={videoSrc ?? DEMO_VIDEO_URL}
                      autoPlay muted controls
                      onEnded={afterVideo}
                    />
                    {!videoSrc && <p className={styles.demoNote}>⚠️ Demo clip — generate real Sora videos for this scene.</p>}
                    <button type="button" className={styles.btnGhost} onClick={afterVideo}>
                      {scene.interaction?.type === 'quiz' ? 'Skip to quiz ⏭️' : 'Continue →'}
                    </button>
                  </div>
                )}

                {/* Quiz */}
                {phase === 'quiz' && scene.interaction?.type === 'quiz' && (
                  <div className={styles.quizSection}>
                    <ol className={styles.quizList}>
                      {scene.interaction.questions.map((q, qi) => (
                        <li key={qi} className={styles.qBlock}>
                          <p className={styles.qText}>{q.q}</p>
                          <p className={styles.qHint}>Hint: {q.hint}</p>
                          {q.options.map((opt, oi) => {
                            const sel = answers[qi] === oi;
                            const isCorrect = oi === q.correctIndex;
                            let cls = styles.qOpt;
                            if (sel) cls += ` ${styles.qOptSel}`;
                            if (submitted && sel) cls += isCorrect ? ` ${styles.qOptOk}` : ` ${styles.qOptBad}`;
                            if (submitted && !sel && isCorrect) cls += ` ${styles.qOptReveal}`;
                            return (
                              <button key={oi} type="button" className={cls} disabled={submitted}
                                onClick={() => setAnswers((prev) => { const n = [...prev]; n[qi] = oi; return n; })}>
                                {opt}
                              </button>
                            );
                          })}
                        </li>
                      ))}
                    </ol>
                    {!submitted && <button type="button" className={styles.btnPrimary} onClick={submitQuiz}>Submit answers</button>}
                    {quizResult && (
                      <div className={`${styles.quizFeedback} ${quizResult.correct === quizResult.total ? styles.feedbackGood : styles.feedbackOk}`}>
                        {quizResult.correct}/{quizResult.total} correct!
                        {submitted && (
                          <div className={styles.quizActions}>
                            <button type="button" className={styles.btnGhost} onClick={resetQuiz}>Retry</button>
                            <button type="button" className={styles.btnPrimary} onClick={advanceScene}>
                              {sceneIdx < SCENES.length - 2 ? `Next: ${SCENES[sceneIdx + 1].title} →` : 'Finish mission 🎉'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
