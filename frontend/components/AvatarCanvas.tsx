"use client";

import { useEffect, useRef } from "react";
import styles from "./AvatarCanvas.module.css";

export default function AvatarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let stopped = false;
    let stopFn: (() => void) | null = null;

    (async () => {
      const { createAvatarEngine } = await import("../lib/avatar-engine.js");
      if (stopped) return;
      const engine = createAvatarEngine(canvas);
      stopFn = engine.stop;
      await engine.start();
    })();

    return () => {
      stopped = true;
      stopFn?.();
    };
  }, []);

  return (
    <div className={styles.wrapper}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
