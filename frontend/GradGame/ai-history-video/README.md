# Virtual School – Fun Lessons

**Home screen:** choose **History** (Sora video + quiz) or **Space science** (opens the **Space Adventure** app).

- **History** uses `lesson.txt` and optional `teaching_prompts.txt`. **OpenAI Sora** renders one short cartoon clip (talking pyramid); then a **5-question** multiple-choice quiz from the API.
- **Space science** opens **`/space-adventure/index.html`**: a **story-driven, scene-based lesson** (10 scenes: intro → planets → finale). Each scene can play a **local video** from `public/videos/` (placeholders like `video_mercury.mp4`; missing files use a sample clip). Includes **mini-games** (Mercury quiz, Earth rocket puzzle, Saturn constellation) and a **score / restart**. No backend required for Space Adventure — swap in your Sora exports when ready.

## Stack (only OpenAI)

| Piece | What |
|--------|------|
| **Chat API** (`OPENAI_MODEL`, default `gpt-4o-mini`) | Teacher script + 5-question quiz from `lesson.txt` |
| **Videos API** (`OPENAI_VIDEO_MODEL`, default `sora-2`) | MP4 clip of the animated pyramid scene |

**Requirements**

- One **`OPENAI_API_KEY`** with access to **Video generation / Sora** (see [Video generation](https://platform.openai.com/docs/guides/video-generation); availability varies by account).
- Each video job is **one short clip** (API allows **4, 8, or 12** seconds per request). This is **not** a full spoken narration of a long lesson in one file.

## Setup

1. Create `.env` in the project folder:

```env
OPENAI_API_KEY=sk-...
# Optional:
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_VIDEO_MODEL=sora-2
# OPENAI_VIDEO_SECONDS=12
# OPENAI_VIDEO_SIZE=1280x720
```

2. Install dependencies:

```bash
npm install
```

3. Edit **`lesson.txt`** (your textbook content) and optionally **`teaching_prompts.txt`** (how the pyramid should teach: tone, pacing, questions).

## Run

- **Web UI:** `npm run start` → http://localhost:3000 → pick **History** or **Space science** → **Generate lesson**
- **CLI:** `npm run generate` or `node index.js` — optional args: `node index.js [lesson.txt] [history|space]`. If you omit the topic, it is inferred from the filename (e.g. `lesson_space.txt` → space).

Output video: `output/final/<name>.mp4` (or `history_lesson.mp4` from CLI).

## Teaching prompts

`teaching_prompts.txt` guides **how** the pyramid teaches (simple words, storytelling, etc.). The script is fed into the **Sora prompt** so visuals and “performance” match the lesson tone.

## Removed (no longer used)

This repo used to support Groq, Edge TTS, FFmpeg overlays, D-ID, fal.ai SadTalker, HeyGen, ARTalk, etc. **Only OpenAI Chat + Sora** remain. If you need longer runtime than 12s, generate multiple clips in separate runs and merge them externally (not built in here).
