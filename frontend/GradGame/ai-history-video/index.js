/**
 * Virtual School – lesson videos via OpenAI:
 * - Chat API: teacher script + quiz
 * - Sora (Videos API): cartoon clips
 */
import "dotenv/config";
import fs from "fs-extra";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL || "sora-2";
const OPENAI_VIDEO_SECONDS = String(process.env.OPENAI_VIDEO_SECONDS || "12");
const OPENAI_VIDEO_SIZE = process.env.OPENAI_VIDEO_SIZE || "1280x720";

if (!OPENAI_API_KEY) {
  console.error(
    "Set OPENAI_API_KEY in .env — used for the teacher script, quiz, and Sora video.\nhttps://platform.openai.com/api-keys"
  );
  process.exit(1);
}

const OPENAI_API_BASE = "https://api.openai.com/v1";
/** Always under the project folder (not process.cwd()) so videos land in the right place on any OS. */
const OUTPUT_DIR = path.resolve(__dirname, "output");
export const FINAL_DIR = path.join(OUTPUT_DIR, "final");

/** Single Sora clip from home → Space science (Virtual School) — reused for all scenes until 5-scene pack exists. */
export const SPACE_HOME_LESSON_BASENAME = "space_home_lesson";

/** History lesson from home / CLI — stable name so the UI can play output/final/history_lesson.mp4 after refresh. */
export const HISTORY_LESSON_BASENAME = "history_lesson";

async function ensureOutputDir(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    if (stat.isFile()) await fs.remove(dirPath);
  } catch {
    // path doesn't exist
  }
  await mkdir(dirPath, { recursive: true });
}

function loadTextbookLesson(lessonPath = "./lesson.txt") {
  const fullPath = path.resolve(lessonPath);
  if (!fs.existsSync(fullPath)) throw new Error(`Lesson file not found: ${fullPath}`);
  return fs.readFileSync(fullPath, "utf-8");
}

function loadTeachingPrompts(promptsPath = "./teaching_prompts.txt") {
  const fullPath = path.resolve(promptsPath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf-8").trim();
}

/** `history` → lesson.txt; `space` → lesson_space.txt */
export const LESSON_TOPIC = {
  history: "./lesson.txt",
  space: "./lesson_space.txt",
};

export function getLessonPathForTopic(topic) {
  const t = String(topic || "history").toLowerCase();
  const p = LESSON_TOPIC[t];
  if (!p) throw new Error(`Unknown topic "${topic}". Use: history, space`);
  return p;
}

/** Prefer teaching_prompts_<topic>.txt, else teaching_prompts.txt */
export function loadTeachingPromptsForTopic(topic = "history") {
  const t = String(topic || "history").toLowerCase();
  const candidates = [
    path.resolve(__dirname, `teaching_prompts_${t}.txt`),
    path.resolve(__dirname, "teaching_prompts.txt"),
  ];
  for (const fullPath of candidates) {
    if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath, "utf-8").trim();
  }
  return "";
}

function getLessonTitle(textbookContent) {
  const first = (textbookContent || "").trim().split(/\n/)[0] || "";
  return first.slice(0, 80).trim() || "History Lesson";
}

async function openaiChatCompletion(promptText) {
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: promptText }],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI ${res.status}`);
  const text = data?.choices?.[0]?.message?.content;
  if (text) return text.trim();
  throw new Error("OpenAI did not return text");
}

const HISTORY_QUIZ_QUESTIONS = 3;

/**
 * History: `quizSourceText` must be the video narration script (same text as Sora timing).
 * Questions test only what appears in that script.
 */
async function generateQuizFromContent(quizSourceText, topic = "history") {
  const t = String(topic || "history").toLowerCase();
  const n = HISTORY_QUIZ_QUESTIONS;
  const prompt =
    t === "history"
      ? `The following is the complete narration script of a short educational HISTORY video a student just watched (what the on-screen teacher character says). Create exactly ${n} multiple-choice quiz questions.

Rules:
- Every question MUST be answerable using ONLY information stated or clearly implied in this script. Do not use outside historical facts.
- Each question: exactly 4 options (A, B, C, D) and one correct answer.
- Wording suitable for students about ages 8–14.

Video script:
${(quizSourceText || "").slice(0, 4000)}

Respond with ONLY a valid JSON object, no other text. Use this exact format:
{"questions":[{"question":"Question text?","options":["A option","B option","C option","D option"],"correctIndex":0}]}
correctIndex is 0-3 (0=first option, 1=second, etc.).`
      : `Based on this space science lesson, create exactly ${n} multiple-choice quiz questions suitable for students. Each question must have exactly 4 options (A, B, C, D) and one correct answer.

Lesson:
${(quizSourceText || "").slice(0, 3000)}

Respond with ONLY a valid JSON object, no other text. Use this exact format:
{"questions":[{"question":"Question text?","options":["A option","B option","C option","D option"],"correctIndex":0}]}
correctIndex is 0-3 (0=first option, 1=second, etc.).`;

  let raw;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      raw = await openaiChatCompletion(prompt);
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const jsonStr = raw.replace(/```json\s*|\s*```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = {};
  }
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return {
    questions: questions
      .slice(0, n)
      .map((q) => ({
        question: String(q.question || "").trim(),
        options: Array.isArray(q.options) ? q.options.slice(0, 4).map((o) => String(o).trim()) : [],
        correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
      }))
      .filter((q) => q.question && q.options.length >= 2),
  };
}

/** ~spoken words per second for kids + short Sora clip (conservative so visuals can keep up). */
function historyClipWordBudget(secondsStr) {
  const s = parseInt(String(secondsStr || "12"), 10);
  const sec = [4, 8, 12].includes(s) ? s : 12;
  return Math.min(90, Math.max(14, Math.round(sec * 2.4)));
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

async function shortenHistoryScriptForClip(script, maxWords) {
  const prompt = `Rewrite this spoken lesson for kids to at most ${maxWords} words (count every word; stay under the limit). Keep exactly 3 short paragraphs separated by ONE blank line. Preserve facts and warm pyramid-teacher tone. Output ONLY the script, no title.

Script to shorten:

${script}`;
  return openaiChatCompletion(prompt);
}

/**
 * Teacher script — shapes Sora prompt (tone + facts). Character depends on topic.
 * History: length is capped to fit OPENAI_VIDEO_SECONDS so the clip can follow the same beats.
 */
async function generateTeacherScript(textbookContent, teachingPrompts = "", topic = "history") {
  const t = String(topic || "history").toLowerCase();
  const characterIntro =
    t === "space"
      ? `You are the BRAIN of a cute, friendly animated ASTRONAUT character (cartoon style) in a magical SPACE ADVENTURE STORY lesson for kids. The astronaut is a storyteller and guide. Your only output is what that character would SAY out loud in one continuous speech — story-like, excited, curious, NOT a dry classroom lecture.`
      : `You are the BRAIN of a friendly animated PYRAMID mascot in an educational HISTORY video for kids. Your only output is what that character would SAY out loud in one continuous speech.`;

  const hookHint =
    t === "space"
      ? `Start with a short story hook (e.g. "Come with me on a trip through the solar system..." or "Blast off with me...").`
      : `Start with a short greeting or hook (e.g. "Hello, young historians..." or "Let me tell you about...").`;

  const maxWords =
    t === "history" ? historyClipWordBudget(OPENAI_VIDEO_SECONDS) : 200;
  const historyFormat =
    t === "history"
      ? `- This voiceover will play over a single short cartoon clip (${OPENAI_VIDEO_SECONDS} seconds). Use at most ${maxWords} words total.
- Use exactly 3 short paragraphs, separated by ONE blank line only (paragraph break = new segment for animation timing).
- Paragraph 1: greeting + Nile River and why it mattered for farming and life.
- Paragraph 2: pharaohs and pyramids (tombs, afterlife) in simple terms.
- Paragraph 3: one line on beliefs or legacy + a short goodbye.
- One engaging question is OK in paragraph 1 or 2 (very short).`
      : `- Output ONLY the spoken script: about 120–200 words. No titles, no character name labels, no stage directions.`;

  const system = `${characterIntro}

${teachingPrompts ? `Teaching / character instructions (follow every one):\n${teachingPrompts}\n` : ""}

Rules:
- Output ONLY the spoken script. No titles, no character name labels, no stage directions in brackets.
- Teach the lesson clearly; explain so a child understands; do not dump the textbook.
${historyFormat}
- ${hookHint}`;

  const userMessage = `${system}\n\n---\n\nLesson content (factual basis):\n\n${textbookContent}`;
  let lastErr;
  let script = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      script = await openaiChatCompletion(userMessage);
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!script) throw lastErr;

  if (t === "history" && countWords(script) > maxWords + 4) {
    try {
      script = await shortenHistoryScriptForClip(script, maxWords);
    } catch {
      /* use longer script if shorten fails */
    }
  }
  return script.trim();
}

/** @deprecated use generateTeacherScript */
async function generatePyramidTeacherScript(textbookContent, teachingPrompts = "") {
  return generateTeacherScript(textbookContent, teachingPrompts, "history");
}

function buildSpaceAdventureSoraPrompt(lessonTitle, textbookContent, teacherScript) {
  const title = (lessonTitle || "").trim() || "Space Adventure Story Lesson";
  const body = (textbookContent || "").trim().slice(0, 2800);
  const scriptHint = (teacherScript || "").trim().slice(0, 1400);

  return [
    "🎬 Sora Prompt – Space Adventure Story Lesson",
    "",
    "A colorful, cinematic animated educational video for children about the solar system, designed like a magical story adventure.",
    "",
    "A cute, friendly animated astronaut character (cartoon style, expressive face, big eyes, soft features) floats in space and acts as a storyteller and guide. The astronaut speaks directly to the viewer with excitement and curiosity.",
    "",
    "The scene begins with the astronaut launching from Earth in a small, playful rocket. The rocket travels through space with vibrant colors, glowing stars, and soft nebula clouds.",
    "",
    "As the story progresses, the astronaut visits different planets one by one: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune. Each planet appears large, colorful, and slightly stylized (cartoon-realistic mix), with unique visual features:",
    "– Mercury: rocky and hot with glowing cracks",
    "– Venus: thick clouds and golden atmosphere",
    "– Mars: red desert with dust storms",
    "– Jupiter: giant swirling storms and the Great Red Spot",
    "– Saturn: beautiful glowing rings",
    "(Uranus and Neptune: icy blue tones, distant and dreamy.)",
    "",
    "At each planet, the astronaut pauses and explains simple, fun facts in a storytelling tone, as if telling an adventure story (not like a classroom lecture).",
    "",
    "Add playful animations:",
    "– floating asteroids slowly passing by",
    "– a friendly alien waving from Mars",
    "– rings of Saturn gently spinning",
    "– comets flying in the background",
    "",
    "The tone is magical, fun, and educational. The pacing is smooth and engaging, with cinematic camera movements (slow zooms, gentle pans, orbiting shots around planets).",
    "",
    "Lighting is soft, colorful, and dreamy, with glowing highlights and a child-friendly aesthetic.",
    "",
    "Style: high-quality 3D animation, Pixar-like, vibrant colors, clean and polished.",
    "",
    "The video should feel like a storybook in space, designed for children aged 6–12, combining education with imagination and adventure.",
    "",
    "Because this is a single short clip, show a montage or highlights of the journey (rocket launch, a few planet fly-bys, playful moments) rather than every planet in full detail.",
    "",
    "Optional for voice sync later: the astronaut pauses naturally between phrases for voiceover timing.",
    "",
    "---",
    `Lesson title: ${title}`,
    "Factual lesson content to inspire visuals and ideas (do not display long text on screen):",
    body,
    "Storytelling tone and teaching mood from the script (performance, pacing; not as on-screen text):",
    scriptHint,
  ].join("\n\n");
}

/**
 * Sora prompt: cartoon mascot explaining the lesson (short clip).
 */
function buildSoraPrompt(textbookContent, teacherScript, lessonTitle, topic = "history", options = {}) {
  const t = String(topic || "history").toLowerCase();
  const title =
    (lessonTitle || "").trim() || (t === "space" ? "Space Adventure Story Lesson" : "History lesson for kids");
  const body = (textbookContent || "").trim().slice(0, 2500);
  const scriptHint = (teacherScript || "").trim().slice(0, 1200);

  if (t === "space") {
    console.log("Sora: using SPACE prompt (Space Adventure / astronaut + planets).");
    return buildSpaceAdventureSoraPrompt(title, body, scriptHint);
  }

  console.log("Sora: using HISTORY prompt (cartoon pyramid + lesson content).");
  const seconds = ["4", "8", "12"].includes(String(options.videoSeconds || OPENAI_VIDEO_SECONDS))
    ? String(options.videoSeconds || OPENAI_VIDEO_SECONDS)
    : "12";
  const secNum = parseInt(seconds, 10);
  const rawParts = (teacherScript || "")
    .trim()
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const parts = rawParts.length >= 2 ? rawParts : [teacherScript.trim()].filter(Boolean);
  const third = Math.max(1, Math.round(secNum / Math.max(parts.length, 1)));

  const syncBlock =
    parts.length >= 2
      ? [
          `CRITICAL: The clip is ${secNum} seconds. Animate in ${parts.length} clear sequential beats so pictures match what the pyramid is "saying" (lip-sync illusion / gestures / scene changes). Do not display paragraph text on screen.`,
          ...parts.map((text, i) => {
            const t0 = i * third;
            const t1 = i === parts.length - 1 ? secNum : Math.min(secNum, (i + 1) * third);
            return `BEAT ${i + 1} (about ${t0}–${t1}s): The pyramid performs this part of the lesson — ideas only: "${text.slice(0, 500)}". Show visuals that illustrate these same ideas (e.g. Nile and green fields, cartoony pharaoh, pyramid tomb, scrolls or stars for afterlife — match the beat, stay kid-friendly).`;
          }),
        ].join("\n\n")
      : `Single-flow performance (about ${secNum}s): match changing visuals to the ideas in the script below as time progresses. Script ideas: ${scriptHint}`;

  const characterBlock = [
    "Main character: a CARTOONIC, non-photorealistic anthropomorphic pyramid mascot — chunky simple shapes, big expressive cartoon eyes, friendly mouth, optional stubby arms or bouncy motion. Think kids' TV animation or Pixar-style cute mascot, NOT a realistic stone pyramid. The pyramid acts as a teacher and should appear to SPEAK and GESTURE while explaining — warm, silly-cute, not scary.",
    "Setting: ancient Egypt / history mood — desert, Nile, or bright cartoon classroom; family-friendly; no horror or gore.",
  ];

  const styleNote =
    "Visual style: clearly cartoon / 2D or soft 3D cartoon — bold colors, smooth shading, playful proportions, appealing to kids. Avoid photorealism and avoid grim dark stone textures for the main character.";

  return [
    "Create a short, colorful CARTOON-style animated educational video for elementary students.",
    `Topic / title: ${title}`,
    ...characterBlock,
    styleNote,
    syncBlock,
    "Lesson ideas to show (no long on-screen text; show scenes, symbols, or props that match the ideas):",
    body,
    "Full voiceover wording the character performs (not as on-screen captions; use for timing and mood):",
    scriptHint,
  ].join("\n\n");
}

/** Status poll / download can return 502/503 during long Sora jobs — retry instead of failing. */
function isTransientHttpStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

async function createVideoWithOpenAISora(prompt, outputPath) {
  const seconds = ["4", "8", "12"].includes(OPENAI_VIDEO_SECONDS) ? OPENAI_VIDEO_SECONDS : "12";
  const allowedSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"];
  const size = allowedSizes.includes(OPENAI_VIDEO_SIZE) ? OPENAI_VIDEO_SIZE : "1280x720";

  const form = new FormData();
  form.append("model", OPENAI_VIDEO_MODEL);
  form.append("prompt", prompt.slice(0, 32000));
  form.append("seconds", seconds);
  form.append("size", size);

  console.log(`OpenAI Sora: submitting job (model=${OPENAI_VIDEO_MODEL}, ${seconds}s, ${size})...`);
  const createRes = await fetch(`${OPENAI_API_BASE}/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    const msg = createJson?.error?.message || createJson?.message || JSON.stringify(createJson) || `OpenAI videos ${createRes.status}`;
    throw new Error(msg);
  }
  const videoId = createJson?.id;
  if (!videoId) throw new Error("OpenAI did not return video id");

  const pollMs = 8000;
  const maxWaitMs = 30 * 60 * 1000;
  const maxTransientPollErrors = 20;
  const start = Date.now();
  let completed = false;
  let transientPollErrors = 0;

  while (Date.now() - start < maxWaitMs) {
    let stRes;
    try {
      stRes = await fetch(`${OPENAI_API_BASE}/videos/${videoId}`, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      });
    } catch (err) {
      transientPollErrors++;
      if (transientPollErrors > maxTransientPollErrors) {
        throw new Error(`OpenAI poll failed after network errors: ${err?.message || err}`);
      }
      console.warn(
        `OpenAI Sora: poll network error (${err?.message || err}), retry ${transientPollErrors}/${maxTransientPollErrors}…`
      );
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }

    const st = await stRes.json().catch(() => ({}));
    if (!stRes.ok) {
      if (isTransientHttpStatus(stRes.status) && transientPollErrors < maxTransientPollErrors) {
        transientPollErrors++;
        console.warn(
          `OpenAI Sora: poll HTTP ${stRes.status} (${st?.error?.message || "bad gateway"}) — retry ${transientPollErrors}/${maxTransientPollErrors}, job may still be running…`
        );
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      throw new Error(st?.error?.message || `OpenAI poll failed ${stRes.status}`);
    }

    transientPollErrors = 0;
    const status = st?.status;
    let pct = "";
    if (st?.progress != null) {
      const p = Number(st.progress);
      pct = ` ${Math.round(p <= 1 && p >= 0 ? p * 100 : p)}%`;
    }
    console.log(`OpenAI Sora: status=${status}${pct}`);
    if (status === "completed") {
      completed = true;
      break;
    }
    if (status === "failed") {
      throw new Error(st?.error?.message || st?.error?.code || "Sora generation failed");
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  if (!completed) {
    throw new Error("OpenAI Sora timed out (still not completed after polling). Try again or use a shorter clip.");
  }

  const buf = await downloadVideoContentWithRetries(videoId);
  await fs.writeFile(outputPath, buf);
  console.log("OpenAI Sora: video saved.");
  return outputPath;
}

async function downloadVideoContentWithRetries(videoId, maxAttempts = 5) {
  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let contentRes;
    try {
      contentRes = await fetch(`${OPENAI_API_BASE}/videos/${videoId}/content`, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        redirect: "follow",
      });
    } catch (err) {
      lastErr = err?.message || String(err);
      console.warn(`OpenAI Sora: download network error (try ${attempt}/${maxAttempts}): ${lastErr}`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      continue;
    }
    if (contentRes.ok) {
      return Buffer.from(await contentRes.arrayBuffer());
    }
    const t = await contentRes.text().catch(() => "");
    lastErr = `${contentRes.status}: ${t.slice(0, 200)}`;
    if (isTransientHttpStatus(contentRes.status) && attempt < maxAttempts) {
      console.warn(`OpenAI Sora: download HTTP ${contentRes.status} (try ${attempt}/${maxAttempts}), retrying…`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      continue;
    }
    throw new Error(`OpenAI video download failed ${contentRes.status}: ${t.slice(0, 500)}`);
  }
  throw new Error(`OpenAI video download failed after ${maxAttempts} tries: ${lastErr}`);
}

const SPACE_CARTOON_STYLE = [
  "Visual style: high-quality 3D cartoon animation, Pixar-like, vibrant colors, soft lighting, child-friendly (ages 6–12).",
  "Main character: a cute cartoon astronaut with a friendly helmet, big expressive eyes, playful gestures — acts as a guide.",
  "No long blocks of on-screen text; show planets, symbols, and simple props. Family-safe; no horror or gore.",
].join("\n");

/**
 * Sora prompts for Space Adventure scenes — keys match `config.js` scene `key` values.
 */
export function buildSpaceSceneSoraPrompt(sceneKey) {
  const k = String(sceneKey || "").toLowerCase();
  if (k === "intro") {
    return [
      "Create a short colorful cartoon animated educational video: OVERVIEW OF OUR SOLAR SYSTEM for kids.",
      SPACE_CARTOON_STYLE,
      "The astronaut floats in space near a stylized glowing Sun. Show a quick montage of all eight planets in order — Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune — each as a bright, recognizable cartoon globe with one signature visual (e.g. Mercury cratered and sun-baked; Venus thick golden clouds; Earth blue oceans and clouds; Mars red deserts; Jupiter swirling bands and a storm spot; Saturn magnificent rings; Uranus pale blue and tilted; Neptune deep blue).",
      "Use smooth cinematic camera moves (slow zooms, gentle orbits). Magical starfield and soft nebula colors in the background.",
      "Pacing: one short clip — highlights montage, not a lecture.",
    ].join("\n\n");
  }
  if (k === "pair_mercury_venus") {
    return [
      "Create a short colorful cartoon animated educational video about the INNER PLANETS Mercury and Venus for kids.",
      SPACE_CARTOON_STYLE,
      "The astronaut flies past Mercury: small, gray, cratered, very close to a bright Sun — emphasize heat and rocky surface.",
      "Then transition to Venus: thick yellow-white clouds, golden atmosphere, mysterious and hot — no scary imagery.",
      "Educational story-adventure tone; dynamic but calm camera moves between the two worlds.",
    ].join("\n\n");
  }
  if (k === "pair_earth_mars") {
    return [
      "Create a short colorful cartoon animated educational video about Earth and Mars for kids.",
      SPACE_CARTOON_STYLE,
      "Show Earth first: blue oceans, white clouds, green land — our home planet, life-friendly.",
      "Then Mars: red deserts, dust, rusty rocks — the red planet; optional small rover or flag for fun (cartoon, not scary).",
      "Contrast blue Earth with red Mars; gentle orbit and fly-by shots; optimistic educational tone.",
    ].join("\n\n");
  }
  if (k === "pair_jupiter_saturn") {
    return [
      "Create a short colorful cartoon animated educational video about the GAS GIANTS Jupiter and Saturn for kids.",
      SPACE_CARTOON_STYLE,
      "Jupiter: massive planet with colorful bands, swirling clouds, and a large storm feature (Great Red Spot style) — awe-inspiring but friendly cartoon scale.",
      "Saturn: stunning icy bright rings circling the planet — majestic, slow rotation, magical lighting.",
      "Emphasize size and beauty; smooth camera orbits; cosmic backdrop of stars.",
    ].join("\n\n");
  }
  if (k === "pair_uranus_neptune") {
    return [
      "Create a short colorful cartoon animated educational video about the ICE GIANTS Uranus and Neptune for kids.",
      SPACE_CARTOON_STYLE,
      "Uranus: pale blue-green, smooth clouds, unusual tilt — dreamy and cool tones.",
      "Neptune: deep rich blue, stormy clouds, windy look — mysterious and beautiful, still cartoon-friendly.",
      "Show distance and cold beauty; soft glows; gentle camera drift between the two worlds.",
    ].join("\n\n");
  }
  throw new Error(`Unknown space scene key: ${sceneKey}`);
}

const SPACE_ADVENTURE_VIDEO_SPECS = [
  { key: "intro", filename: "space_intro.mp4", label: "Intro — solar system overview" },
  { key: "pair_mercury_venus", filename: "space_pair1.mp4", label: "Mercury & Venus" },
  { key: "pair_earth_mars", filename: "space_pair2.mp4", label: "Earth & Mars" },
  { key: "pair_jupiter_saturn", filename: "space_pair3.mp4", label: "Jupiter & Saturn" },
  { key: "pair_uranus_neptune", filename: "space_pair4.mp4", label: "Uranus & Neptune" },
];

/**
 * Generates all Space Adventure clips with OpenAI Sora (one job per scene).
 * Files: output/final/space_intro.mp4 … space_pair4.mp4 → served as /api/video/...
 */
export async function generateSpaceAdventureSceneVideos(onProgress) {
  const total = SPACE_ADVENTURE_VIDEO_SPECS.length;
  await ensureOutputDir(FINAL_DIR);
  /** @type {Record<string, string>} */
  const videos = {};

  for (let i = 0; i < SPACE_ADVENTURE_VIDEO_SPECS.length; i++) {
    const spec = SPACE_ADVENTURE_VIDEO_SPECS[i];
    const step = i + 1;
    onProgress?.({ step, total, label: spec.label });
    const prompt = buildSpaceSceneSoraPrompt(spec.key);
    const outputPath = path.join(FINAL_DIR, spec.filename);
    console.log(`Space Adventure Sora [${step}/${total}]: ${spec.label} → ${spec.filename}`);
    await createVideoWithOpenAISora(prompt, outputPath);
    videos[spec.key] = `/api/video/${spec.filename}`;
  }

  onProgress?.({ step: total, total, label: "All clips ready" });
  return { videos };
}

const PLANET_ROCKET_STYLE =
  "Cute talking rocket with a friendly face (big eyes, expressive), cartoon style, colorful 3D or soft 2D animation for children ages 6–12. No long blocks of on-screen text; show action and visuals. Family-safe.";

/**
 * Sora prompt for “Space Adventure: Learn the Planets” — one clip per planet (see space-learn/SORA_PROMPTS.md).
 * API clip length may be capped by OPENAI_VIDEO_SECONDS (often 4–12s); prompt still describes full lesson beats.
 */
export function buildPlanetLevelSoraPrompt(planetId) {
  const p = String(planetId || "").toLowerCase();
  const blocks = {
    mercury: [
      "Create an animated educational video for children about the planet MERCURY.",
      PLANET_ROCKET_STYLE,
      "Structure: 0–5s rocket flies toward Mercury near the Sun. 5–10s show Mercury — rocky, gray, cratered. 10–20s orbit / rotate with heat glow. 20–30s rocket gestures while “speaking”.",
      "Narration tone (do not show as big text on screen): Mercury is the closest planet to the Sun. Very hot in daytime and very cold at night. Mercury is small and rocky.",
    ],
    venus: [
      "Create an animated educational video for children about the planet VENUS.",
      PLANET_ROCKET_STYLE,
      "0–5s rocket approaches Venus. 5–10s thick yellow-white clouds. 10–20s clouds swirl. 20–30s rocket explains.",
      "Narration tone: Venus is the hottest planet, covered with thick clouds, and shines very bright in the sky.",
    ],
    earth: [
      "Create an animated educational video for children about planet EARTH.",
      PLANET_ROCKET_STYLE,
      "0–5s rocket approaches Earth. 5–10s blue oceans and white clouds. 10–20s gentle zoom. 20–30s rocket explains.",
      "Narration tone: Earth is our home — water, air, and life. The only planet we know with living things.",
    ],
    mars: [
      "Create an animated educational video for children about planet MARS.",
      PLANET_ROCKET_STYLE,
      "0–5s rocket flies to Mars. 5–10s red surface. 10–20s dust storms. 20–30s rocket explains.",
      "Narration tone: Mars is the Red Planet — dust storms; scientists study it for signs of past or future life.",
    ],
    jupiter: [
      "Create an animated educational video for children about planet JUPITER.",
      PLANET_ROCKET_STYLE,
      "0–5s rocket approaches huge planet. 5–10s Jupiter fills frame. 10–20s swirling storms and Great Red Spot style feature. 20–30s rocket explains.",
      "Narration tone: Jupiter is the largest planet — a gas giant with huge storms.",
    ],
    saturn: [
      "Create an animated educational video for children about planet SATURN.",
      PLANET_ROCKET_STYLE,
      "0–5s rocket flies to Saturn. 5–10s icy bright rings appear. 10–20s camera circles rings. 20–30s rocket explains.",
      "Narration tone: Saturn is famous for beautiful rings made of ice and rock.",
    ],
    uranus: [
      "Create an animated educational video for children about planet URANUS.",
      PLANET_ROCKET_STYLE,
      "0–5s rocket approaches Uranus. 5–10s pale blue-green planet. 10–20s show unusual tilted rotation. 20–30s rocket explains.",
      "Narration tone: Uranus spins on its side and is very cold.",
    ],
    neptune: [
      "Create an animated educational video for children about planet NEPTUNE.",
      PLANET_ROCKET_STYLE,
      "0–5s rocket travels far outward. 5–10s deep blue planet. 10–20s fast winds and clouds. 20–30s rocket explains.",
      "Narration tone: Neptune is the farthest planet — very strong winds and extremely cold.",
    ],
  };
  const body = blocks[p];
  if (!body) throw new Error(`Unknown planet id for Sora: ${planetId}`);
  return body.join("\n\n");
}

const SPACE_PLANET_LEVEL_SPECS = [
  { id: "mercury", filename: "mercury.mp4", label: "Mercury" },
  { id: "venus", filename: "venus.mp4", label: "Venus" },
  { id: "earth", filename: "earth.mp4", label: "Earth" },
  { id: "mars", filename: "mars.mp4", label: "Mars" },
  { id: "jupiter", filename: "jupiter.mp4", label: "Jupiter" },
  { id: "saturn", filename: "saturn.mp4", label: "Saturn" },
  { id: "uranus", filename: "uranus.mp4", label: "Uranus" },
  { id: "neptune", filename: "neptune.mp4", label: "Neptune" },
];

/**
 * Generates eight separate OpenAI Sora clips (one per planet) for the React “Learn the Planets” app.
 * Saves to output/final/mercury.mp4 … neptune.mp4 → /api/video/mercury.mp4 etc.
 */
export async function generateSpacePlanetLevelVideos(onProgress) {
  const total = SPACE_PLANET_LEVEL_SPECS.length;
  await ensureOutputDir(FINAL_DIR);
  /** @type {Record<string, string>} */
  const videos = {};

  for (let i = 0; i < SPACE_PLANET_LEVEL_SPECS.length; i++) {
    const spec = SPACE_PLANET_LEVEL_SPECS[i];
    const step = i + 1;
    onProgress?.({ step, total, label: spec.label });
    const prompt = buildPlanetLevelSoraPrompt(spec.id);
    const outputPath = path.join(FINAL_DIR, spec.filename);
    console.log(`Space planet Sora [${step}/${total}]: ${spec.label} → ${spec.filename}`);
    await createVideoWithOpenAISora(prompt, outputPath);
    videos[spec.id] = `/api/video/${spec.filename}`;
  }

  onProgress?.({ step: total, total, label: "All 8 planet clips ready" });
  return { videos };
}

/**
 * One OpenAI Sora clip for a single planet (mercury … neptune).
 */
export async function generateOneSpacePlanetVideo(planetId) {
  const id = String(planetId || "").toLowerCase();
  const spec = SPACE_PLANET_LEVEL_SPECS.find((s) => s.id === id);
  if (!spec) {
    throw new Error(`Unknown planet: ${planetId}. Use: ${SPACE_PLANET_LEVEL_SPECS.map((s) => s.id).join(", ")}`);
  }
  await ensureOutputDir(FINAL_DIR);
  const prompt = buildPlanetLevelSoraPrompt(id);
  const outputPath = path.join(FINAL_DIR, spec.filename);
  console.log(`Space planet Sora (single): ${spec.label} → ${spec.filename}`);
  await createVideoWithOpenAISora(prompt, outputPath);
  return { planetId: id, videoUrl: `/api/video/${spec.filename}` };
}

async function generateHistoryLessonVideoFromContent(textbookContent, outputBasename = "history_lesson", options = {}) {
  const topic = String(options.topic || "history").toLowerCase();
  const teachingPrompts =
    options.teachingPrompts !== undefined ? options.teachingPrompts : loadTeachingPromptsForTopic(topic);
  await ensureOutputDir(FINAL_DIR);

  const label = topic === "space" ? "space" : "history";
  console.log(`Generating ${label} teacher script (OpenAI ${OPENAI_MODEL})...`);
  const script = await generateTeacherScript(textbookContent, teachingPrompts, topic);
  console.log(`Script ready (${script.split(/\s+/).length} words).`);

  const lessonTitle = getLessonTitle(textbookContent);
  const outputPath = path.join(FINAL_DIR, `${outputBasename}.mp4`);

  console.log(`Creating lesson video with OpenAI Sora (${label}; short clip, see README)...`);
  const soraPrompt = buildSoraPrompt(textbookContent, script, lessonTitle, topic, {
    videoSeconds: OPENAI_VIDEO_SECONDS,
  });
  await createVideoWithOpenAISora(soraPrompt, outputPath);
  console.log(`✅ Sora lesson video saved: ${outputPath}`);

  const scriptPath = path.join(FINAL_DIR, `${outputBasename}.txt`);
  await fs.writeFile(
    scriptPath,
    `${lessonTitle}\n\n${script}\n`,
    "utf-8"
  );
  console.log(`Script saved (matches video beats): ${scriptPath}`);

  let quiz;
  if (topic === "space") {
    quiz = { quizMode: "space_games" };
    console.log("Space lesson: quiz = interactive games (no AI quiz).");
  } else {
    console.log("Generating quiz from video script...");
    quiz = await generateQuizFromContent(script, topic);
    console.log(`Quiz ready (${quiz.questions.length} questions, script-based).`);
  }

  if (topic === "history") {
    const metaPath = path.join(FINAL_DIR, `${outputBasename}.meta.json`);
    await fs.writeFile(
      metaPath,
      JSON.stringify({ lessonTitle, script, quiz, savedAt: new Date().toISOString() }),
      "utf-8"
    );
    console.log(`History metadata saved: ${metaPath}`);
  }

  return { videoPath: outputPath, scriptPath, script, quiz, lessonTitle, topic };
}

async function generateHistoryLessonVideo(lessonPath = "./lesson.txt", outputBasename = "history_lesson", options = {}) {
  const topic = String(options.topic || "history").toLowerCase();
  const textbookContent = loadTextbookLesson(lessonPath);
  return generateHistoryLessonVideoFromContent(textbookContent, outputBasename, {
    ...options,
    topic,
  });
}

async function main() {
  const argPath = process.argv[2];
  const argTopic = process.argv[3];
  const lessonPath = argPath || getLessonPathForTopic("history");
  const topic =
    argTopic === "space" || argTopic === "history"
      ? argTopic
      : /lesson_space|space/i.test(lessonPath)
        ? "space"
        : "history";
  const out = await generateHistoryLessonVideo(lessonPath, "history_lesson", { topic });
  console.log("Video:", out.videoPath);
}

export {
  loadTextbookLesson,
  loadTeachingPrompts,
  getLessonTitle,
  generateQuizFromContent,
  generateTeacherScript,
  generatePyramidTeacherScript,
  generateHistoryLessonVideo,
  generateHistoryLessonVideoFromContent,
  buildSoraPrompt,
};

/** @deprecated use generateTeacherScript or generatePyramidTeacherScript */
export const generatePharaohTeacherScript = generatePyramidTeacherScript;

const isRunDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isRunDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
