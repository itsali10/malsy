/**
 * API server for the virtual school platform.
 * Run: npm run start (or node server.js)
 *
 * - GET  /                    → public/home.html
 * - POST /api/generate        body: { topic: "history" | "space" }
 * - POST /api/generate-space-adventure  → 5 Sora clips for Space Adventure lesson
 * - GET  /api/status/:jobId
 * - GET  /api/video/:filename
 * - GET  /api/lesson-script/:filename  (.txt next to history MP4)
 * - GET  /api/history-lesson  → saved history_lesson.mp4 + meta (for Watch saved video)
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import express from "express";
import fs from "fs-extra";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  generateHistoryLessonVideo,
  generateSpaceAdventureSceneVideos,
  generateSpacePlanetLevelVideos,
  generateOneSpacePlanetVideo,
  loadTeachingPromptsForTopic,
  getLessonPathForTopic,
  FINAL_DIR,
  SPACE_HOME_LESSON_BASENAME,
  HISTORY_LESSON_BASENAME,
} from "./index.js";

const app = express();

/** Allow dashboard (e.g. :5500) + static file opens to call this API on :3000 */
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/gradgame", express.static(path.resolve(__dirname, "..")));

const PORT = process.env.PORT || 3000;
const jobs = new Map();

function getFriendlyErrorMessage(err) {
  const msg = err?.message ?? err?.error?.message ?? String(err);
  if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("ENOTFOUND")) {
    return "Network error. Check your internet or firewall.";
  }
  if (msg.includes("quota") || msg.includes("API key") || msg.includes("401") || msg.includes("429") || msg.includes("OpenAI")) {
    return "API error: check OPENAI_API_KEY in .env and Sora / video access on your account.";
  }
  return msg;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

app.post("/api/generate", (req, res) => {
  const topic = String(req.body?.topic || "history").toLowerCase();
  if (topic !== "history" && topic !== "space") {
    return res.status(400).json({ error: 'Invalid topic. Use "history" or "space".' });
  }

  let lessonPath;
  try {
    lessonPath = getLessonPathForTopic(topic);
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Invalid topic" });
  }

  const fullLessonPath = path.resolve(__dirname, lessonPath.replace(/^\.\//, ""));
  if (!fs.existsSync(fullLessonPath)) {
    return res.status(400).json({ error: `Lesson file missing: ${lessonPath}` });
  }

  const jobId = `job_${Date.now()}`;
  jobs.set(jobId, { status: "generating", videoPath: null, error: null, topic });

  /** Stable filenames: space_home_lesson.mp4 (space) / history_lesson.mp4 (history), like planet clips. */
  const outputBasename =
    topic === "space" ? SPACE_HOME_LESSON_BASENAME : HISTORY_LESSON_BASENAME;

  const run = async () => {
    try {
      const teachingPrompts = loadTeachingPromptsForTopic(topic);
      const result = await generateHistoryLessonVideo(lessonPath, outputBasename, { topic, teachingPrompts });
      const videoPath = result.videoPath;
      const scriptPath = result.scriptPath || null;
      const script = result.script || null;
      const quiz = result.quiz || null;
      const lessonTitle = result.lessonTitle || null;
      jobs.set(jobId, {
        status: "completed",
        videoPath,
        scriptPath,
        script,
        quiz,
        lessonTitle,
        error: null,
        topic,
      });
    } catch (err) {
      console.error(err);
      jobs.set(jobId, {
        status: "failed",
        videoPath: null,
        error: getFriendlyErrorMessage(err),
        topic,
      });
    }
  };

  run();
  res.json({ jobId });
});

app.post("/api/generate-space-adventure", (req, res) => {
  const jobId = `spacejob_${Date.now()}`;
  jobs.set(jobId, {
    status: "generating",
    spaceVideos: null,
    error: null,
    progressStep: 0,
    progressTotal: 5,
    progressLabel: "Starting…",
  });

  (async () => {
    try {
      const result = await generateSpaceAdventureSceneVideos((p) => {
        const cur = jobs.get(jobId) || {};
        jobs.set(jobId, {
          ...cur,
          status: "generating",
          progressStep: p.step,
          progressTotal: p.total,
          progressLabel: p.label,
        });
      });
      jobs.set(jobId, {
        status: "completed",
        spaceVideos: result.videos,
        error: null,
        progressStep: 5,
        progressTotal: 5,
        progressLabel: "Done",
      });
    } catch (err) {
      console.error(err);
      const cur = jobs.get(jobId) || {};
      jobs.set(jobId, {
        ...cur,
        status: "failed",
        error: getFriendlyErrorMessage(err),
      });
    }
  })();

  res.json({ jobId });
});

/** 8 separate Sora clips for React app “Space Adventure: Learn the Planets” (mercury.mp4 … neptune.mp4). */
app.post("/api/generate-space-planets", (req, res) => {
  const jobId = `planetjob_${Date.now()}`;
  jobs.set(jobId, {
    status: "generating",
    planetVideos: null,
    error: null,
    progressStep: 0,
    progressTotal: 8,
    progressLabel: "Starting 8 Sora planet clips…",
  });

  (async () => {
    try {
      const result = await generateSpacePlanetLevelVideos((p) => {
        const cur = jobs.get(jobId) || {};
        jobs.set(jobId, {
          ...cur,
          status: "generating",
          progressStep: p.step,
          progressTotal: p.total,
          progressLabel: p.label,
        });
      });
      jobs.set(jobId, {
        status: "completed",
        planetVideos: result.videos,
        error: null,
        progressStep: 8,
        progressTotal: 8,
        progressLabel: "Done — all 8 planets",
      });
    } catch (err) {
      console.error(err);
      const cur = jobs.get(jobId) || {};
      jobs.set(jobId, {
        ...cur,
        status: "failed",
        error: getFriendlyErrorMessage(err),
      });
    }
  })();

  res.json({ jobId });
});

const VALID_PLANET_IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];

/** One Sora clip for a single planet — body: { "planetId": "mercury" } … */
app.post("/api/generate-space-planet", (req, res) => {
  const planetId = String(req.body?.planetId || "").toLowerCase();
  if (!VALID_PLANET_IDS.includes(planetId)) {
    return res.status(400).json({
      error: `Invalid planetId. Use one of: ${VALID_PLANET_IDS.join(", ")}`,
    });
  }
  const jobId = `planet1_${Date.now()}`;
  const label = planetId.charAt(0).toUpperCase() + planetId.slice(1);
  jobs.set(jobId, {
    status: "generating",
    error: null,
    progressLabel: `Sora: ${label}`,
    planetId,
    singlePlanet: true,
  });

  (async () => {
    try {
      const result = await generateOneSpacePlanetVideo(planetId);
      jobs.set(jobId, {
        status: "completed",
        planetId: result.planetId,
        planetVideoUrl: result.videoUrl,
        singlePlanet: true,
        progressLabel: "Done",
      });
    } catch (err) {
      console.error(err);
      jobs.set(jobId, {
        status: "failed",
        error: getFriendlyErrorMessage(err),
        planetId,
        singlePlanet: true,
      });
    }
  })();

  res.json({ jobId });
});

app.get("/api/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  const payload = {
    status: job.status,
    ...(job.videoPath && {
      videoUrl: `/api/video/${path.basename(job.videoPath)}`,
    }),
    ...(job.script && { script: job.script }),
    ...(job.scriptPath && {
      scriptUrl: `/api/lesson-script/${path.basename(job.scriptPath)}`,
    }),
    ...(job.lessonTitle && { lessonTitle: job.lessonTitle }),
    ...(job.quiz && { quiz: job.quiz }),
    ...(job.topic && { topic: job.topic }),
    ...(job.error && { error: job.error }),
    ...(job.spaceVideos && { spaceVideos: job.spaceVideos }),
    ...(job.planetVideos && { planetVideos: job.planetVideos }),
    ...(job.planetVideoUrl && { planetVideoUrl: job.planetVideoUrl }),
    ...(job.planetId && { planetId: job.planetId }),
    ...(job.singlePlanet != null && { singlePlanet: job.singlePlanet }),
    ...(job.progressStep != null && { progressStep: job.progressStep }),
    ...(job.progressTotal != null && { progressTotal: job.progressTotal }),
    ...(job.progressLabel && { progressLabel: job.progressLabel }),
  };
  res.json(payload);
});

/** Which MP4s belong to the Space Adventure lesson (same names as index.js generation). */
const SPACE_ADVENTURE_FILES = [
  { key: "intro", filename: "space_intro.mp4" },
  { key: "pair_mercury_venus", filename: "space_pair1.mp4" },
  { key: "pair_earth_mars", filename: "space_pair2.mp4" },
  { key: "pair_jupiter_saturn", filename: "space_pair3.mp4" },
  { key: "pair_uranus_neptune", filename: "space_pair4.mp4" },
];

/**
 * Lists Sora exports on disk. Client merges with sessionStorage.
 * 1) Dedicated 5-scene files (space_intro.mp4 … space_pair4.mp4)
 * 2) Else one clip from home page “Space science” → space_home_lesson.mp4 (same URL for every scene)
 */
const PLANET_LEVEL_FILENAMES = [
  "mercury.mp4",
  "venus.mp4",
  "earth.mp4",
  "mars.mp4",
  "jupiter.mp4",
  "saturn.mp4",
  "uranus.mp4",
  "neptune.mp4",
];

/** Which per-planet Sora files exist for /space-learn (React app). */
app.get("/api/space-planet-videos", (req, res) => {
  const videos = {};
  for (const fn of PLANET_LEVEL_FILENAMES) {
    const id = fn.replace(".mp4", "");
    const fp = path.join(FINAL_DIR, fn);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      videos[id] = `/api/video/${fn}`;
    }
  }
  const n = Object.keys(videos).length;
  res.json({
    videos,
    count: n,
    allReady: n === 8,
  });
});

app.get("/api/space-adventure-videos", (req, res) => {
  const videos = {};
  for (const { key, filename } of SPACE_ADVENTURE_FILES) {
    const fp = path.join(FINAL_DIR, filename);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      videos[key] = `/api/video/${filename}`;
    }
  }
  let source = "dedicated";
  const n = Object.keys(videos).length;
  if (n === 0) {
    const homeClip = `${SPACE_HOME_LESSON_BASENAME}.mp4`;
    const homePath = path.join(FINAL_DIR, homeClip);
    if (fs.existsSync(homePath) && fs.statSync(homePath).isFile()) {
      const url = `/api/video/${homeClip}`;
      for (const { key } of SPACE_ADVENTURE_FILES) {
        videos[key] = url;
      }
      source = "spaceHomeLesson";
    }
  }
  res.json({
    videos,
    count: Object.keys(videos).length,
    allReady: n === SPACE_ADVENTURE_FILES.length && source === "dedicated",
    source,
  });
});

app.get("/api/video/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.endsWith(".mp4") || filename.includes("..")) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const filePath = path.join(FINAL_DIR, filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: "Video not found" });
  }
  res.setHeader("Content-Type", "video/mp4");
  res.sendFile(path.resolve(filePath));
});

/** Plain-text voiceover saved next to the history lesson MP4 (same basename). */
app.get("/api/lesson-script/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.endsWith(".txt") || filename.includes("..")) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const filePath = path.join(FINAL_DIR, filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: "Script not found" });
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.sendFile(path.resolve(filePath));
});

const HISTORY_LESSON_MP4 = `${HISTORY_LESSON_BASENAME}.mp4`;
const HISTORY_LESSON_TXT = `${HISTORY_LESSON_BASENAME}.txt`;
const HISTORY_LESSON_META = `${HISTORY_LESSON_BASENAME}.meta.json`;

/** Saved history clip + quiz/script from last generate (output/final/history_lesson.*). */
app.get("/api/history-lesson", (req, res) => {
  const videoPath = path.join(FINAL_DIR, HISTORY_LESSON_MP4);
  if (!fs.existsSync(videoPath) || !fs.statSync(videoPath).isFile()) {
    return res.json({
      ready: false,
      videoUrl: null,
      scriptUrl: null,
      lessonTitle: null,
      quiz: null,
      script: null,
    });
  }

  let lessonTitle = null;
  let quiz = null;
  let script = null;
  const metaPath = path.join(FINAL_DIR, HISTORY_LESSON_META);
  if (fs.existsSync(metaPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      lessonTitle = m.lessonTitle ?? null;
      quiz = m.quiz ?? null;
      script = m.script ?? null;
    } catch {
      /* ignore corrupt meta */
    }
  }

  const txtPath = path.join(FINAL_DIR, HISTORY_LESSON_TXT);
  if (!script && fs.existsSync(txtPath)) {
    const full = fs.readFileSync(txtPath, "utf-8").trim();
    const idx = full.indexOf("\n\n");
    if (idx > 0) {
      lessonTitle = lessonTitle || full.slice(0, idx).trim();
      script = full.slice(idx + 2).trim();
    } else {
      script = full;
    }
  }

  res.json({
    ready: true,
    videoUrl: `/api/video/${HISTORY_LESSON_MP4}`,
    scriptUrl: fs.existsSync(txtPath) ? `/api/lesson-script/${HISTORY_LESSON_TXT}` : null,
    lessonTitle,
    quiz,
    script,
  });
});

app.listen(PORT, () => {
  console.log(`Virtual School running at http://localhost:${PORT}`);
  console.log(`  Videos folder: ${path.resolve(FINAL_DIR)}`);
  console.log('  POST /api/generate  body: { "topic": "history" | "space" }');
  console.log("  POST /api/generate-space-adventure  (5 OpenAI Sora clips for Space Adventure)");
  console.log("  GET  /api/space-adventure-videos  (list space_*.mp4 already in output/final/)");
  console.log("  POST /api/generate-space-planets  (8 Sora clips: mercury.mp4 … neptune.mp4)");
  console.log("  GET  /api/space-planet-videos  (which planet MP4s exist)");
  console.log("  POST /api/generate-space-planet  body: { \"planetId\": \"mercury\" } … one Sora clip");
  console.log("  GET  /api/history-lesson  (saved history_lesson.mp4 + quiz meta)");
});
