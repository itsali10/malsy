# Next steps after ngrok is installed

Do these in order.

---

## Step 1: Point ngrok to port 3000 (where your app runs)

Your app runs on **port 3000**, but ngrok was started with **port 80**.

1. In the terminal where ngrok is running, press **Ctrl+C** to stop it.
2. Start ngrok again for port **3000**:
   ```bash
   ngrok http 3000
   ```
3. In the ngrok window you’ll see a line like:
   ```text
   Forwarding   https://something.ngrok-free.dev -> http://localhost:3000
   ```
4. Copy that **https://...** URL (e.g. `https://epistemological-martin-gripingly.ngrok-free.dev` or a new one if it changed).

---

## Step 2: Put that URL in `.env` as BASE_URL

1. Open the file **`.env`** in your project folder.
2. Find the line: `BASE_URL=...`
3. Set it to the ngrok URL **with no slash at the end**:
   ```env
   BASE_URL=https://epistemological-martin-gripingly.ngrok-free.dev
   ```
   (If ngrok showed a different URL in Step 1, use that one instead.)
4. Save the file.

---

## Step 3: Start your app (if it’s not running)

1. Open a **new** terminal (leave ngrok running in the other one).
2. Go to your project folder:
   ```bash
   cd C:\Users\LENOVO\OneDrive\Desktop\ai-history-video
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. You should see: `History video API running at http://localhost:3000`
5. Leave this terminal open.

---

## Step 4: Generate a lesson with lip-sync

1. Open your browser and go to: **http://localhost:3000**
2. Click **“Generate lesson”**.
3. In the **server** terminal (where `npm start` is running) you should see:
   - “Generating pharaoh teacher script (Groq)...”
   - “Generating pharaoh voice...”
   - **“Creating lip-sync talking head (D-ID)…”**  ← this means D-ID is being used
4. Wait a few minutes. When it’s done you’ll see **“Video ready.”** and the video will have the pharaoh’s lips moving with the voice.

---

## Summary

| Terminal 1        | Terminal 2   | Browser              |
|-------------------|-------------|----------------------|
| `ngrok http 3000` (leave running) | `npm start` (leave running) | http://localhost:3000 → Generate lesson |

**Important:** Keep **both** ngrok and the server running while you generate. If you close ngrok, D-ID won’t be able to reach your app and lip-sync will fail.
