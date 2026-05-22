# Step-by-step guide: Pharaoh history lesson video

Follow these steps in order.

---

## Part 1: Basic setup (video with pharaoh image + voice)

### Step 1: Open the project folder

- Go to: `C:\Users\LENOVO\OneDrive\Desktop\ai-history-video`
- Open this folder in your editor (e.g. Cursor or VS Code) or remember this path for the terminal.

### Step 2: Install Node.js (if you don’t have it)

- If you already run `node` or `npm` in a terminal, skip this.
- Otherwise: download and install Node.js (LTS) from https://nodejs.org/
- In a terminal, run: `node -v` and `npm -v` to confirm they work.

### Step 3: Install project dependencies

1. Open a terminal (PowerShell or Command Prompt).
2. Go to the project folder:
   ```bash
   cd C:\Users\LENOVO\OneDrive\Desktop\ai-history-video
   ```
3. Run:
   ```bash
   npm install
   ```
4. Wait until it finishes without errors.

### Step 4: Get a Groq API key

1. Open: https://console.groq.com/keys
2. Sign up or log in.
3. Click **Create API Key** (or use an existing key).
4. Copy the key (it usually starts with `gsk_`).

### Step 5: Put the Groq key in `.env`

1. In the project folder, open the file **`.env`** (if it doesn’t exist, create it in the project root).
2. Add this line (replace with your real key):
   ```env
   GROQ_API_KEY=gsk_your_actual_key_here
   ```
3. Save the file.  
   The app needs this to generate the pharaoh’s script.

### Step 6: Add the pharaoh image (optional but recommended)

1. Get a pharaoh image (cartoon or photo). It should be a PNG or JPG.
2. Put it in the **`assets`** folder.
3. Name it exactly: **`pharaoh.png`**  
   Full path: `C:\Users\LENOVO\OneDrive\Desktop\ai-history-video\assets\pharaoh.png`  
   If the folder `assets` doesn’t exist, create it first.
4. If you skip this, the video will still work but with only a gold background and voice (no character image).

### Step 7: Start the server

1. In the same terminal (in the project folder), run:
   ```bash
   npm start
   ```
2. You should see something like:  
   `History video API running at http://localhost:3000`
3. Leave this terminal open while you use the app.

### Step 8: Open the app in the browser

1. Open your browser (Chrome, Edge, etc.).
2. Go to: **http://localhost:3000**
3. You should see the “Virtual School – Pharaoh History Lesson” page with a **“Generate lesson”** button.

### Step 9: Generate your first lesson video

1. Click **“Generate lesson”**.
2. Wait. The status will say something like “Generating lesson video… This may take a few minutes.”
3. The app will:
   - Read `lesson.txt` and `teaching_prompts.txt`
   - Call Groq to create the pharaoh’s script
   - Generate voice (Edge TTS or Google TTS)
   - Build the video (gold background + pharaoh image + audio)
4. When it’s done, you’ll see **“Video ready.”** in green and the video player will show the lesson.
5. Click play to watch.

### Step 10: Change the lesson or teaching style (optional)

- **Change the lesson text:** Edit **`lesson.txt`** in the project folder, save, then click **“Generate lesson”** again.
- **Change how the pharaoh teaches:** Edit **`teaching_prompts.txt`** (e.g. “Use simple words”, “Ask one question to the viewer”), save, then generate again.

---

## Part 2: Lip-sync talking pharaoh (optional – D-ID)

Only do this if you want the pharaoh’s **lips and face to move in sync** with the voice (real talking head).

### Step 2.1: Create a D-ID account and get an API key

1. Go to: https://www.d-id.com/
2. Sign up or log in.
3. Open the API / developers section and create or copy your **API key**.
4. D-ID has a free tier; check their pricing if you plan to make many videos.

### Step 2.2: Install and run ngrok (so D-ID can reach your app)

D-ID needs to download your pharaoh image and narration from the internet. Your app runs on your PC, so we use ngrok to give it a temporary public URL.

1. Go to: https://ngrok.com/ and sign up (free).
2. Download ngrok for Windows and unzip it (or install via `choco install ngrok` if you use Chocolatey).
3. Connect your account (ngrok will show the command; it’s usually `ngrok config add-authtoken YOUR_TOKEN`).
4. **Start your app first** (from Part 1): in one terminal run `npm start` in the project folder.
5. In a **second** terminal, run:
   ```bash
   ngrok http 3000
   ```
6. ngrok will show a line like:  
   `Forwarding   https://abc123xyz.ngrok-free.app -> http://localhost:3000`
7. Copy the **HTTPS** URL (e.g. `https://abc123xyz.ngrok-free.app`). You’ll use it in the next step.

### Step 2.3: Add D-ID settings to `.env`

1. Open **`.env`** in the project folder.
2. Add these two lines (use your real D-ID key and your ngrok HTTPS URL **without** a trailing slash):
   ```env
   D_ID_API_KEY=your_d_id_api_key_here
   BASE_URL=https://abc123xyz.ngrok-free.app
   ```
   Example:
   ```env
   GROQ_API_KEY=gsk_xxxx
   D_ID_API_KEY=your_d_id_key
   BASE_URL=https://1234-56-78-90.ngrok-free.app
   ```
3. Save the file.

### Step 2.4: Restart the server

1. In the terminal where `npm start` is running, press **Ctrl+C** to stop the server.
2. Run again:
   ```bash
   npm start
   ```
3. Make sure ngrok is **still** running in the other terminal (so `BASE_URL` is valid).

### Step 2.5: Generate a lesson with lip-sync

1. In the browser, go to http://localhost:3000.
2. Click **“Generate lesson”**.
3. In the server terminal you should see: **“Creating lip-sync talking head (D-ID)…”**
4. Wait. D-ID will fetch your pharaoh image and audio from the ngrok URL, then create the talking-head video.
5. When it’s done, the page will show **“Video ready.”** and the video will be the **lip-synced** pharaoh.

**Tip:** D-ID works best when **`assets/pharaoh.png`** is a clear **face or bust** (head and shoulders), not a full-body small figure.

---

## Quick reference

| What you want              | What to do |
|---------------------------|------------|
| Run the app               | `npm install` then `npm start`, open http://localhost:3000 |
| Change lesson content     | Edit `lesson.txt`, then Generate lesson |
| Change teaching style     | Edit `teaching_prompts.txt`, then Generate lesson |
| Show pharaoh in video     | Put `pharaoh.png` in `assets` folder |
| Lip-sync (lips move)     | Add `D_ID_API_KEY` and `BASE_URL` (ngrok) to `.env`, restart server, keep ngrok running |

---

## If something goes wrong

- **“Missing GROQ_API_KEY”**  
  Add `GROQ_API_KEY=...` to `.env` and restart the server.

- **“Network error” / “Cannot reach Groq”**  
  Check internet and firewall; try again.

- **“Edge TTS failed”**  
  Normal. The app will use Google TTS instead; the video will still be created.

- **“D-ID … error” or “invalid actor url”**  
  Make sure ngrok is running, `BASE_URL` in `.env` is the **HTTPS** ngrok URL (no trailing slash), and the server was restarted after changing `.env`.

- **Video not found / 404**  
  Generate the lesson again and wait until you see “Video ready.”

If you tell me the exact message you see (browser or terminal), I can give the next step for that error.
