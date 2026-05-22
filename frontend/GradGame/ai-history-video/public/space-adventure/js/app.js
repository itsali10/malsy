import { ScoreSystem } from "./ScoreSystem.js";
import { SceneManager } from "./SceneManager.js";
import { resolveVideoUrl } from "./config.js";

const MANIFEST_KEY = "spaceSoraManifest";

/** From server disk: output/final/space_*.mp4 */
let serverVideos = {};

function loadSessionManifest() {
  try {
    const raw = sessionStorage.getItem(MANIFEST_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return typeof o === "object" && o ? o : {};
  } catch {
    return {};
  }
}

/**
 * Session (after “Generate” in this browser) overrides server files.
 */
function getMergedManifest() {
  return { ...serverVideos, ...loadSessionManifest() };
}

function resolveSceneVideo(scene) {
  const m = getMergedManifest();
  if (m[scene.key]) return m[scene.key];
  return resolveVideoUrl(scene.videoUrl);
}

async function refreshServerVideos() {
  try {
    const r = await fetch("/api/space-adventure-videos");
    const data = await r.json();
    if (data && data.videos) serverVideos = data.videos;
    const genStatus = document.getElementById("saGenStatus");
    if (genStatus && !genStatus.textContent) {
      if (data.source === "spaceHomeLesson") {
        genStatus.textContent =
          "Found space_home_lesson.mp4 from the home page — same Sora clip plays in each scene. Tap Start lesson. For 5 different clips, use Generate below.";
      } else if (data.allReady && data.source === "dedicated") {
        genStatus.textContent =
          "All 5 Sora clips found (output/final/) — tap Start lesson.";
      } else if (Object.keys(data.videos || {}).length) {
        genStatus.textContent = "Some Sora files found — tap Start lesson.";
      }
    }
    return data;
  } catch {
    return null;
  }
}

const score = new ScoreSystem();

const ui = {
  setTitle(text) {
    const el = document.getElementById("saSceneTitle");
    if (el) el.textContent = text;
  },
  setGuide(text) {
    const el = document.getElementById("saGuideText");
    if (el) el.textContent = text;
  },
  setProgress(pct) {
    const bar = document.getElementById("saProgressBar");
    if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + "%";
    const label = document.getElementById("saProgressLabel");
    if (label) label.textContent = Math.round(pct) + "%";
  },
};

const root = document.getElementById("saSceneRoot");
const mgr = new SceneManager(root, score, ui, resolveSceneVideo);

const genBtn = document.getElementById("saGenSoraBtn");
const genStatus = document.getElementById("saGenStatus");

function pollSpaceJob(jobId) {
  fetch("/api/status/" + encodeURIComponent(jobId))
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!genBtn || !genStatus) return;
      if (!ok) {
        genStatus.textContent = data.error || "Status failed";
        genBtn.disabled = false;
        return;
      }
      if (data.status === "generating") {
        genStatus.textContent =
          "Sora: " +
          (data.progressStep || 0) +
          "/" +
          (data.progressTotal || 5) +
          " — " +
          (data.progressLabel || "…");
        setTimeout(() => pollSpaceJob(jobId), 5000);
        return;
      }
      if (data.status === "completed" && data.spaceVideos) {
        sessionStorage.setItem(MANIFEST_KEY, JSON.stringify(data.spaceVideos));
        refreshServerVideos();
        genStatus.textContent = "All Sora clips saved under output/final/. Tap Start lesson.";
        genBtn.disabled = false;
        return;
      }
      genStatus.textContent = "Failed: " + (data.error || "unknown");
      genBtn.disabled = false;
    })
    .catch((e) => {
      if (genStatus) genStatus.textContent = "Error: " + e.message;
      if (genBtn) genBtn.disabled = false;
    });
}

if (genBtn && genStatus) {
  if (Object.keys(loadSessionManifest()).length) {
    genStatus.textContent = "This browser has a saved Sora manifest — tap Start lesson or regenerate.";
  }

  genBtn.addEventListener("click", () => {
    genBtn.disabled = true;
    genStatus.textContent = "Starting… (5 OpenAI Sora clips — often 15–60+ minutes.)";
    fetch("/api/generate-space-adventure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || "Request failed");
        pollSpaceJob(data.jobId);
      })
      .catch((e) => {
        genStatus.textContent = "Error: " + e.message;
        genBtn.disabled = false;
      });
  });
}

document.getElementById("saStartBtn").addEventListener("click", () => {
  document.getElementById("saIntroOverlay").hidden = true;
  mgr.start();
});

document.getElementById("saBackHome").addEventListener("click", () => {
  window.location.href = "../home.html";
});

refreshServerVideos();
