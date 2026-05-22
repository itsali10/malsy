# Space Adventure: Learn the Planets (React)

Level-based app: **8 planets** = **8 levels**. Each level has an optional video + **mandatory quiz** (≥70% to unlock the next). Progress is stored in **`localStorage`**.

## Build (first time)

```bash
cd ai-history-video
npm install --prefix space-learn
npm run build:space
```

This installs React/Vite into `space-learn/node_modules` and outputs the static site to **`public/space-learn/`**.

> If `npm install` fails (e.g. OneDrive syncing `node_modules`), try moving the project to a non-synced folder or run the install again.

## Run

```bash
npm run start
```

Open **http://localhost:3000/** → **Space science**, or go directly to **http://localhost:3000/space-learn/**

## Dev (hot reload)

Terminal 1: `npm run start` (API on port 3000)  
Terminal 2:

```bash
cd space-learn
npm run dev
```

Opens Vite on **http://localhost:5173** with `/api` proxied to your server.

## Sora videos (all 8 planets)

The app expects **real Sora files** on the API:

| File (in `output/final/`) | URL |
|---------------------------|-----|
| `mercury.mp4` … `neptune.mp4` | `/api/video/mercury.mp4` … |

**Generate all 8 with OpenAI (slow):**

1. `OPENAI_API_KEY` in `.env` with Sora access  
2. With the server running, either:
   - Click **Generate 8 planet videos (Sora)** in the Space app header, or  
   - `curl -X POST http://localhost:3000/api/generate-space-planets`

3. Check progress in the server terminal; each clip is one Sora job.

Prompts used by the server match **`space-learn/SORA_PROMPTS.md`** (see also `buildPlanetLevelSoraPrompt` in `index.js`). Clip length follows **`OPENAI_VIDEO_SECONDS`** (API often allows 4–12s per clip even if the prompt describes 30s beats).

## Components

| File | Role |
|------|------|
| `src/components/LevelMap.jsx` | Planet grid + locks |
| `src/components/VideoPlayer.jsx` | HTML5 player |
| `src/components/Quiz.jsx` | 70% pass rule |
| `src/components/ProgressManager.js` | `localStorage` |
