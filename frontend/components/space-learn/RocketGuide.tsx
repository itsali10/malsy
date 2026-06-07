'use client';
import styles from './space-learn.module.css';

interface Props { message: string; compact?: boolean; }

export default function RocketGuide({ message, compact }: Props) {
  return (
    <div className={`${styles.rocketGuide} ${compact ? styles.rocketGuideCompact : ''}`}>
      <span className={styles.rocketIcon}>🚀</span>
      <p className={styles.rocketBubble}>{message}</p>
    </div>
  );
}
