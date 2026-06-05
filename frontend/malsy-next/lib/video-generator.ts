/**
 * Virtual School – lesson videos via OpenAI Chat + Sora.
 * Migrated from GradGame/ai-history-video/index.js.
 * All file I/O remains identical; OpenAI calls use raw fetch.
 */

import fs from 'fs-extra';
import { mkdir } from 'fs/promises';
import path from 'path';

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? '').trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const OPENAI_VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL ?? 'sora-2';
const OPENAI_VIDEO_SECONDS = String(process.env.OPENAI_VIDEO_SECONDS ?? '12');
const OPENAI_VIDEO_SIZE = process.env.OPENAI_VIDEO_SIZE ?? '1280x720';
const OPENAI_API_BASE = 'https://api.openai.com/v1';

/** output/final/ inside the Next.js project root */
export const FINAL_DIR = path.join(process.cwd(), 'output', 'final');

export const SPACE_HOME_LESSON_BASENAME = 'space_home_lesson';
export const HISTORY_LESSON_BASENAME = 'history_lesson';

export const LESSON_TOPIC: Record<string, string> = {
  history: './lesson.txt',
  space: './lesson_space.txt',
};

async function ensureOutputDir(dirPath: string) {
  try {
    const stat = await fs.stat(dirPath);
    if (stat.isFile()) await fs.remove(dirPath);
  } catch {
    // path doesn't exist – that's fine
  }
  await mkdir(dirPath, { recursive: true });
}

export function getLessonPathForTopic(topic: string): string {
  const t = String(topic || 'history').toLowerCase();
  const p = LESSON_TOPIC[t];
  if (!p) throw new Error(`Unknown topic "${topic}". Use: history, space`);
  return p;
}

export function loadTeachingPromptsForTopic(topic = 'history'): string {
  const t = String(topic || 'history').toLowerCase();
  const candidates = [
    path.join(process.cwd(), `teaching_prompts_${t}.txt`),
    path.join(process.cwd(), 'teaching_prompts.txt'),
  ];
  for (const fullPath of candidates) {
    if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath, 'utf-8').trim();
  }
  return '';
}

function loadTextbookLesson(lessonPath = './lesson.txt'): string {
  const fullPath = path.resolve(lessonPath);
  if (!fs.existsSync(fullPath)) throw new Error(`Lesson file not found: ${fullPath}`);
  return fs.readFileSync(fullPath, 'utf-8');
}

function getLessonTitle(textbookContent: string): string {
  const first = (textbookContent || '').trim().split(/\n/)[0] || '';
  return first.slice(0, 80).trim() || 'History Lesson';
}

function getFriendlyErrorMessage(err: unknown): string {
  const msg =
    (err as { message?: string })?.message ??
    ((err as { error?: { message?: string } })?.error?.message) ??
    String(err);
  if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
    return 'Network error. Check your internet or firewall.';
  }
  if (msg.includes('quota') || msg.includes('API key') || msg.includes('401') || msg.includes('429') || msg.includes('OpenAI')) {
    return 'API error: check OPENAI_API_KEY in .env and Sora / video access on your account.';
  }
  return msg;
}
export { getFriendlyErrorMessage };

async function openaiChatCompletion(promptText: string): Promise<string> {
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: promptText }],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: { message?: string } })?.error?.message ?? `OpenAI ${res.status}`);
  const text = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
  if (text) return text.trim();
  throw new Error('OpenAI did not return text');
}

const HISTORY_QUIZ_QUESTIONS = 3;

async function generateQuizFromContent(quizSourceText: string, topic = 'history') {
  const t = String(topic || 'history').toLowerCase();
  const n = HISTORY_QUIZ_QUESTIONS;
  const prompt =
    t === 'history'
      ? `The following is the complete narration script of a short educational HISTORY video. Create exactly ${n} multiple-choice quiz questions.\n\nRules:\n- Every question MUST be answerable using ONLY information stated or clearly implied in this script.\n- Each question: exactly 4 options (A, B, C, D) and one correct answer.\n- Suitable for students ages 8–14.\n\nScript:\n${(quizSourceText || '').slice(0, 4000)}\n\nRespond with ONLY valid JSON:\n{"questions":[{"question":"?","options":["A","B","C","D"],"correctIndex":0}]}`
      : `Based on this space science lesson, create exactly ${n} multiple-choice quiz questions. Each with 4 options and one correct answer.\n\nLesson:\n${(quizSourceText || '').slice(0, 3000)}\n\nRespond with ONLY valid JSON:\n{"questions":[{"question":"?","options":["A","B","C","D"],"correctIndex":0}]}`;

  let raw = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { raw = await openaiChatCompletion(prompt); break; }
    catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 1000)); }
  }
  const jsonStr = raw.replace(/```json\s*|\s*```/g, '').trim();
  let parsed: { questions?: unknown[] } = {};
  try { parsed = JSON.parse(jsonStr); } catch { /* noop */ }
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return {
    questions: (questions as { question?: string; options?: unknown[]; correctIndex?: number }[])
      .slice(0, n)
      .map((q) => ({
        question: String(q.question || '').trim(),
        options: Array.isArray(q.options) ? q.options.slice(0, 4).map((o) => String(o).trim()) : [],
        correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
      }))
      .filter((q) => q.question && q.options.length >= 2),
  };
}

function historyClipWordBudget(secondsStr: string): number {
  const s = parseInt(String(secondsStr || '12'), 10);
  const sec = [4, 8, 12].includes(s) ? s : 12;
  return Math.min(90, Math.max(14, Math.round(sec * 2.4)));
}

function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

async function shortenHistoryScriptForClip(script: string, maxWords: number): Promise<string> {
  const prompt = `Rewrite this spoken lesson for kids to at most ${maxWords} words. Keep exactly 3 short paragraphs separated by ONE blank line. Preserve facts and warm tone. Output ONLY the script, no title.\n\nScript:\n\n${script}`;
  return openaiChatCompletion(prompt);
}

async function generateTeacherScript(textbookContent: string, teachingPrompts = '', topic = 'history'): Promise<string> {
  const t = String(topic || 'history').toLowerCase();
  const characterIntro =
    t === 'space'
      ? `You are the BRAIN of a cute animated ASTRONAUT character in a SPACE ADVENTURE STORY for kids. Output only what the character says out loud.`
      : `You are the BRAIN of a friendly animated PYRAMID mascot in an educational HISTORY video for kids. Output only what that character says.`;

  const hookHint =
    t === 'space'
      ? `Start with a story hook (e.g. "Come with me on a trip through the solar system...").`
      : `Start with a short greeting (e.g. "Hello, young historians...").`;

  const maxWords = t === 'history' ? historyClipWordBudget(OPENAI_VIDEO_SECONDS) : 200;

  const format =
    t === 'history'
      ? `- Clip is ${OPENAI_VIDEO_SECONDS}s. Use at most ${maxWords} words. Exactly 3 short paragraphs separated by ONE blank line.`
      : `- Output ONLY the spoken script: ~120–200 words. No titles, no character labels.`;

  const system = `${characterIntro}\n${teachingPrompts ? `Teaching instructions:\n${teachingPrompts}\n` : ''}\nRules:\n- Output ONLY the spoken script.\n${format}\n- ${hookHint}`;
  const userMessage = `${system}\n\n---\n\nLesson:\n\n${textbookContent}`;

  let lastErr: unknown;
  let script = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { script = await openaiChatCompletion(userMessage); break; }
    catch (err) { lastErr = err; if (attempt < 2) await new Promise((r) => setTimeout(r, 2000)); }
  }
  if (!script) throw lastErr;
  if (t === 'history' && countWords(script) > maxWords + 4) {
    try { script = await shortenHistoryScriptForClip(script, maxWords); } catch { /* use longer */ }
  }
  return script.trim();
}

// ── Sora prompts ──────────────────────────────────────────────────────────────

const SPACE_CARTOON_STYLE = [
  'Visual style: high-quality 3D cartoon animation, Pixar-like, vibrant colors, child-friendly (ages 6–12).',
  'Main character: cute cartoon astronaut, friendly helmet, big expressive eyes, playful gestures.',
  'No long on-screen text. Family-safe.',
].join('\n');

function buildSpaceAdventureSoraPrompt(lessonTitle: string, textbookContent: string, teacherScript: string): string {
  const title = (lessonTitle || '').trim() || 'Space Adventure Story Lesson';
  const body = (textbookContent || '').trim().slice(0, 2800);
  const scriptHint = (teacherScript || '').trim().slice(0, 1400);
  return [
    '🎬 Sora Prompt – Space Adventure Story Lesson',
    'A colorful cinematic animated educational video for children about the solar system.',
    'A cute friendly animated astronaut floats in space as a storyteller.',
    'The astronaut visits: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.',
    'Style: high-quality 3D animation, Pixar-like, vibrant colors.',
    `Lesson title: ${title}`,
    'Factual content:', body,
    'Tone:', scriptHint,
  ].join('\n\n');
}

function buildSoraPrompt(textbookContent: string, teacherScript: string, lessonTitle: string, topic = 'history'): string {
  const t = String(topic || 'history').toLowerCase();
  const title = (lessonTitle || '').trim() || (t === 'space' ? 'Space Adventure' : 'History Lesson');
  if (t === 'space') return buildSpaceAdventureSoraPrompt(title, textbookContent, teacherScript);

  const body = (textbookContent || '').trim().slice(0, 2500);
  const scriptHint = (teacherScript || '').trim().slice(0, 1200);
  const secNum = parseInt(OPENAI_VIDEO_SECONDS, 10) || 12;
  const rawParts = teacherScript.trim().split(/\n\s*\n+/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const parts = rawParts.length >= 2 ? rawParts : [teacherScript.trim()].filter(Boolean);
  const third = Math.max(1, Math.round(secNum / Math.max(parts.length, 1)));

  const syncBlock = parts.length >= 2
    ? [
        `CRITICAL: ${secNum}s clip. Animate ${parts.length} sequential beats.`,
        ...parts.map((text, i) => {
          const t0 = i * third;
          const t1 = i === parts.length - 1 ? secNum : Math.min(secNum, (i + 1) * third);
          return `BEAT ${i + 1} (${t0}–${t1}s): "${text.slice(0, 500)}"`;
        }),
      ].join('\n\n')
    : `Single ${secNum}s flow: ${scriptHint}`;

  return [
    'Create a short colorful CARTOON-style animated educational video for elementary students.',
    `Topic: ${title}`,
    'Main character: a cartoony anthropomorphic pyramid mascot — chunky shapes, big eyes, friendly, Pixar-cute. Teacher character.',
    'Setting: ancient Egypt / history mood. Family-friendly.',
    'Visual style: cartoon/2D or soft 3D — bold colors, kid-friendly.',
    syncBlock,
    'Lesson ideas:', body,
    'Voiceover script:', scriptHint,
  ].join('\n\n');
}

function isTransientHttpStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

async function downloadVideoContentWithRetries(videoId: string, maxAttempts = 5): Promise<Buffer> {
  let lastErr = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let contentRes: Response;
    try {
      contentRes = await fetch(`${OPENAI_API_BASE}/videos/${videoId}/content`, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        redirect: 'follow',
      });
    } catch (err) {
      lastErr = (err as Error)?.message || String(err);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      continue;
    }
    if (contentRes.ok) return Buffer.from(await contentRes.arrayBuffer());
    const t = await contentRes.text().catch(() => '');
    lastErr = `${contentRes.status}: ${t.slice(0, 200)}`;
    if (isTransientHttpStatus(contentRes.status) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 4000 * attempt)); continue;
    }
    throw new Error(`OpenAI video download failed ${contentRes.status}: ${t.slice(0, 500)}`);
  }
  throw new Error(`OpenAI video download failed after ${maxAttempts} tries: ${lastErr}`);
}

async function createVideoWithOpenAISora(prompt: string, outputPath: string): Promise<string> {
  const seconds = ['4', '8', '12'].includes(OPENAI_VIDEO_SECONDS) ? OPENAI_VIDEO_SECONDS : '12';
  const allowedSizes = ['720x1280', '1280x720', '1024x1792', '1792x1024'];
  const size = allowedSizes.includes(OPENAI_VIDEO_SIZE) ? OPENAI_VIDEO_SIZE : '1280x720';

  const form = new FormData();
  form.append('model', OPENAI_VIDEO_MODEL);
  form.append('prompt', prompt.slice(0, 32000));
  form.append('seconds', seconds);
  form.append('size', size);

  console.log(`OpenAI Sora: submitting job (${OPENAI_VIDEO_MODEL}, ${seconds}s, ${size})...`);
  const createRes = await fetch(`${OPENAI_API_BASE}/videos`, {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form,
  });
  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error((createJson as { error?: { message?: string } })?.error?.message ?? `OpenAI videos ${createRes.status}`);
  const videoId = (createJson as { id?: string })?.id;
  if (!videoId) throw new Error('OpenAI did not return video id');

  const pollMs = 8000;
  const maxWaitMs = 30 * 60 * 1000;
  const maxTransientPollErrors = 20;
  const start = Date.now();
  let completed = false;
  let transientPollErrors = 0;

  while (Date.now() - start < maxWaitMs) {
    let stRes: Response;
    try {
      stRes = await fetch(`${OPENAI_API_BASE}/videos/${videoId}`, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
    } catch (err) {
      transientPollErrors++;
      if (transientPollErrors > maxTransientPollErrors) throw new Error(`OpenAI poll failed: ${(err as Error)?.message}`);
      await new Promise((r) => setTimeout(r, pollMs)); continue;
    }
    const st = await stRes.json().catch(() => ({})) as { status?: string; progress?: number; error?: { message?: string; code?: string } };
    if (!stRes.ok) {
      if (isTransientHttpStatus(stRes.status) && transientPollErrors < maxTransientPollErrors) {
        transientPollErrors++; await new Promise((r) => setTimeout(r, pollMs)); continue;
      }
      throw new Error(st?.error?.message ?? `OpenAI poll failed ${stRes.status}`);
    }
    transientPollErrors = 0;
    console.log(`OpenAI Sora: status=${st?.status}`);
    if (st?.status === 'completed') { completed = true; break; }
    if (st?.status === 'failed') throw new Error(st?.error?.message ?? st?.error?.code ?? 'Sora generation failed');
    await new Promise((r) => setTimeout(r, pollMs));
  }
  if (!completed) throw new Error('OpenAI Sora timed out.');

  const buf = await downloadVideoContentWithRetries(videoId);
  await fs.writeFile(outputPath, buf);
  console.log('OpenAI Sora: video saved.');
  return outputPath;
}

// ── Space Adventure ───────────────────────────────────────────────────────────

export function buildSpaceSceneSoraPrompt(sceneKey: string): string {
  const k = String(sceneKey || '').toLowerCase();
  if (k === 'intro') return [
    'Create a colorful cartoon animated educational video: OVERVIEW OF OUR SOLAR SYSTEM for kids.',
    SPACE_CARTOON_STYLE,
    'Astronaut floats near Sun. Quick montage of all 8 planets in order. Smooth cinematic camera moves.',
  ].join('\n\n');
  if (k === 'pair_mercury_venus') return [
    'Colorful cartoon animated video: INNER PLANETS Mercury and Venus for kids.',
    SPACE_CARTOON_STYLE,
    'Mercury: small, gray, cratered, very hot near Sun. Then Venus: thick golden clouds, mysterious and hot.',
  ].join('\n\n');
  if (k === 'pair_earth_mars') return [
    'Colorful cartoon animated video: Earth and Mars for kids.',
    SPACE_CARTOON_STYLE,
    'Earth: blue oceans, white clouds — our home. Then Mars: red deserts, rust — contrast.',
  ].join('\n\n');
  if (k === 'pair_jupiter_saturn') return [
    'Colorful cartoon animated video: GAS GIANTS Jupiter and Saturn for kids.',
    SPACE_CARTOON_STYLE,
    'Jupiter: massive with colorful bands and storm. Saturn: stunning icy bright rings — majestic.',
  ].join('\n\n');
  if (k === 'pair_uranus_neptune') return [
    'Colorful cartoon animated video: ICE GIANTS Uranus and Neptune for kids.',
    SPACE_CARTOON_STYLE,
    'Uranus: pale blue-green, unusual tilt. Neptune: deep blue, windy — both dreamy.',
  ].join('\n\n');
  throw new Error(`Unknown space scene key: ${sceneKey}`);
}

const SPACE_ADVENTURE_VIDEO_SPECS = [
  { key: 'intro', filename: 'space_intro.mp4', label: 'Intro — solar system overview' },
  { key: 'pair_mercury_venus', filename: 'space_pair1.mp4', label: 'Mercury & Venus' },
  { key: 'pair_earth_mars', filename: 'space_pair2.mp4', label: 'Earth & Mars' },
  { key: 'pair_jupiter_saturn', filename: 'space_pair3.mp4', label: 'Jupiter & Saturn' },
  { key: 'pair_uranus_neptune', filename: 'space_pair4.mp4', label: 'Uranus & Neptune' },
];
export { SPACE_ADVENTURE_VIDEO_SPECS };

export async function generateSpaceAdventureSceneVideos(
  onProgress?: (p: { step: number; total: number; label: string }) => void
): Promise<{ videos: Record<string, string> }> {
  const total = SPACE_ADVENTURE_VIDEO_SPECS.length;
  await ensureOutputDir(FINAL_DIR);
  const videos: Record<string, string> = {};
  for (let i = 0; i < SPACE_ADVENTURE_VIDEO_SPECS.length; i++) {
    const spec = SPACE_ADVENTURE_VIDEO_SPECS[i];
    onProgress?.({ step: i + 1, total, label: spec.label });
    const prompt = buildSpaceSceneSoraPrompt(spec.key);
    const outputPath = path.join(FINAL_DIR, spec.filename);
    console.log(`Space Adventure Sora [${i + 1}/${total}]: ${spec.label}`);
    await createVideoWithOpenAISora(prompt, outputPath);
    videos[spec.key] = `/api/video/${spec.filename}`;
  }
  onProgress?.({ step: total, total, label: 'All clips ready' });
  return { videos };
}

// ── Planet levels ─────────────────────────────────────────────────────────────

const PLANET_ROCKET_STYLE =
  'Cute talking rocket with friendly face (big eyes), cartoon style, colorful 3D/2D for children 6–12. No long on-screen text. Family-safe.';

export function buildPlanetLevelSoraPrompt(planetId: string): string {
  const p = String(planetId || '').toLowerCase();
  const blocks: Record<string, string[]> = {
    mercury: ['Animated educational video for children: MERCURY.', PLANET_ROCKET_STYLE, 'Rocket flies to Mercury — small, gray, hot near Sun. Narration: closest planet, hot days, cold nights.'],
    venus:   ['Animated educational video for children: VENUS.', PLANET_ROCKET_STYLE, 'Rocket approaches Venus — thick yellow-white clouds. Narration: hottest planet, bright in sky.'],
    earth:   ['Animated educational video for children: EARTH.', PLANET_ROCKET_STYLE, 'Rocket near Earth — blue oceans, white clouds. Narration: our home, water and life.'],
    mars:    ['Animated educational video for children: MARS.', PLANET_ROCKET_STYLE, 'Rocket flies to Mars — red surface, dust. Narration: Red Planet, scientists study it.'],
    jupiter: ['Animated educational video for children: JUPITER.', PLANET_ROCKET_STYLE, 'Rocket nears huge planet — swirling storms. Narration: largest planet, gas giant.'],
    saturn:  ['Animated educational video for children: SATURN.', PLANET_ROCKET_STYLE, 'Rocket to Saturn — icy bright rings. Narration: famous for beautiful rings.'],
    uranus:  ['Animated educational video for children: URANUS.', PLANET_ROCKET_STYLE, 'Rocket to Uranus — pale blue, tilted. Narration: spins on its side, very cold.'],
    neptune: ['Animated educational video for children: NEPTUNE.', PLANET_ROCKET_STYLE, 'Rocket travels far — deep blue planet, fast winds. Narration: farthest planet, extremely cold.'],
  };
  const body = blocks[p];
  if (!body) throw new Error(`Unknown planet id: ${planetId}`);
  return body.join('\n\n');
}

const SPACE_PLANET_LEVEL_SPECS = [
  { id: 'mercury', filename: 'mercury.mp4', label: 'Mercury' },
  { id: 'venus',   filename: 'venus.mp4',   label: 'Venus'   },
  { id: 'earth',   filename: 'earth.mp4',   label: 'Earth'   },
  { id: 'mars',    filename: 'mars.mp4',    label: 'Mars'    },
  { id: 'jupiter', filename: 'jupiter.mp4', label: 'Jupiter' },
  { id: 'saturn',  filename: 'saturn.mp4',  label: 'Saturn'  },
  { id: 'uranus',  filename: 'uranus.mp4',  label: 'Uranus'  },
  { id: 'neptune', filename: 'neptune.mp4', label: 'Neptune' },
];
export { SPACE_PLANET_LEVEL_SPECS };

export async function generateSpacePlanetLevelVideos(
  onProgress?: (p: { step: number; total: number; label: string }) => void
): Promise<{ videos: Record<string, string> }> {
  const total = SPACE_PLANET_LEVEL_SPECS.length;
  await ensureOutputDir(FINAL_DIR);
  const videos: Record<string, string> = {};
  for (let i = 0; i < SPACE_PLANET_LEVEL_SPECS.length; i++) {
    const spec = SPACE_PLANET_LEVEL_SPECS[i];
    onProgress?.({ step: i + 1, total, label: spec.label });
    const prompt = buildPlanetLevelSoraPrompt(spec.id);
    const outputPath = path.join(FINAL_DIR, spec.filename);
    await createVideoWithOpenAISora(prompt, outputPath);
    videos[spec.id] = `/api/video/${spec.filename}`;
  }
  onProgress?.({ step: total, total, label: 'All 8 planet clips ready' });
  return { videos };
}

export async function generateOneSpacePlanetVideo(planetId: string): Promise<{ planetId: string; videoUrl: string }> {
  const id = String(planetId || '').toLowerCase();
  const spec = SPACE_PLANET_LEVEL_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`Unknown planet: ${planetId}`);
  await ensureOutputDir(FINAL_DIR);
  const prompt = buildPlanetLevelSoraPrompt(id);
  const outputPath = path.join(FINAL_DIR, spec.filename);
  await createVideoWithOpenAISora(prompt, outputPath);
  return { planetId: id, videoUrl: `/api/video/${spec.filename}` };
}

// ── History / Space lesson ────────────────────────────────────────────────────

export interface LessonResult {
  videoPath: string;
  scriptPath: string;
  script: string;
  quiz: unknown;
  lessonTitle: string;
  topic: string;
}

export async function generateHistoryLessonVideo(
  lessonPath: string,
  outputBasename = 'history_lesson',
  options: { topic?: string; teachingPrompts?: string } = {}
): Promise<LessonResult> {
  const topic = String(options.topic || 'history').toLowerCase();
  const textbookContent = loadTextbookLesson(lessonPath);
  return generateHistoryLessonVideoFromContent(textbookContent, outputBasename, { ...options, topic });
}

export async function generateHistoryLessonVideoFromContent(
  textbookContent: string,
  outputBasename = 'history_lesson',
  options: { topic?: string; teachingPrompts?: string } = {}
): Promise<LessonResult> {
  const topic = String(options.topic || 'history').toLowerCase();
  const teachingPrompts = options.teachingPrompts ?? loadTeachingPromptsForTopic(topic);
  await ensureOutputDir(FINAL_DIR);

  console.log(`Generating ${topic} teacher script…`);
  const script = await generateTeacherScript(textbookContent, teachingPrompts, topic);
  console.log(`Script ready (${script.split(/\s+/).length} words).`);

  const lessonTitle = getLessonTitle(textbookContent);
  const outputPath = path.join(FINAL_DIR, `${outputBasename}.mp4`);
  const soraPrompt = buildSoraPrompt(textbookContent, script, lessonTitle, topic);
  await createVideoWithOpenAISora(soraPrompt, outputPath);

  const scriptPath = path.join(FINAL_DIR, `${outputBasename}.txt`);
  await fs.writeFile(scriptPath, `${lessonTitle}\n\n${script}\n`, 'utf-8');

  let quiz: unknown;
  if (topic === 'space') {
    quiz = { quizMode: 'space_games' };
  } else {
    quiz = await generateQuizFromContent(script, topic);
  }

  if (topic === 'history') {
    const metaPath = path.join(FINAL_DIR, `${outputBasename}.meta.json`);
    await fs.writeFile(metaPath, JSON.stringify({ lessonTitle, script, quiz, savedAt: new Date().toISOString() }), 'utf-8');
  }

  return { videoPath: outputPath, scriptPath, script, quiz, lessonTitle, topic };
}
