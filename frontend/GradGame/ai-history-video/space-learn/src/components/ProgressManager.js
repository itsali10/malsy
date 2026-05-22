const STORAGE_KEY = "spaceAdventureLearnPlanets_v1";

/**
 * @typedef {{ maxUnlocked: number, passedLevels: Record<number, boolean> }} ProgressState
 */

function defaultState() {
  return {
    /** Highest planet index that can be opened (0 = Mercury only at start). */
    maxUnlocked: 0,
    /** Planet indices where quiz was passed at ≥70%. */
    passedLevels: {},
  };
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    return {
      maxUnlocked: Math.min(7, Math.max(0, Number(p.maxUnlocked) || 0)),
      passedLevels: typeof p.passedLevels === "object" && p.passedLevels ? p.passedLevels : {},
    };
  } catch {
    return defaultState();
  }
}

export function saveProgress(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * @param {number} planetIndex 0–7
 * @returns {boolean}
 */
export function isPlanetUnlocked(planetIndex, progress = loadProgress()) {
  return planetIndex <= progress.maxUnlocked;
}

/**
 * Call after quiz pass (≥70%).
 * @param {number} planetIndex
 */
export function unlockAfterPass(planetIndex) {
  const p = loadProgress();
  const key = String(planetIndex);
  p.passedLevels[key] = true;
  if (planetIndex < 7) {
    p.maxUnlocked = Math.max(p.maxUnlocked, planetIndex + 1);
  } else {
    p.maxUnlocked = 7;
  }
  saveProgress(p);
  return p;
}

export function hasPassedPlanet(planetIndex, progress = loadProgress()) {
  const k = String(planetIndex);
  return !!(progress.passedLevels && (progress.passedLevels[k] || progress.passedLevels[planetIndex]));
}

export function resetAllProgress() {
  saveProgress(defaultState());
}
