'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import type { AuthContext } from '@/lib/auth';
import styles from './games.module.css';

function GamesContent({ ctx }: { ctx: AuthContext }) {
  const router = useRouter();
  const student = ctx.student as { games: { hangman: { bestScore: number }; spellingBee: { bestScore: number } } };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Dashboard</button>
        <h1>🎮 Educational Games</h1>
      </header>

      <main className={styles.content}>
        <p className={styles.intro}>Learn while you play! These games help reinforce what you've studied.</p>

        <div className={styles.grid}>
          <Link href="/games/hangman" className={styles.gameCard}>
            <div className={styles.gameIcon}>🔤</div>
            <h2>Hangman</h2>
            <p>Guess the word letter by letter before the stick figure is complete.</p>
            <div className={styles.gameStats}>
              <span>Best score: <strong>{student.games.hangman.bestScore}</strong></span>
            </div>
            <div className={styles.playBtn}>Play Now →</div>
          </Link>

          <Link href="/games/spelling-bee" className={styles.gameCard}>
            <div className={styles.gameIcon}>🐝</div>
            <h2>Spelling Bee</h2>
            <p>Spell the word correctly from a clue and partial letters shown on screen.</p>
            <div className={styles.gameStats}>
              <span>Best score: <strong>{student.games.spellingBee.bestScore}</strong></span>
            </div>
            <div className={styles.playBtn}>Play Now →</div>
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function GamesPage() {
  return <AuthGuard>{(ctx) => <GamesContent ctx={ctx} />}</AuthGuard>;
}
