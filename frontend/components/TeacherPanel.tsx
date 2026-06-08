'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import styles from './TeacherPanel.module.css';

const AvatarCanvas = dynamic(() => import('./AvatarCanvas'), { ssr: false });

interface Props {
  name: string;
  engPct: number;
  sciPct: number;
  ssPct: number;
}

function buildMessages(name: string, engPct: number, sciPct: number, ssPct: number): string[] {
  const msgs = [
    `Hello, ${name}! Ready to learn something amazing today? 🌟`,
    `You are doing great, ${name}! Keep up the momentum! 💪`,
  ];
  if (engPct < 100) msgs.push(`English is ${engPct}% done. Let's practise reading together! 📚`);
  if (sciPct < 100) msgs.push(`Science is ${sciPct}% done. The lab awaits, ${name}! 🔬`);
  if (ssPct < 100) msgs.push(`Let's explore history and geography! ${ssPct}% done so far. 🌍`);
  if (engPct === 100 && sciPct === 100 && ssPct === 100) msgs.push(`Outstanding, ${name}! You have completed all subjects! 🏆`);
  msgs.push('Swipe the subject cards or tap Start learning! 👇');
  msgs.push('I will celebrate every lesson you complete! 🎉');
  msgs.push('Try the Educational Games when you need a fun break! 🎮');
  return msgs;
}

export default function TeacherPanel({ name, engPct, sciPct, ssPct }: Props) {
  const msgRef = useRef<HTMLParagraphElement>(null);
  const msgs = buildMessages(name, engPct, sciPct, ssPct);
  const idxRef = useRef(0);

  useEffect(() => {
    if (msgRef.current) msgRef.current.textContent = msgs[0];
    const interval = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % msgs.length;
      const el = msgRef.current;
      if (!el) return;
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = msgs[idxRef.current];
        el.style.opacity = '1';
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, engPct, sciPct, ssPct]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.dot} style={{ background: '#ff5f57' }} />
        <span className={styles.dot} style={{ background: '#febc2e' }} />
        <span className={styles.dot} style={{ background: '#28c840' }} />
        <span className={styles.title}>Malsy AI Teacher</span>
      </div>
      <div className={styles.stage}>
        <div className={styles.grid} />
        <div className={styles.floorGlow} />
        <AvatarCanvas />
      </div>
      <div className={styles.info}>
        <p className={styles.atpName}>Ms. Malsy — AI Teacher</p>
        <div className={styles.speech}>
          <p ref={msgRef} className={styles.atpMsg} style={{ transition: 'opacity .3s ease' }} />
        </div>
      </div>
    </div>
  );
}
