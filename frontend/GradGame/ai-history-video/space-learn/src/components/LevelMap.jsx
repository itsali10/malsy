import React from "react";
import { PLANETS } from "../data/planets.js";
import { isPlanetUnlocked } from "./ProgressManager.js";

export default function LevelMap({
  progress,
  onSelectPlanet,
  currentIndex,
  serverVideos = {},
  onGeneratePlanet,
  generatingPlanetId = null,
}) {
  return (
    <div className="level-map">
      <h2 className="level-map__title">Choose your level</h2>
      <p className="level-map__hint">
        Only unlocked planets can be played. Pass each quiz (≥70%) to unlock the next! 🔒➜🔓 Missing a video? Use{" "}
        <strong>Generate Sora</strong> under that planet.
      </p>
      <div className="level-map__grid">
        {PLANETS.map((p, i) => {
          const open = isPlanetUnlocked(i, progress);
          const active = currentIndex === i;
          const hasVideo = !!serverVideos[p.id];
          const isGenerating = generatingPlanetId === p.id;
          return (
            <div key={p.id} className="level-map__cell">
              <button
                type="button"
                className={`level-map__planet ${open ? "level-map__planet--open" : "level-map__planet--locked"} ${active ? "level-map__planet--active" : ""}`}
                disabled={!open}
                onClick={() => open && onSelectPlanet(i)}
              >
                <span className="level-map__emoji" aria-hidden="true">
                  {open ? p.emoji : "🔒"}
                </span>
                <span className="level-map__name">{p.name}</span>
                <span className="level-map__badge">Level {i + 1}</span>
              </button>
              {!hasVideo && onGeneratePlanet && (
                <button
                  type="button"
                  className="level-map__gen"
                  disabled={isGenerating}
                  title="Create one Sora clip for this planet (requires OPENAI_API_KEY on server)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGeneratePlanet(p.id);
                  }}
                >
                  {isGenerating ? "Generating…" : "Generate Sora"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
