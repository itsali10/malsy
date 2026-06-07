'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PLANETS } from './data/planets';
import LevelMap from './LevelMap';
import VideoPlayer from './VideoPlayer';
import Quiz from './Quiz';
import RocketGuide from './RocketGuide';
import HangmanGame from './HangmanGame';
import { loadProgress, unlockAfterPass, resetAllProgress, hasPassedPlanet } from './ProgressManager';
import type { ProgressState } from './ProgressManager';
import styles from './space-learn.module.css';

interface PlanetVideoStatus { videos: Record<string, string>; count: number; allReady: boolean; }

type Screen = 'map' | 'level' | 'hangman';
type Phase  = 'choose' | 'video' | 'quiz';

export default function SpaceLearnApp() {
  const router = useRouter();
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const [screen, setScreen] = useState<Screen>('map');
  const [planetIndex, setPlanetIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('choose');
  const [planetVideoStatus, setPlanetVideoStatus] = useState<PlanetVideoStatus>({ videos: {}, count: 0, allReady: false });
  const [genMsg, setGenMsg] = useState('');
  const [generatingPlanetId, setGeneratingPlanetId] = useState<string | null>(null);

  const planet = PLANETS[planetIndex];
  const allDone = hasPassedPlanet(7, progress);

  const videoSrc = useMemo(() => {
    if (!planet) return null;
    return planetVideoStatus.videos[planet.id] || null;
  }, [planet, planetVideoStatus]);

  const refreshPlanetVideos = useCallback(() => {
    fetch('/api/space-planet-videos')
      .then((r) => r.json())
      .then((d: { videos?: Record<string, string>; count?: number; allReady?: boolean }) =>
        setPlanetVideoStatus({ videos: d.videos || {}, count: d.count ?? 0, allReady: !!d.allReady })
      )
      .catch(() => {});
  }, []);

  useEffect(() => { refreshPlanetVideos(); }, [refreshPlanetVideos]);
  useEffect(() => { if (screen === 'level') refreshPlanetVideos(); }, [screen, planetIndex, refreshPlanetVideos]);

  const pollPlanetJob = useCallback((jobId: string) => {
    fetch('/api/status/' + encodeURIComponent(jobId))
      .then((r) => r.json())
      .then((d: { status: string; singlePlanet?: boolean; planetId?: string; progressStep?: number; progressLabel?: string; error?: string; videos?: Record<string, string>; count?: number; allReady?: boolean }) => {
        if (d.status === 'generating') {
          setGenMsg(d.singlePlanet ? (d.progressLabel || `Sora: ${d.planetId || '…'}`) : `Sora: ${d.progressStep || 0}/8 — ${d.progressLabel || '…'}`);
          setTimeout(() => pollPlanetJob(jobId), 5000);
          return;
        }
        if (d.status === 'completed') {
          setGeneratingPlanetId(null);
          setGenMsg(d.singlePlanet && d.planetId ? `${d.planetId.charAt(0).toUpperCase() + d.planetId.slice(1)} video saved!` : 'All 8 Sora planet videos saved.');
          refreshPlanetVideos();
          return;
        }
        setGeneratingPlanetId(null);
        setGenMsg('Failed: ' + (d.error || 'unknown'));
      })
      .catch((e: Error) => { setGeneratingPlanetId(null); setGenMsg(e.message); });
  }, [refreshPlanetVideos]);

  const openLevel = useCallback((idx: number) => { setPlanetIndex(idx); setPhase('choose'); setScreen('level'); }, []);
  const goMap     = useCallback(() => { setScreen('map'); setProgress(loadProgress()); }, []);

  const handleQuizPass = useCallback(() => {
    setProgress(unlockAfterPass(planetIndex));
  }, [planetIndex]);

  const startPlanetGeneration = useCallback(() => {
    setGenMsg('Starting…');
    fetch('/api/generate-space-planets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.json().then((data: { jobId?: string; error?: string }) => ({ ok: r.ok, data })))
      .then(({ ok, data }: { ok: boolean; data: { jobId?: string; error?: string } }) => {
        if (!ok) throw new Error(data.error || 'Request failed');
        pollPlanetJob(data.jobId!);
      })
      .catch((e: Error) => setGenMsg(e.message));
  }, [pollPlanetJob]);

  const startSinglePlanetGeneration = useCallback((planetId: string) => {
    setGeneratingPlanetId(planetId);
    setGenMsg('Starting…');
    fetch('/api/generate-space-planet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planetId }) })
      .then((r) => r.json().then((data: { jobId?: string; error?: string }) => ({ ok: r.ok, data })))
      .then(({ ok, data }: { ok: boolean; data: { jobId?: string; error?: string } }) => {
        if (!ok) throw new Error(data.error || 'Request failed');
        pollPlanetJob(data.jobId!);
      })
      .catch((e: Error) => { setGeneratingPlanetId(null); setGenMsg(e.message); });
  }, [pollPlanetJob]);

  return (
    <div className={styles.app}>
      <div className={styles.stars} aria-hidden="true" />
      <header className={styles.appHeader}>
        <div className={styles.appHeaderBrand}>
          <span>🛸</span>
          <div>
            <h1>Space Adventure: Learn the Planets</h1>
            <p>For explorers ages 6–12</p>
          </div>
        </div>
        <nav className={styles.appHeaderNav}>
          <button type="button" className={`${styles.slBtn} ${styles.slBtnGhost}`} onClick={() => router.push('/dashboard')}>← Dashboard</button>
          {(screen === 'level' || screen === 'hangman') && (
            <button type="button" className={`${styles.slBtn} ${styles.slBtnGhost}`} onClick={goMap}>← Level Map</button>
          )}
          {(screen === 'map' || screen === 'level') && (
            <button type="button" className={`${styles.slBtn} ${styles.slBtnGhost}`} onClick={() => setScreen('hangman')}>Space Hangman</button>
          )}
          <button type="button" className={`${styles.slBtn} ${styles.slBtnAccent} ${styles.slBtnSmall}`} onClick={startPlanetGeneration}>
            Generate 8 planet videos (Sora)
          </button>
          <button type="button" className={`${styles.slBtn} ${styles.slBtnDanger}`} onClick={() => {
            if (confirm('Reset all planet progress on this device?')) { resetAllProgress(); setProgress(loadProgress()); setScreen('map'); }
          }}>
            Reset progress
          </button>
        </nav>
      </header>

      {(genMsg || planetVideoStatus.count < 8) && (
        <div className={styles.appBanner}>
          <p>
            <strong>Sora clips on server:</strong> {planetVideoStatus.count}/8{' '}
            {planetVideoStatus.allReady ? '✅ All lessons ready.' : '— generate via per-planet button or "Generate 8" above.'}
          </p>
          {genMsg && <p>{genMsg}</p>}
        </div>
      )}

      <main className={styles.appMain}>
        {screen === 'map' && (
          <>
            <RocketGuide message={allDone ? "You unlocked every planet! You're a solar system expert! 🌟" : "Tap Mercury to begin. Pass each quiz with at least 70% to unlock the next world!"} />
            <div className={styles.hangmanCta}>
              <button type="button" className={`${styles.slBtn} ${styles.slBtnAccent}`} onClick={() => setScreen('hangman')}>Play Space Hangman 🔤</button>
              <p>New word every round — difficulty rises after each solve.</p>
            </div>
            <LevelMap progress={progress} onSelectPlanet={openLevel} serverVideos={planetVideoStatus.videos} onGeneratePlanet={startSinglePlanetGeneration} generatingPlanetId={generatingPlanetId} />
            {allDone && <p className={styles.celebrate}>🎉 Mission complete — you toured all eight planets!</p>}
          </>
        )}

        {screen === 'hangman' && <HangmanGame onBack={goMap} />}

        {screen === 'level' && planet && (
          <section className={styles.levelScreen}>
            <div className={styles.levelScreenHead}>
              <span className={styles.levelEmoji}>{planet.emoji}</span>
              <h2>Level {planet.order + 1}: {planet.name}</h2>
              <p>{planet.guideLine}</p>
            </div>

            {phase === 'choose' && (
              <div className={styles.levelActions}>
                <button type="button" className={`${styles.slBtn} ${styles.slBtnPrimary} ${styles.slBtnHuge}`} disabled={!videoSrc} onClick={() => videoSrc && setPhase('video')}>
                  Watch Video 🎬
                </button>
                <button type="button" className={`${styles.slBtn} ${styles.slBtnAccent} ${styles.slBtnHuge}`} onClick={() => setPhase('quiz')}>
                  Skip Video ⏭️
                </button>
                {!videoSrc && (
                  <p className={styles.noVideo}>
                    Sora video for {planet.name} isn&apos;t on the server yet — use <strong>Generate Sora</strong> on the map or <code>output/final/{planet.id}.mp4</code>.
                  </p>
                )}
              </div>
            )}

            {phase === 'video' && videoSrc && (
              <div className={styles.videoBlock}>
                <VideoPlayer url={videoSrc} planetName={planet.name} planetId={planet.id} onEnded={() => setPhase('quiz')} />
                <button type="button" className={`${styles.slBtn} ${styles.slBtnGhost}`} onClick={() => setPhase('quiz')}>Skip to quiz ⏭️</button>
              </div>
            )}

            {phase === 'quiz' && (
              <>
                <Quiz
                  questions={planet.questions}
                  planetName={planet.name}
                  onPass={handleQuizPass}
                  onFail={() => {}}
                  onContinueNext={() => {
                    if (planetIndex < PLANETS.length - 1) { setPlanetIndex((i) => i + 1); setPhase('choose'); }
                    else goMap();
                  }}
                  nextLevelTitle={planetIndex < PLANETS.length - 1 ? `Next level: ${PLANETS[planetIndex + 1].name} →` : 'Back to map — solar system complete! 🌟'}
                />
                <button type="button" className={`${styles.slBtn} ${styles.slBtnGhost}`} onClick={goMap}>Back to map</button>
              </>
            )}
          </section>
        )}
      </main>

      <footer className={styles.appFooter}>
        <small>Each level expects a Sora MP4 from <code>/api/video/&lt;planet&gt;.mp4</code>. Generate from the map or all 8 from the header.</small>
      </footer>
    </div>
  );
}
