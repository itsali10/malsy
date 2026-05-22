import React, { useRef, useEffect, useState } from "react";

/**
 * Plays Sora exports from /api/video/{planet}.mp4. If the file is missing, shows a clear message (no unrelated demo clip).
 */
export default function VideoPlayer({ url, planetName, planetId, onEnded }) {
  const ref = useRef(null);
  const [missing, setMissing] = useState(false);
  const src = url && String(url).trim() ? url : "";

  useEffect(() => {
    setMissing(false);
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v || missing) return;
    v.muted = true;
    v.play().catch(() => {});
  }, [src, missing]);

  useEffect(() => {
    const v = ref.current;
    if (!v || missing) return;
    const onEnd = () => onEnded?.();
    v.addEventListener("ended", onEnd);
    return () => v.removeEventListener("ended", onEnd);
  }, [onEnded, src, missing]);

  const onVideoError = () => {
    if (String(src).includes("/api/video/")) {
      setMissing(true);
    }
  };

  if (!src) {
    return (
      <div className="sl-video sl-video--missing">
        <p>
          No Sora file registered for <strong>{planetName}</strong> yet. The app only plays clips listed by{" "}
          <code>GET /api/space-planet-videos</code> (OpenAI Sora MP4s in <code>output/final/</code>).
        </p>
      </div>
    );
  }

  if (!String(src).startsWith("/api/video/")) {
    return (
      <div className="sl-video sl-video--missing">
        <p>Only Sora lesson files from this server (<code>/api/video/*.mp4</code>) can be played here.</p>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="sl-video sl-video--missing">
        <p>
          <strong>Sora video not on the server yet.</strong> It should be{" "}
          <code>output/final/{planetId || "planet"}.mp4</code> (served as <code>{src}</code>).
        </p>
        <p className="sl-video--hint">
          Generate all 8: run the app with your API key and use <strong>Generate 8 planet videos (Sora)</strong> in the
          header, or call <code>POST /api/generate-space-planets</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="sl-video">
      <p className="sl-video__label">
        {planetName} — OpenAI Sora (served from your server)
      </p>
      <div className="sl-video__frame">
        <video
          ref={ref}
          className="sl-video__el"
          src={src}
          controls
          playsInline
          preload="metadata"
          onError={onVideoError}
        />
      </div>
    </div>
  );
}
