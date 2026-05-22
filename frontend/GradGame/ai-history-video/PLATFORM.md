# Using the history video API in your virtual school platform

When your app is the **platform** (web or mobile), the video is generated on the server and played inside your app. Here’s how it works.

## 1. Start the API server

From this project folder:

```bash
npm install
npm run start
```

The API runs at **http://localhost:3000** (or set `PORT` in `.env`).

---

## 2. Flow from your application

### Step 1: Start generation

Your app sends the lesson content (from your textbook or DB) to the API:

**Option A – Send lesson text (recommended)**  
e.g. when the user opens “History – Ancient Egypt” and you have the text in your app:

```http
POST http://localhost:3000/api/generate
Content-Type: application/json

{
  "lessonText": "Ancient Egypt was one of the greatest civilizations..."
}
```

**Option B – Send path to a lesson file**  
e.g. if the server has access to lesson files:

```http
POST http://localhost:3000/api/generate
Content-Type: application/json

{
  "lessonPath": "./lessons/ancient-egypt.txt"
}
```

**Response (immediate):**

```json
{ "jobId": "job_1739123456789" }
```

Generation runs in the background. The request returns right away.

---

### Step 2: Poll until the video is ready

Your app polls until `status` is `completed`:

```http
GET http://localhost:3000/api/status/job_1739123456789
```

**While generating:**

```json
{ "status": "generating" }
```

**When done:**

```json
{
  "status": "completed",
  "videoUrl": "/api/video/job_1739123456789.mp4"
}
```

**If it failed:**

```json
{
  "status": "failed",
  "error": "Error message from the server"
}
```

Poll every 10–30 seconds until `status` is `completed` or `failed`.

---

### Step 3: Play the video in your app

When `status === "completed"`, use `videoUrl` as the source for your video player.

**Full URL** (if your app is on the same host as the API):

```
http://localhost:3000/api/video/job_1739123456789.mp4
```

**In HTML:**

```html
<video src="http://localhost:3000/api/video/job_1739123456789.mp4" controls></video>
```

**In React (example):**

```jsx
const [videoUrl, setVideoUrl] = useState(null);

// After polling and getting status.completed:
setVideoUrl(`http://localhost:3000${data.videoUrl}`);

return (
  <video src={videoUrl} controls />
);
```

Your platform UI can show a “Generating…” state while polling, then switch to the `<video>` when `videoUrl` is available.

---

## Summary

| Step | Your app does | API |
|------|----------------|-----|
| 1 | `POST /api/generate` with `lessonText` or `lessonPath` | Returns `jobId`, starts generation in background |
| 2 | `GET /api/status/:jobId` every 10–30 s | Returns `generating` → then `completed` + `videoUrl` (or `failed` + `error`) |
| 3 | Use `videoUrl` in `<video src="...">` or your player | `GET /api/video/:filename` streams the MP4 |

So: **generation runs on the platform (this server), and the video is generated and then played inside your application** via the status and video URLs.
