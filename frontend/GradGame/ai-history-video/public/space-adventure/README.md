# Space Adventure

## Videos

**There are no video files in this app.** Each planet scene includes a **Sora text prompt** you copy into OpenAI Sora to generate that clip yourself.

- Prompts live in `js/config.js` (`soraPrompt` per scene).
- The same text is listed in **`SORA_PROMPTS.md`** for easy reading outside the browser.

## Flow

1. Open a scene → read/copy the Sora prompt → generate your MP4 in Sora (outside this app).
2. Tap **Continue lesson** to unlock the quiz / rocket puzzle / constellation (when that scene has one).
3. Tap **Next scene** when you are done with the activities.

## Files

- `js/SoraPromptPanel.js` — shows prompt + Copy + Continue
- `js/config.js` — scene list + prompts
- `js/SceneManager.js` — scene flow (no `VideoPlayer`)
