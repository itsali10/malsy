'use client';

const STORAGE_KEY = 'spaceAdventureLearnPlanets_v1';

export interface ProgressState {
  maxUnlocked: number;
  passedLevels: Record<string, boolean>;
}

function defaultState(): ProgressState {
  return { maxUnlocked: 0, passedLevels: {} };
}

export function loadProgress(): ProgressState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    return {
      maxUnlocked: Math.min(7, Math.max(0, Number(p.maxUnlocked) || 0)),
      passedLevels: typeof p.passedLevels === 'object' && p.passedLevels ? p.passedLevels : {},
    };
  } catch { return defaultState(); }
}

export function saveProgress(state: ProgressState): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function isPlanetUnlocked(planetIndex: number, progress: ProgressState = loadProgress()): boolean {
  return planetIndex <= progress.maxUnlocked;
}

export function unlockAfterPass(planetIndex: number): ProgressState {
  const p = loadProgress();
  p.passedLevels[String(planetIndex)] = true;
  p.maxUnlocked = planetIndex < 7 ? Math.max(p.maxUnlocked, planetIndex + 1) : 7;
  saveProgress(p);
  return p;
}

export function hasPassedPlanet(planetIndex: number, progress: ProgressState = loadProgress()): boolean {
  return !!(progress.passedLevels?.[String(planetIndex)] || progress.passedLevels?.[planetIndex]);
}

export function resetAllProgress(): void {
  saveProgress(defaultState());
}
