import React, { useState, useCallback, useMemo, useEffect } from "react";
import { PLANETS } from "./data/planets.js";
import LevelMap from "./components/LevelMap.jsx";
import VideoPlayer from "./components/VideoPlayer.jsx";
import Quiz from "./components/Quiz.jsx";
import RocketGuide from "./components/RocketGuide.jsx";
import HangmanGame from "./components/HangmanGame.jsx";
import { loadProgress, unlockAfterPass, resetAllProgress, hasPassedPlanet } from "./components/ProgressManager.js";
import "./App.css";

export default function App() {
  const [progress, setProgress] = useState(() => loadProgress());
  const [screen, setScreen] = useState("map"); // map | level | hangman
  const [planetIndex, setPlanetIndex] = useState(0);
  /** choose | video | quiz */
  const [phase, setPhase] = useState("choose");

  const planet = PLANETS[planetIndex];

  /** Only play URLs the server lists — those files are Sora exports in output/final/. */
  const [planetVideoStatus, setPlanetVideoStatus] = useState({ videos: {}, count: 0, allReady: false });

  const refreshPlanetVideos = useCallback(() => {
    fetch("/api/space-planet-videos")
      .then((r) => r.json())
      .then((d) =>
        setPlanetVideoStatus({
          videos: d.videos || {},
          count: d.count ?? 0,
          allReady: !!d.allReady,
        })
      )
      .catch(() => {});
  }, []);

  const videoSrc = useMemo(() => {
    if (!planet) return null;
    return planetVideoStatus.videos[planet.id] || null;
  }, [planet, planetVideoStatus]);

  const openLevel = useCallback((idx) => {
    setPlanetIndex(idx);
    setPhase("choose");
    setScreen("level");
  }, []);

  const goMap = useCallback(() => {
    setScreen("map");
    setProgress(loadProgress());
  }, []);

  const handleQuizPass = useCallback(() => {
    const next = unlockAfterPass(planetIndex);
    setProgress(next);
  }, [planetIndex]);

  const allDone = hasPassedPlanet(7, progress);

  const [genMsg, setGenMsg] = useState("");
  /** While a single-planet Sora job runs, which planet id (for button spinners). */
  const [generatingPlanetId, setGeneratingPlanetId] = useState(null);

  useEffect(() => {
    refreshPlanetVideos();
  }, [refreshPlanetVideos]);

  useEffect(() => {
    if (screen === "level") refreshPlanetVideos();
  }, [screen, planetIndex, refreshPlanetVideos]);

  const pollPlanetJob = useCallback(
    (jobId) => {
      fetch("/api/status/" + encodeURIComponent(jobId))
        .then((r) => r.json())
        .then((d) => {
          if (d.status === "generating") {
            if (d.singlePlanet) {
              setGenMsg(d.progressLabel || `Sora: ${d.planetId || "…"}`);
            } else {
              setGenMsg(`Sora: ${d.progressStep || 0}/8 — ${d.progressLabel || "…"}`);
            }
            setTimeout(() => pollPlanetJob(jobId), 5000);
            return;
          }
          if (d.status === "completed") {
            setGeneratingPlanetId(null);
            if (d.singlePlanet && d.planetId) {
              const name = d.planetId.charAt(0).toUpperCase() + d.planetId.slice(1);
              setGenMsg(`${name} video saved — you can play it when you reach that level.`);
            } else {
              setGenMsg("All 8 Sora planet videos saved.");
            }
            fetch("/api/space-planet-videos")
              .then((r) => r.json())
              .then((x) =>
                setPlanetVideoStatus({
                  videos: x.videos || {},
                  count: x.count ?? 0,
                  allReady: !!x.allReady,
                })
              )
              .catch(() =>
                setPlanetVideoStatus({ videos: {}, count: 8, allReady: true })
              );
            return;
          }
          setGeneratingPlanetId(null);
          setGenMsg("Failed: " + (d.error || "unknown"));
        })
        .catch((e) => {
          setGeneratingPlanetId(null);
          setGenMsg(String(e.message));
        });
    },
    []
  );

  const startPlanetGeneration = useCallback(() => {
    setGenMsg("Starting…");
    fetch("/api/generate-space-planets", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || "Request failed");
        pollPlanetJob(data.jobId);
      })
      .catch((e) => setGenMsg(e.message));
  }, [pollPlanetJob]);

  const startSinglePlanetGeneration = useCallback(
    (planetId) => {
      setGeneratingPlanetId(planetId);
      setGenMsg("Starting…");
      fetch("/api/generate-space-planet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planetId }),
      })
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) throw new Error(data.error || "Request failed");
          pollPlanetJob(data.jobId);
        })
        .catch((e) => {
          setGeneratingPlanetId(null);
          setGenMsg(e.message);
        });
    },
    [pollPlanetJob]
  );

  return (
    <div className="app">
      <div className="stars" aria-hidden="true" />
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">🛸</span>
          <div>
            <h1>Space Adventure: Learn the Planets</h1>
            <p className="app-header__tag">For explorers ages 6–12</p>
          </div>
        </div>
        <nav className="app-header__nav">
          {(screen === "level" || screen === "hangman") && (
            <button type="button" className="sl-btn sl-btn--ghost" onClick={goMap}>
              ← Level map
            </button>
          )}
          {(screen === "map" || screen === "level") && (
            <button type="button" className="sl-btn sl-btn--ghost" onClick={() => setScreen("hangman")}>
              Space Hangman
            </button>
          )}
          <a className="sl-btn sl-btn--ghost" href="../home.html">
            Virtual School
          </a>
          <button type="button" className="sl-btn sl-btn--accent sl-btn--small" onClick={startPlanetGeneration} title="Requires server + OPENAI_API_KEY">
            Generate 8 planet videos (Sora)
          </button>
          <button
            type="button"
            className="sl-btn sl-btn--danger"
            onClick={() => {
              if (confirm("Reset all planet progress on this device?")) {
                resetAllProgress();
                setProgress(loadProgress());
                setScreen("map");
              }
            }}
          >
            Reset progress
          </button>
        </nav>
      </header>
      {(genMsg || planetVideoStatus.count < 8) && (
        <div className="app-banner">
          <p>
            <strong>Sora clips on server (verified before play):</strong> {planetVideoStatus.count}/8{" "}
            {planetVideoStatus.allReady
              ? "✅ All lessons use OpenAI Sora files only."
              : "— normal until you generate. Use per-planet “Generate Sora” on the map, or “Generate 8” above. Files go in output/final/ (mercury.mp4 … neptune.mp4)."}
          </p>
          {genMsg && <p className="app-banner__msg">{genMsg}</p>}
        </div>
      )}

      <main className="app-main">
        {screen === "map" && (
          <>
            <RocketGuide
              message={
                allDone
                  ? "You unlocked every planet! You’re a solar system expert! 🌟"
                  : "Tap Mercury to begin. Pass each quiz with at least 70% to unlock the next world!"
              }
            />
            <div className="app-hangman-cta">
              <button type="button" className="sl-btn sl-btn--accent" onClick={() => setScreen("hangman")}>
                Play Space Hangman 🔤
              </button>
              <p className="app-hangman-cta__hint">New word every round — difficulty rises after each solve.</p>
            </div>
            <LevelMap
              progress={progress}
              currentIndex={-1}
              onSelectPlanet={openLevel}
              serverVideos={planetVideoStatus.videos}
              onGeneratePlanet={startSinglePlanetGeneration}
              generatingPlanetId={generatingPlanetId}
            />
            {allDone && (
              <p className="app-celebrate">🎉 Mission complete — you toured all eight planets!</p>
            )}
          </>
        )}

        {screen === "hangman" && <HangmanGame onBack={goMap} />}

        {screen === "level" && planet && (
          <section className="level-screen">
            <div className="level-screen__head">
              <span className="level-screen__emoji">{planet.emoji}</span>
              <h2>
                Level {planet.order + 1}: {planet.name}
              </h2>
              <p className="level-screen__guide">{planet.guideLine}</p>
            </div>

            {phase === "choose" && (
              <div className="level-screen__actions">
                <button
                  type="button"
                  className="sl-btn sl-btn--primary sl-btn--huge"
                  disabled={!videoSrc}
                  title={videoSrc ? "Play your Sora clip" : "Generate this planet’s Sora video on the server first"}
                  onClick={() => videoSrc && setPhase("video")}
                >
                  Watch Video 🎬
                </button>
                <button type="button" className="sl-btn sl-btn--accent sl-btn--huge" onClick={() => setPhase("quiz")}>
                  Skip Video ⏭️
                </button>
                {!videoSrc && (
                  <p className="level-screen__novideo">
                    Sora video for {planet.name} isn’t on the server yet — use <strong>Generate Sora</strong> on the level map
                    for this planet, <strong>Generate 8 planet videos</strong>, or add <code>output/final/{planet.id}.mp4</code>.
                    Quiz still works if you skip.
                  </p>
                )}
              </div>
            )}

            {phase === "video" && (
              <div className="level-screen__video-block">
                <VideoPlayer
                  url={videoSrc}
                  planetName={planet.name}
                  planetId={planet.id}
                  onEnded={() => setPhase("quiz")}
                />
                <button type="button" className="sl-btn sl-btn--ghost" onClick={() => setPhase("quiz")}>
                  Skip to quiz ⏭️
                </button>
              </div>
            )}

            {phase === "quiz" && (
              <Quiz
                questions={planet.questions}
                planetName={planet.name}
                onPass={handleQuizPass}
                onFail={() => {}}
                onContinueNext={() => {
                  if (planetIndex < PLANETS.length - 1) {
                    setPlanetIndex((i) => i + 1);
                    setPhase("choose");
                  } else {
                    goMap();
                  }
                }}
                nextLevelTitle={
                  planetIndex < PLANETS.length - 1
                    ? `Next level: ${PLANETS[planetIndex + 1].name} →`
                    : "Back to map — solar system complete! 🌟"
                }
              />
            )}

            {phase === "quiz" && (
              <button type="button" className="sl-btn sl-btn--ghost level-screen__maplink" onClick={goMap}>
                Back to map
              </button>
            )}
          </section>
        )}
      </main>

      <footer className="app-footer">
        <small>
          Each level expects a real Sora MP4 from the server (<code>/api/video/&lt;planet&gt;.mp4</code>). See{" "}
          <code>space-learn/SORA_PROMPTS.md</code>. Generate one planet from the map or all eight from the header.
        </small>
      </footer>
    </div>
  );
}
