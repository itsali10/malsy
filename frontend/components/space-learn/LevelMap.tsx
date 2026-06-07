'use client';
import { PLANETS } from './data/planets';
import { isPlanetUnlocked } from './ProgressManager';
import type { ProgressState } from './ProgressManager';
import styles from './space-learn.module.css';

interface Props {
  progress: ProgressState;
  onSelectPlanet: (index: number) => void;
  serverVideos: Record<string, string>;
  onGeneratePlanet: (planetId: string) => void;
  generatingPlanetId: string | null;
}

export default function LevelMap({ progress, onSelectPlanet, serverVideos, onGeneratePlanet, generatingPlanetId }: Props) {
  return (
    <div className={styles.levelMap}>
      {PLANETS.map((planet, i) => {
        const unlocked = isPlanetUnlocked(i, progress);
        const hasVideo = !!serverVideos[planet.id];
        const isGenerating = generatingPlanetId === planet.id;
        return (
          <div key={planet.id} className={`${styles.planetCard} ${unlocked ? styles.planetUnlocked : styles.planetLocked}`}>
            <button
              type="button"
              className={styles.planetBtn}
              disabled={!unlocked}
              onClick={() => unlocked && onSelectPlanet(i)}
              title={unlocked ? `Play ${planet.name}` : 'Complete previous planet to unlock'}
            >
              <span className={styles.planetEmoji}>{planet.emoji}</span>
              <span className={styles.planetName}>{planet.name}</span>
              {!unlocked && <span className={styles.planetLock}>🔒</span>}
            </button>
            {unlocked && !hasVideo && (
              <button
                type="button"
                className={`${styles.slBtn} ${styles.slBtnSmall} ${styles.slBtnAccent}`}
                disabled={!!generatingPlanetId}
                onClick={() => onGeneratePlanet(planet.id)}
              >
                {isGenerating ? '⏳ Generating…' : 'Generate Sora'}
              </button>
            )}
            {unlocked && hasVideo && <span className={styles.videoReady}>🎬 Video ready</span>}
          </div>
        );
      })}
    </div>
  );
}
