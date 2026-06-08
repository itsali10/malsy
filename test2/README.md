## Avatar Face Control (Three.js + FastAPI)

### 1) Start FastAPI backend

From `ai_teacher/backend`:

```bash
uvicorn app.main:app --reload --port 8000
```

### 2) Start a static web server in this folder

From `test2`:

```bash
python -m http.server 5500
```

Open:

[http://127.0.0.1:5500](http://127.0.0.1:5500)

### 3) Use controls

- `Speak (TTS + Lip Sync)` calls:
  - `POST /tts`
  - `POST /avatar/lipsync/prepare`
- `Talk ON/OFF` enables/disables mouth animation
- `Smile`, `Blink`, and emotion buttons drive face morph targets

### 4) Important

This uses automatic regex matching against shape key names.  
For best results in Blender, use names containing words like:

- `smile`
- `blink`
- `mouthOpen` or `jawOpen`
- `browUp`, `browDown`
- `sad`, `angry`, `surprised`
# test2 — Ready Player Me avatar, Unity WebGL, simple lip sync

This folder is **not** a full Unity project. Create a Unity project on your machine, install the Ready Player Me SDK, then copy `Assets/Scripts` into that project (or symlink it).

## 1. Create the avatar (Ready Player Me)

1. Open [Ready Player Me](https://readyplayer.me/) and sign in.
2. Create an avatar and finish the flow until you get a **.glb** link or download.
3. For lip sync, the model needs **blendshapes**. When using a URL, append morph targets (use `%20` for the space in `Oculus Visemes` if needed):

   `?morphTargets=ARKit,Oculus%20Visemes`

   Example: `https://models.readyplayer.me/<your-id>.glb?morphTargets=ARKit,Oculus%20Visemes`

4. In RPM Studio / developer settings, note your **app subdomain** — the Unity SDK will ask for it.

## 2. New Unity project + WebGL module

1. Unity **2022.3 LTS** (or newer LTS) is a safe default.
2. **File → Build Settings / Build Profiles** → install the **WebGL** module if needed.
3. **Player Settings → WebGL**:
   - **Compression**: Gzip or Brotli is fine; your host must serve the correct `Content-Encoding` for compressed builds.
   - For loading **audio from your FastAPI URL**, the API (or reverse proxy) must send **CORS** headers for the **origin** of the page that embeds the build (e.g. `Access-Control-Allow-Origin`).

## 3. Install Ready Player Me Unity SDK

1. **Window → Package Manager → + → Add package from git URL…**
2. Enter: `https://github.com/readyplayerme/rpm-unity-sdk-core.git`
3. Follow the RPM setup wizard from: [Ready Player Me — Unity SDK](https://docs.readyplayer.me/ready-player-me/integration-guides/unity-sdk).

Bring the avatar in using their **Quick Start** / loader, or import your `.glb` per their guide. After import you should see a **SkinnedMeshRenderer** on the head/face with blendshapes such as `jawOpen`.

## 4. Add scripts from this repo

Copy `test2/Assets/Scripts` into your Unity project’s `Assets` folder.

1. Create an empty GameObject named **`AvatarBridge`** (this name is what `SendMessage` uses from JavaScript).
2. Add **Audio Source**, **WebGlAudioUrlPlayer**, and **RpmAmplitudeLipSync**.
3. Assign **Face Mesh** on `RpmAmplitudeLipSync` if auto-find picks the wrong renderer (use the mesh that has `jawOpen` / viseme shapes).
4. Tune **Multiplier** and **Smoothing** on `RpmAmplitudeLipSync` so the mouth opens enough without jitter.

**Lip sync:** `RpmAmplitudeLipSync` maps **amplitude → one blendshape** (default `jawOpen`). It is **WebGL-safe** (no native lip-sync plugin). For higher quality you would drive Oculus visemes from timestamps or use a third-party solution that supports WebGL.

## 5. Scene

- **Camera** aimed at the avatar; **light** as needed.
- Optional: floor plane.

## 6. Build WebGL

1. **File → Build Settings → WebGL → Switch Platform**.
2. Output folder e.g. `Builds/WebGL`.
3. **Build**. You can drop that folder into your Node dashboard project later.

## 7. Later: `SendMessage` from the host page

After `createUnityInstance(...)` resolves:

```js
gameInstance.SendMessage('AvatarBridge', 'PlayAudioFromUrl', audioUrlString);
gameInstance.SendMessage('AvatarBridge', 'StopPlaybackFromWeb', '');
```

In the Editor you can call `PlayAudioFromUrl` from a tiny test script or the inspector via a custom editor — or temporarily use a public URL in `Start()` for smoke tests.
