'use client';
import styles from './space-learn.module.css';

interface Props {
  url: string;
  planetName: string;
  planetId: string;
  onEnded: () => void;
}

export default function VideoPlayer({ url, planetName, onEnded }: Props) {
  if (!url || !url.startsWith('/api/video/')) {
    return (
      <div className={styles.videoError}>
        <p>⚠️ Video not available for {planetName}. Generate it from the level map first.</p>
      </div>
    );
  }
  return (
    <div className={styles.videoWrap}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        className={styles.video}
        src={url}
        autoPlay
        muted
        controls
        onEnded={onEnded}
        onError={() => {
          /* silent — user can skip to quiz */
        }}
      />
    </div>
  );
}
