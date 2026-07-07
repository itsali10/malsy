# MALSY Project Technical Documentation

**Subtitle:** MALSY — AI-Powered Online Learning Platform: Interactive E-School Platform for Homeschooling with Avatar-Based Learning
**Document purpose:** Technical foundation for Chapters 3–4 (System Analysis/Design, Implementation) of the graduation thesis, with supporting material for Chapters 1, 2, 5, 6, 7, 8 and the Appendices.
**Scope of analysis:** Full repository at `c:\Users\Linaa\malsy-1` — backend (`backend/`), the active student/admin frontend (`malsy-ui/`), a legacy/parallel frontend (`frontend/`), and an avatar/Unity-WebGL prototype (`test2/`).

> **Methodology note.** Every claim below is grounded in the actual source files (exact paths, functions, classes, routes are cited). Where the code does not support a claim, this document says so explicitly under a *Current status* / *Needed improvement* label instead of inferring intent. Section 24 lists everything that could not be determined from the code alone.

---

## 1. Project Overview

MALSY is a prototype **AI-powered e-schooling platform for homeschooling**, built for a Grade 6 curriculum spanning **English, Science, and History**. It combines:

- A **FastAPI backend** (`backend/`) that stores student/schedule data in PostgreSQL, ingests textbook PDFs into a **RAG (Retrieval-Augmented Generation) pipeline** backed by ChromaDB, and drives an LLM (OpenAI `gpt-3.5-turbo` by default) to teach lessons, generate quizzes, grade answers, and produce weekly/monthly evaluations.
- Two Next.js frontends: `malsy-ui/` (the actively-developed student + admin portal, port 3001) and `frontend/` (an earlier prototype, port 3000, kept for a set of gamified/space-themed features and an OpenAI-Sora video pipeline that were never ported forward).
- A **3D avatar teaching layer** ("Jassmine/Jasmine") rendered with Three.js, driven by TTS audio and a text/audio-hybrid lip-sync system.
- A **speech pipeline**: OpenAI Whisper for speech-to-text, a wav2vec2 phoneme model + eSpeak-ng for pronunciation scoring.
- An experimental **Unity/WebGL avatar-lab prototype** (`test2/`) that is mostly scaffolding today (see §18).

**Problem it addresses:** homeschooling parents need a structured, curriculum-locked, engaging substitute for a physical school day — a system that (a) tells the child what to study *today* rather than presenting an open buffet of content, (b) teaches from the actual textbook rather than generic AI answers, (c) gates progress behind mastery (quizzes) rather than passive video consumption, and (d) gives guardians visibility into progress. MALSY's answer is a scheduled, lesson-locked, AI-tutored, avatar-presented curriculum with an admin panel for content publishing and parent-facing notifications.

**Audience:** the primary user is a Grade 6 homeschooled student; the secondary user is the parent/guardian (attendance/notification records exist for them); the tertiary user is an administrator/teacher figure who uploads textbooks, approves AI-generated lesson plans, and monitors student progress through `malsy-ui/app/admin`.

---

## 2. Project Goals and Scope

To keep the thesis honest, every feature below is labeled:

- ✅ **Implemented & wired end-to-end** (backend + frontend, real data)
- 🟡 **Partially implemented** (backend real, frontend mock; or vice-versa; or prototype-quality)
- 🔵 **Prototype only** (exists in an isolated demo, not integrated into the main student flow)
- ⚪ **Planned / scaffolding only** (documented intent, little or no code)

| Feature | Status | Evidence |
|---|---|---|
| Student registration/login (JWT) | ✅ | `backend/app/routers/auth.py`, `malsy-ui/lib/auth.ts` |
| Randomized personal weekly timetable | ✅ | `backend/app/default_schedule.py` |
| Day-based lesson schedule with locking | ✅ | `backend/app/lesson_schedule_service.py`, `schedule_availability_service.py` |
| RAG-grounded AI lesson teaching (English/Science/History) | ✅ | `backend/app/lesson_graph.py`, `lesson_content_mapping.py`, `history_rag.py` |
| MCQ quiz generation + anti-hallucination answer resolution | ✅ | `lesson_graph.py::ensure_mcq_integrity` |
| Hint → hint → remediation ladder on wrong answers | ✅ | `lesson_graph.py::evaluate_answer` |
| Weekly/monthly exams | ✅ | `exam_engine.py` |
| Weekly/monthly evaluation summaries (rule-based, not LLM) | ✅ | `evaluation_engine.py` |
| Listening comprehension activities (English/History) | ✅ | `listening_generator.py`, `listening_store.py` |
| Pronunciation scoring (wav2vec2 + eSpeak + edit distance) | ✅ (backend) / 🟡 (frontend wiring — two disconnected implementations) | `pronunciation_api.py`; `malsy-ui/components/PronunciationRecorder.tsx` vs `app/lessons/pronunciation/page.tsx` |
| Speech-to-text (OpenAI Whisper) | ✅ (backend) | `speech_api.py` |
| Text-to-speech (OpenAI TTS / offline Piper / Coqui XTTS) | ✅ | `tts_api.py`, `local_tts.py` |
| 3D avatar with lip sync | ✅ | `malsy-ui/components/AvatarWidget.tsx`, `lib/lesson-audio.ts`, `lib/viseme-lipsync.ts` |
| Admin book upload → structure extraction → RAG ingest → plan approval → publish pipeline | ✅ | `backend/app/routers/admin.py`, `malsy-ui/app/admin/books/**` |
| Admin lesson preview (same AI session, admin-only) | ✅ | `admin_preview_service.py`, `malsy-ui/app/admin/preview` |
| Student progress/grades dashboard for admin | ✅ | `admin_student_data.py` |
| Parent notifications | 🟡 | DB model + endpoints exist (`ParentNotification`, `routers/notifications.py`); no automated trigger found generating them from lesson events, and no guardian-facing UI exists in either frontend |
| Grade report / weighted semester grading | 🟡 | Fully implemented in the **legacy** `frontend/app/grades` (client-side calculator); **absent** in `malsy-ui` (only a "quiz average" stat, no page) |
| Badges / achievements | 🟡 | `malsy-ui/lib/studentAchievements.ts` computes real badges from API data, but streak-increment call site was not found wired to lesson completion |
| Leaderboard | 🔵 | 100% hardcoded mock data, `malsy-ui/app/challenges/page.tsx` |
| Games (Hangman, Spelling Bee) | 🟡 (legacy) / 🔵 (malsy-ui) | Legacy `frontend/app/games/**` is a real, playable, scored implementation; `malsy-ui`'s versions in `app/challenges` are also playable but disconnected from the backend, hardcoded word lists |
| Space-themed gamified lessons, virtual-school hub, OpenAI/Sora video generation | 🔵 | Only in legacy `frontend/` (`app/space-adventure`, `app/space-learn`, `app/virtual-school`); not present in `malsy-ui` at all |
| Virtual chemistry lab (2D simulation) | 🟡 | Fully implemented, non-3D, in legacy `frontend/app/lab`; `malsy-ui/app/lab` has its own separate implementation (not compared line-by-line here, see §18) |
| Unity/WebGL avatar + virtual lab | ⚪ | `test2/` contains only the stock Oculus/Meta LipSync **Unity SDK package** (vendor code) — no MALSY-specific Unity project, no `AvatarBridge`/`WebGlAudioUrlPlayer`/`RpmAmplitudeLipSync` scripts exist despite being documented in `test2/README.md` |
| Browser (Three.js) avatar + TTS + lipsync prototype, backend-connected | 🟡 | `test2/app.js` + `index.html` genuinely call live `/tts` and `/avatar/lipsync/prepare` endpoints, but it is a standalone HTML demo, not integrated into either Next.js frontend |
| Rhubarb Lip Sync | ⚪ (does not exist) | Confirmed absent from the entire backend by exhaustive search |
| Multi-student concurrency | ⚪ | `backend/app/main.py` keeps a **single global in-memory** `ACTIVE_SESSION`; code explicitly says *"This server is in single-student mode"* |

---

## 3. Full Project Structure

### 3.1 Top-level tree

```
malsy-1/
├── backend/                     # FastAPI + PostgreSQL + ChromaDB (Python) — the AI/API server
│   ├── app/
│   │   ├── main.py              # App entrypoint: session/exam/avatar/websocket routes, router mounting
│   │   ├── models.py            # SQLAlchemy ORM models (relational schema)
│   │   ├── schemas.py           # Pydantic request/response models
│   │   ├── database.py / db.py  # Postgres async engine + ChromaDB client
│   │   ├── db_migrations.py     # Idempotent ALTER TABLE patches run at startup
│   │   ├── auth.py / admin_auth.py   # JWT auth (students) / fixed-credential admin auth
│   │   ├── storage.py           # Generic JSON-file read/write helper (the "NoSQL" layer)
│   │   ├── llm.py / embeddings.py    # OpenAI ChatOpenAI + OpenAIEmbeddings factories
│   │   ├── ingest_books.py, chapter_split.py, book_sections.py, unit_detection.py
│   │   ├── lesson_graph.py      # LangGraph-based teach/quiz/evaluate state machine (core RAG logic)
│   │   ├── lesson_content_mapping.py  # Lesson→chunk scoping & retrieval-safety validation
│   │   ├── lesson_planner.py, canonical_plan_store.py, unit_plan_store.py, plan_deduplication.py
│   │   ├── session_engine.py, session_config.py   # Progress cursor + lesson unlock state machine
│   │   ├── history_rag.py, history_lessons.py, history_segmentation.py, history_interactive_images.py
│   │   ├── english_book_curriculum.py, english_section_segmentation.py, language_lesson_sections.py*
│   │   ├── exam_engine.py, exam_store.py, evaluation_engine.py, evaluation_store.py
│   │   ├── listening_generator.py, listening_store.py
│   │   ├── pronunciation_api.py, speech_api.py, tts_api.py, local_tts.py, avatar_lipsync.py
│   │   ├── default_schedule.py, weekly_schedule_planner.py, lesson_schedule_service.py,
│   │   │   schedule_availability_service.py, schedule_sync_service.py, timetable_service.py
│   │   ├── subject_registry.py, book_registry.py, book_processing_service.py, book_debug.py,
│   │   │   book_lesson_counts.py, book_lessons_catalog.py, lesson_catalog_service.py
│   │   ├── student_portal_service.py, student_resume_service.py, student_timeline_store.py,
│   │   │   active_session_store.py, progress_store.py
│   │   ├── admin_lesson_content.py, admin_preview_service.py, admin_student_data.py, portal_curriculum.py
│   │   ├── prompts.py, teacher_prompt_pack.py    # LLM prompt templates
│   │   └── routers/             # auth, users, subjects, schedules, enrollments, attendance,
│   │                              quiz, evaluations, labs, notifications, dashboard, portal, admin
│   ├── migrations/               # Hand-written SQL (001–003), documentation of schema evolution
│   ├── data/                     # JSON-file "database" + generated media (see §15)
│   ├── chroma_db/                # ChromaDB persistent vector store (2 collections)
│   ├── requirements.txt, requirements-offline-tts.txt
│   └── .env                      # DATABASE_URL, OPENAI_API_KEY, SECRET_KEY, etc. (gitignored)
│
├── malsy-ui/                     # ACTIVE Next.js 14 frontend (student + admin), port 3001
│   ├── app/
│   │   ├── page.tsx               # Student dashboard
│   │   ├── login/, profile/, settings/, schedule/, lessons/, challenges/, leaderboard/, inbox/, lab/
│   │   ├── admin/                 # Admin dashboard, analytics, books, lessons, students, login, preview
│   │   └── api/                   # Next.js BFF routes (Sora video jobs, interactive images proxy)
│   ├── components/                # AvatarWidget, ClientShell, Sidebar, lesson/, admin/, student/, ui/
│   ├── hooks/useLessonAudioPlayer.ts
│   ├── lib/                       # api.ts, admin-api.ts, auth.ts, admin-auth.ts, supabase-storage.ts,
│   │                                studentPortalSubjects.ts, studentSchedule.ts, lessonProgress.ts, …
│   ├── scripts/                   # screenshot-avatar.{cjs,mjs} (dev tooling)
│   ├── public/, styles/, output/lesson-videos/
│   └── package.json               # next 14.2.35, @supabase/supabase-js, framer-motion, three
│
├── frontend/                      # LEGACY Next.js 14 frontend ("malsy-next"), port 3000
│   ├── app/  (dashboard, login, subject/[slug], games/{hangman,spelling-bee}, grades, lab,
│   │          space-adventure, space-learn, virtual-school, api/{generate*, history-lesson, status, video})
│   ├── components/space-learn/    # Separate space-themed level map, quiz, hangman, video player
│   ├── core/, lib/, models/, utils/   # localStorage "database", grade calculator, learning config
│   └── package.json               # next 14.2.35, openai, three
│
├── test2/                         # Avatar / Unity-WebGL prototype (NOT a buildable Unity project)
│   ├── index.html, app.js, teachingAnimations.js, avatar.glb   # working Three.js browser demo
│   ├── Oculus/LipSync/            # Stock Meta/Oculus LipSync Unity SDK package (vendor code only)
│   └── README.md                  # Documents a planned Unity WebGL build that does not exist yet
│
├── logos/                         # Static brand image assets
├── test.py                        # Standalone dev script: mic capture + wav2vec2 phoneme test (scratch)
└── .claude/, .vscode/             # Editor/tooling configuration (not part of the app)
```
`*` `language_lesson_sections.py` is referenced throughout the backend (four-section English navigation, part-index clamping) — present in `backend/app/` alongside the modules above.

### 3.2 Detailed explanations (by subsystem)

#### Backend — core app wiring
- **`backend/app/main.py`** (1729 lines) — the FastAPI application object, CORS middleware (`allow_origins=["*"]`), global exception handlers (`IntegrityError`, `SQLAlchemyError`, `ValidationError`, generic `Exception`), the `lifespan` startup hook (connects to Postgres, runs `Base.metadata.create_all` + `apply_schema_patches`, syncs the book registry from disk), and directly defines: session endpoints (`/session/start`, `/session/answer`, `/session/next_unit`, `/session/continue_part2`, `/session/switch_part`), exam endpoints, evaluation endpoints, avatar-lipsync endpoints, and a WebSocket endpoint `/ws/teacher` for a Unity-style streaming client. It also mounts every `routers/*.py` router and the standalone `tts_router`/`speech_router`/`pronunciation_router`. **Used by:** every part of the system that talks to the backend (both frontends, `test2/app.js`). **Connects to:** virtually every other backend module via direct imports.
- **`models.py`** / **`schemas.py`** — see §15 for the full schema. Frontend/backend contract layer.
- **`database.py`** — async SQLAlchemy engine (`create_async_engine(DATABASE_URL)`, pool size 5). **`db.py`** — `chromadb.PersistentClient(path="chroma_db")` + `get_or_create_collection`. Two separate persistence backends live side by side in this one file pair.
- **`db_migrations.py`** — `apply_schema_patches(conn)`, run at every boot, does 3 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements matching migrations 002/003 (see §15.3); migration 001 (guardian rename) is a one-time manual script, not replayed automatically.
- **`storage.py`** — `load_json(name, default)` / `save_json(name, obj)`: the entire non-relational "database" is just files under `backend/data/`, read/written with plain `json.load`/`json.dump`. No locking, no transactions — last write wins.
- **`auth.py`** — bcrypt password hashing, JWT (`python-jose`) issuance/verification, `get_current_user` (any active DB user), `require_admin` (DB user with `role=="admin"`). **`admin_auth.py`** — a **second, parallel** admin auth system: fixed username/password from env (default `admin`/`12345`), issues a JWT with `sub="malsy-fixed-admin"`, and `require_admin_access` accepts *either* that fixed token *or* a real DB admin user (constructing an in-memory, non-persisted `User` object for the fixed-token case, with a hardcoded all-zero UUID).

#### Backend — AI Teacher / RAG pipeline (see §9 for full detail)
- **`ingest_books.py`** — PDF → text → chunk → embed → ChromaDB. **`chapter_split.py`**, **`unit_detection.py`**, **`book_sections.py`** — structure/section detection at ingestion and admin-review time.
- **`llm.py`** / **`embeddings.py`** — `get_teacher_llm()` (`ChatOpenAI`, `gpt-3.5-turbo` default, temperature 0.4) and `get_embedder()` (`OpenAIEmbeddings`, `text-embedding-3-small`).
- **`lesson_graph.py`** (the heart of the AI teacher) — LangGraph state machine (`LessonState` TypedDict) implementing `teach_item`, `make_quiz`, `ensure_mcq_integrity`, `evaluate_answer`, `coverage_guard`.
- **`lesson_content_mapping.py`** — lesson→Chroma-chunk-id mapping store + retrieval-scoping/validation (prevents content bleeding between lessons).
- **`history_rag.py`**, **`history_lessons.py`**, **`history_segmentation.py`**, **`history_interactive_images.py`** — History-subject-specific strict RAG + topic-ownership + AI-generated interactive images.
- **`english_book_curriculum.py`**, **`english_section_segmentation.py`** — English-subject-specific section (Reading/Grammar/Listening/Pronunciation) detection and curriculum views.
- **`lesson_planner.py`**, **`canonical_plan_store.py`**, **`unit_plan_store.py`**, **`plan_deduplication.py`** — unit/lesson plan generation, admin-approved canonical plans, per-student plan caching, near-duplicate item removal.
- **`session_engine.py`**, **`session_config.py`** — progress cursor + book-level lesson unlock state machine (see §8, §14).
- **`exam_engine.py`**, **`exam_store.py`**, **`evaluation_engine.py`**, **`evaluation_store.py`** — weekly/monthly exam generation & grading; rule-based evaluation summaries.
- **`listening_generator.py`**, **`listening_store.py`** — LLM-generated, cached listening-comprehension activities.
- **`prompts.py`**, **`teacher_prompt_pack.py`** — all prompt string constants (the latter is an alternate, currently-unused "guided" generation pipeline — dead code kept in the tree).

#### Backend — speech/avatar
- **`pronunciation_api.py`** — wav2vec2 phoneme CTC model + eSpeak-ng + Levenshtein scoring (`/speech/pronunciation`).
- **`speech_api.py`** — OpenAI Whisper STT (`/speech/transcribe`).
- **`tts_api.py`**, **`local_tts.py`** — OpenAI TTS (default) or offline Piper/Coqui XTTS (`/tts`).
- **`avatar_lipsync.py`** — character-based heuristic viseme timeline generator + QA harness (`/avatar/lipsync/*`).

#### Backend — schedule/curriculum/admin (see §14, §17)
- **`default_schedule.py`**, **`weekly_schedule_planner.py`**, **`lesson_schedule_service.py`**, **`schedule_availability_service.py`**, **`schedule_sync_service.py`**, **`timetable_service.py`** — personal-timetable generation, weekly lesson-instance assembly, unlock-chain computation, "today" override logic.
- **`subject_registry.py`**, **`book_registry.py`**, **`book_processing_service.py`**, **`book_lesson_counts.py`**, **`book_lessons_catalog.py`**, **`lesson_catalog_service.py`** — JSON-file-backed registries of subjects/books/lessons and the facades that unify them for student/admin views.
- **`student_portal_service.py`**, **`student_resume_service.py`**, **`student_timeline_store.py`**, **`active_session_store.py`**, **`progress_store.py`** — student-facing aggregation + fine-grained progress state.
- **`admin_lesson_content.py`**, **`admin_preview_service.py`**, **`admin_student_data.py`**, **`portal_curriculum.py`** — admin read-only content views, admin lesson preview (reuses `lesson_graph`), admin student-overview aggregation.
- **`routers/`** — one file per REST resource; see §16 for the full endpoint table.

#### `malsy-ui/` (active frontend)
- **`app/page.tsx`** — student dashboard: continue-learning, weekly schedule widget, subjects, achievements.
- **`app/schedule/page.tsx`** — 7-day timetable UI, entirely server-driven lock state.
- **`app/lessons/**`** — subject hub, subject detail, `learn/page.tsx` (the actual AI session UI), a **standalone, backend-disconnected** `pronunciation/page.tsx` prototype.
- **`app/challenges/page.tsx`** — Hangman + Spelling Bee (client-only) plus a **hardcoded** leaderboard.
- **`app/admin/**`** — the most complete part of the app: dashboard, analytics, book pipeline, lesson preview/publish, student management, subject CRUD.
- **`components/AvatarWidget.tsx`** — Three.js avatar renderer with real-time morph-target lip sync.
- **`lib/api.ts`** / **`lib/admin-api.ts`** — typed fetch wrappers over every backend endpoint used by the frontend.
- **`lib/supabase-storage.ts`** — the *only* Supabase usage in the whole project: object storage for AI-generated lesson videos/images (buckets `lesson-videos`, `lesson-images`). **Supabase is not used as a database or for auth anywhere in this codebase.**

#### `frontend/` (legacy)
- Independent `localStorage`-backed mock database (`lib/database.ts`) is the actual source of truth for login/progress/game-scores; FastAPI backend calls are made "best-effort" (errors are swallowed).
- Unique, not-yet-ported features: `app/games/{hangman,spelling-bee}`, `app/grades` (full weighted grade calculator), `app/space-adventure`, `app/space-learn`, `app/virtual-school`, and a direct OpenAI/Sora video-generation pipeline (`lib/video-generator.ts`).
- `app/lab/page.tsx` — a fully implemented flat 2D chemistry-lab simulation (equipment catalog, chemical mixer with a reaction lookup table, pH tester, safety quiz) with **no 3D/avatar content whatsoever**.

#### `test2/` (avatar/Unity prototype)
- `app.js`/`index.html`/`teachingAnimations.js` — a genuine, working **Three.js browser demo** (not Unity) that loads `avatar.glb`, auto-rigs bones/morph targets, and calls the **real, live** backend endpoints `POST /tts` and `POST /avatar/lipsync/prepare` (verified to match `tts_api.py` and `main.py` exactly) plus `POST /session/start`.
- `Oculus/LipSync/` — the unmodified, vendor-supplied Meta/Oculus Lip Sync **Unity SDK package** — not MALSY-specific code.
- The README's promised `Assets/Scripts/{AvatarBridge, WebGlAudioUrlPlayer, RpmAmplitudeLipSync}.cs` **do not exist anywhere in the repository** — they are documentation of future work, not implemented scripts.

---

## 4. System Architecture

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        UI["malsy-ui (Next.js 14, port 3001)\nStudent portal + Admin portal"]
        Legacy["frontend (Next.js 14, port 3000)\nLegacy: games, grades, space content"]
        Avatar3D["test2 (Three.js browser demo)\nStandalone avatar prototype"]
    end

    subgraph API["Backend/API Layer — FastAPI (backend/app/main.py)"]
        Auth["Auth (JWT, bcrypt)\nauth.py / admin_auth.py"]
        Routers["REST Routers\nauth, users, subjects, schedules,\nenrollments, attendance, quiz,\nevaluations, labs, notifications,\ndashboard, portal, admin"]
        Session["Session/Exam/Avatar endpoints\n(defined directly in main.py)"]
        WS["WebSocket /ws/teacher"]
    end

    subgraph AI["AI / RAG Layer"]
        Graph["lesson_graph.py (LangGraph)\nteach_item / make_quiz / evaluate_answer"]
        Mapping["lesson_content_mapping.py\nlesson-scoped retrieval + validation"]
        LLM["llm.py -> OpenAI ChatOpenAI\n(gpt-3.5-turbo, temp 0.4)"]
        Embed["embeddings.py -> OpenAI\ntext-embedding-3-small"]
    end

    subgraph Speech["Speech / Avatar Layer"]
        STT["speech_api.py\nOpenAI Whisper"]
        Pron["pronunciation_api.py\nwav2vec2 + eSpeak-ng + Levenshtein"]
        TTS["tts_api.py / local_tts.py\nOpenAI TTS or Piper/Coqui"]
        Lip["avatar_lipsync.py\nheuristic viseme timeline"]
    end

    subgraph Storage["Storage Layer"]
        PG[("PostgreSQL\nusers, schedules, attendance,\nevaluations, labs, notifications")]
        Chroma[("ChromaDB (local persistent)\npdf_chunks, units collections")]
        JSONFiles[("backend/data/*.json\nprogress, plans, exams,\nregistries, active session")]
        Supabase[("Supabase Storage\nlesson videos / images only")]
    end

    UI -->|JWT bearer, REST| Routers
    UI -->|REST| Session
    Legacy -->|best-effort REST\n+ direct OpenAI/Sora calls| Routers
    Avatar3D -->|REST| Session
    Avatar3D -->|REST| TTS
    Avatar3D -->|REST| Lip

    Routers --> Auth
    Session --> Graph
    Graph --> Mapping
    Mapping --> Chroma
    Graph --> LLM
    Mapping --> Embed
    Session --> Pron
    Routers --> PG
    Session --> JSONFiles
    Graph --> JSONFiles
    Routers --> JSONFiles
    UI -.->|object storage only| Supabase
```

**Data flow, narratively:**

1. **Frontend → Backend:** `malsy-ui` attaches `Authorization: Bearer <JWT>` (from `localStorage`) to every request via `lib/api.ts`; the legacy `frontend` does the same but tolerates backend failures silently.
2. **Backend → PostgreSQL:** identity, schedule, enrollment, attendance, quiz-attempt, lesson-evaluation, lab-experiment, and parent-notification data — via async SQLAlchemy.
3. **Backend → JSON files:** all AI-teacher/RAG *runtime* state (per-student progress cursors, unit plans, exams, evaluation summaries, book/subject registries, the single active in-memory session) — via `storage.py`.
4. **Backend → ChromaDB:** textbook chunks and unit metadata, queried by `lesson_graph.py`/`lesson_content_mapping.py`/`history_rag.py` at lesson-teaching and exam-generation time.
5. **Backend → OpenAI:** three separate uses — (a) chat completions for teaching/quiz/eval text (`llm.py`), (b) embeddings for RAG (`embeddings.py`), (c) Whisper STT and TTS audio synthesis (`speech_api.py`, `tts_api.py`).
6. **Backend → Supabase:** none. **`malsy-ui`'s Next.js API routes → Supabase Storage:** generated lesson videos/images only (object storage, not a database).

---

## 5. Main User Workflow

Concretely, tracing the student's day through **`malsy-ui`** (the active frontend) and the backend functions each step calls:

1. **Register/Login** — `malsy-ui/app/login/page.tsx` → `api.auth.register`/`api.auth.login` → `POST /auth/register` / `POST /auth/login` (`backend/app/routers/auth.py::register`/`login`). Registration immediately calls `create_random_schedule_for_student` (16-slot personal timetable) and `generate_lesson_schedule_for_student` (first week's lesson instances). Login re-runs `ensure_current_week_schedule` so a student who registered days ago always has an up-to-date week.
2. **Open dashboard** — `malsy-ui/app/page.tsx` calls `api.auth.me()`, `api.dashboard.continueLearning()` (`GET /dashboard/continue-learning`), `usePortalSubjects()` (`GET /portal/subjects`), `useStudentWeekSchedule()` (`GET /dashboard/my-week`), and `api.evaluations.mine()`.
3. **View today's schedule** — `lib/studentJourney.ts::buildTodaysJourneyItems()` merges the week schedule (already server-locked per §14) into ordered current/upcoming/completed/locked cards.
4. **Access only unlocked/scheduled subjects** — `GET /dashboard/my-week` (`dashboard.py::my_week` → `lesson_schedule_service.fetch_student_weekly_schedule`) returns each session with a `status` field already computed server-side (`locked`/`available`/`completed`/`missed`); the frontend never computes this itself (§7, §14).
5. **Open subject** — `malsy-ui/app/lessons/subject/[subject]/page.tsx`, subject list from `GET /portal/subjects` (`student_portal_service.py::fetch_student_portal_subjects`).
6. **Open lesson** — `app/lessons/learn/page.tsx` calls `api.session.start(studentId, chapterId, ...)` → `POST /session/start` (`main.py::start_session`), which resolves the lesson mapping (`lesson_content_mapping.build_unit_for_teaching`), invokes `lesson_graph.invoke(...)`, and returns `teacher_text` + `quiz`.
7. **Complete activities** — the avatar (`AvatarWidget.tsx`) speaks `teacher_text` via `POST /tts`, lip-synced via `lib/lesson-audio.ts`; the student answers the quiz (`PremiumQuizPanel.tsx` → `api.session.answer(...)` → `POST /session/answer`, `main.py::answer`), which grades via `lesson_graph.evaluate_answer` — deterministic for MCQ (`grade_mcq_answer`), score-threshold for speaking (`pronunciation_api._score_sync`), LLM-graded for free text.
8. **Update progress** — a correct final answer triggers `session_engine.record_lesson_passed` (book-level unlock) and `lesson_schedule_service.mark_schedule_lesson_completed` (schedule-row completion + `_recompute_unlock_chain`), both invoked from inside `main.py::answer`.
9. **Take quiz/assessment** — in-lesson MCQs are graded immediately; separately, `POST /exam/weekly/start` / `POST /exam/monthly/start` (`exam_engine.py`) generate a larger mixed-format exam once enough units are completed (tracked via `student_timeline_store.py`).
10. **View grades/reports** — in `malsy-ui` this is only a dashboard "Quiz Average" stat and the Profile page's stat tiles, both from `GET /evaluations/me`; there is **no dedicated Grades page** in the active frontend (see §13). The legacy `frontend/app/grades` has a full weighted grade report but is a separate, unmerged codebase.
11. **Receive recommendations/feedback** — `evaluation_engine.weekly_evaluation`/`monthly_evaluation` return canned recommendation strings selected by score thresholds; these are surfaced inside the `/session/answer` response (`recommendations` key) and rendered inline in the lesson UI, not on a separate "recommendations" page.

```mermaid
sequenceDiagram
    actor Student
    participant UI as malsy-ui (Next.js)
    participant API as FastAPI backend
    participant Graph as lesson_graph (LangGraph)
    participant Chroma as ChromaDB
    participant OpenAI as OpenAI (Chat + TTS)
    participant PG as PostgreSQL

    Student->>UI: Login
    UI->>API: POST /auth/login
    API->>PG: verify user, issue JWT
    API-->>UI: access_token

    UI->>API: GET /dashboard/my-week
    API->>PG: read StudentLessonScheduleItem
    API->>API: schedule_availability_service (JSON progress)
    API-->>UI: week with status per session

    Student->>UI: Open today's lesson
    UI->>API: POST /session/start
    API->>Graph: invoke(teach_item)
    Graph->>Chroma: retrieve scoped chunks
    Graph->>OpenAI: chat completion (teach)
    API-->>UI: teacher_text + quiz

    UI->>API: POST /tts (speak teacher_text)
    API->>OpenAI: audio.speech.create
    API-->>UI: audio_url
    UI->>UI: AvatarWidget lip-syncs to audio

    Student->>UI: Submit quiz answer
    UI->>API: POST /session/answer
    API->>Graph: evaluate_answer (deterministic/LLM)
    API->>PG: mark_schedule_lesson_completed
    API-->>UI: correct/hint/remediation + recommendations
```

---

## 6. Authentication and Authorization

**Student auth (`backend/app/auth.py` + `routers/auth.py`):**
- `POST /auth/register` — creates a `User` row (`role="student"`), hashes password with `bcrypt`, then synchronously provisions a random personal timetable and first week's lesson schedule.
- `POST /auth/login` — verifies bcrypt hash, checks `account_status == "Active"`, updates `last_login`, and (for students) calls `ensure_current_week_schedule`. Issues a JWT: `create_access_token({"sub": str(user_id), "role": user.role})`, HS256, default 60-minute expiry (`ACCESS_TOKEN_EXPIRE_MINUTES` env, default 60).
- `GET /auth/me` — returns the current user from `get_current_user` (decodes JWT, loads the DB row, rejects if `account_status != "Active"`).
- Passwords stored as `password_hash` (bcrypt) — plaintext password is never persisted server-side.

**Admin auth (`backend/app/admin_auth.py`):** a **parallel, simpler** system:
- `POST /admin/login` — checks `username`/`password` against `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars, **defaulting to `admin`/`12345` if unset**. Issues a JWT with `sub="malsy-fixed-admin"`, 8× the normal expiry.
- `require_admin_access` accepts either this fixed token or a real DB user with `role=="admin"` — but the fixed-admin path constructs an **in-memory `User` object that is never persisted** (hardcoded `ADMIN_USER_ID = 00000000-0000-0000-0000-000000000001`), so admin actions are not attributable to a real row.
- **Inconsistency found:** `routers/attendance.py::POST /attendance` requires the *DB-only* `require_admin` dependency, not `require_admin_access` — an admin logged in only via the fixed-credential flow cannot record attendance through that one endpoint.

**Where users are stored:** PostgreSQL `users` table (see §15). **Where sessions/tokens are handled:** stateless JWT, no refresh tokens, no server-side session store, no logout/blacklist mechanism — a token is valid until expiry regardless of subsequent password changes or admin deactivation (deactivation is checked at token-verification time via `account_status`, mitigating this somewhat).

**Frontend token storage (`malsy-ui`):** `lib/auth.ts` stores `malsy_token`/`malsy_user` in `localStorage` (student) and `lib/admin-auth.ts` stores `malsy_admin_token`/`malsy_admin_user` (admin) — two separate namespaces. `lib/api.ts`'s request wrapper attaches the bearer token and, on `401`, clears storage and hard-redirects to `/login?expired=1`.

**Route protection:** `malsy-ui/components/ClientShell.tsx` is a **client-side-only** guard — it checks `localStorage` in a `useEffect` and redirects if missing. There is **no Next.js middleware or server-side session check**, so protected page code briefly loads before the redirect fires. The legacy `frontend` uses its own local `AuthGuard` over a `localStorage`-backed mock database (`lib/database.ts`) that is entirely independent of the FastAPI backend's user table — a student can exist in one system and not the other.

**Roles:** `User.role` is a plain string column (`"student"`/`"admin"`); no formal RBAC table, no permission granularity beyond the binary `require_admin`/`require_admin_access` checks.

**Current limitations / needed improvement for production:**
- Default admin credentials (`admin`/`12345`) and a placeholder JWT `SECRET_KEY` (`"change-me-before-deploying-to-production"`) will be used verbatim if `backend/.env` doesn't override them — a critical hardening item.
- No refresh tokens, no token revocation/blacklist, no rate-limiting on login attempts.
- CORS is `allow_origins=["*"]` with `allow_credentials=True` — should be restricted to known frontend origins.
- Client-side-only route guarding in `malsy-ui`; should be paired with server-side/middleware enforcement.
- Two entirely separate identity systems in the legacy `frontend` (localStorage mock DB vs. real backend) — a production system should have exactly one source of truth.
- No guardian/parent login exists at all (parent notifications are keyed by email only, fetched via a public, unauthenticated endpoint `GET /notifications/parent?guardian_email=...`).

```mermaid
flowchart LR
    A[Student submits email+password] --> B{POST /auth/login}
    B -->|bcrypt.checkpw match &\naccount_status=Active| C[create_access_token\nJWT: sub=user_id, role]
    B -->|mismatch| D[401 Unauthorized]
    C --> E[Frontend stores token\nin localStorage]
    E --> F[Every request:\nAuthorization: Bearer token]
    F --> G{get_current_user}
    G -->|valid + active| H[Route handler executes]
    G -->|invalid/expired/inactive| I[401 -> frontend clears\nstorage, redirects /login]
```

---

## 7. Dashboard Implementation

**Data loading (`malsy-ui/app/page.tsx`):** on mount, fetches `api.auth.me()`, `api.dashboard.continueLearning()`, `api.enrollments.mine()`, `api.evaluations.mine()`, plus two custom hooks: `usePortalSubjects()` (module-cached, refetched on window focus via `lib/studentPortalRefresh.ts`) and `useStudentWeekSchedule()`.

**Subject display:** subject cards come from `GET /portal/subjects` (`student_portal_service.fetch_student_portal_subjects`), the single canonical source also used by the Schedule and Lessons pages — described in-code as always API-backed so that admin publish/hide changes appear promptly.

**Progress calculation:** not computed client-side from raw data — the backend pre-computes it:
- Linear books (Science/History): `GET /books/{book_id}/lesson-progress?student_id=...` → `{max_unlocked_lesson_index, completed_lesson_numbers}` (from `session_engine.load_book_lesson_progress`); `malsy-ui/lib/lessonProgress.ts` derives `isLessonUnlocked`/`isLessonCompleted`/`getCurrentLessonNumber` purely from that response.
- Language subjects (English): four-section progress (`unit_part`/`max_unlocked_part`) returned directly by the session endpoints.

**Schedule locking on the dashboard:** identical mechanism to the Schedule page (§14) — `GET /dashboard/my-week` returns pre-locked sessions; the dashboard's "Today's Learning Journey" widget (`components/TodaysLearningJourney.tsx`, fed by `lib/studentJourney.ts::buildTodaysJourneyItems()`) merely renders the `status`/`lock_reason`/`action_label` fields it receives.

**Recommendations:** generated by `evaluation_engine.py` (rule-based, not LLM) and surfaced through the `/session/answer` response's `recommendations` field, not a dedicated dashboard endpoint — the dashboard itself does not display a distinct "recommendations" widget; this is a candidate gap for the thesis discussion.

**Avatar messages:** `lib/greeting.ts` selects a time-of-day/context-based greeting string shown near the avatar on the dashboard banner — this is a **client-side, rule-based** string selector (not an LLM call); the avatar's *lesson-time* speech, by contrast, is always real backend-generated `teacher_text` (§10).

**Key UI components/state:** `AvatarWidget` (dashboard variant), `AchievementsSection.tsx` (badge computation, §12), `TodaysLearningJourney.tsx`, `SubjectCard.tsx`, `TimetableCard.tsx`, `StatCard.tsx`. State is plain React hooks/`useState`/`useEffect` — no global state library (no Redux/Zustand); cross-page caching is done ad hoc via module-level variables in `lib/studentPortalSubjects.ts` and similar files.

---

## 8. Subject and Lesson System

**How subjects are defined:** a hybrid of a JSON "subject registry" (`subject_registry.py`, three built-ins — English, Science, History — plus admin-creatable custom subjects) and the relational `Subject` table (`models.py`) used for schedule/enrollment/attendance/lab foreign keys. `schedule_sync_service.registry_key_from_db_subject` reconciles the two naming spaces.

**How lessons are loaded:** each subject maps to a **primary book** per grade (`book_registry.get_primary_book`); a book's lesson catalog (`book_lessons_catalog.py`, `backend/data/books/{book_id}/lessons.json`) is the canonical list, exposed to the frontend via `GET /books/{book_id}/lessons`.

**Lesson locking/unlocking — book-level:** `session_engine.is_lesson_unlocked(student_id, book_id, lesson_number)` = `lesson_number - 1 <= max_unlocked_lesson_index`. Passing a lesson's final quiz calls `record_lesson_passed`, which does `max_unlocked_lesson_index = max(current, lesson_number)` — strictly monotonic, cannot regress.

**Lesson locking/unlocking — within a lesson (parts/sections):** `save_progress` tracks `unit_part` and `max_unlocked_part`, also monotonic (`max()`'d on every save). `language_lesson_sections.py` defines how many parts a book has (English: 4 sections; Science: 2 parts; History: exactly 1 "part" — no split at all).

**Completed lessons storage:** `session_engine`'s per-book JSON file (`progress_{student}_{book}.json`, `completed_lesson_numbers` list) **and** the relational `LessonEvaluation` row (`lesson_completed`, `overall_score`) **and** the schedule-row `StudentLessonScheduleItem.status="completed"` — three parallel records reconciled ad hoc by `admin_student_data._admin_schedule_status` for the admin view.

**Next lesson selection:** `GET /books/lesson-nav/{chapterId}` (`lesson_catalog_service.resolve_next_lesson`) is the authoritative source; `malsy-ui/lib/learning-config.ts` contains an explicitly-labeled **legacy fallback** hardcoded lesson map used only if that API is unavailable.

**Locked → Active → Completed, concretely:**
```mermaid
stateDiagram-v2
    [*] --> Locked: lesson_number > max_unlocked_lesson_index
    Locked --> Active: previous lesson's final quiz passed\n(record_lesson_passed advances max_unlocked_lesson_index)
    Active --> PartUnlocking: pass part/section quiz\n(max_unlocked_part = max(current, part+1))
    PartUnlocking --> Active: unit_part < last_part\n(more sections to teach)
    Active --> Completed: final section/part quiz passed\n(record_lesson_passed + mark_schedule_lesson_completed)
    Completed --> [*]
```

**Subject-specific differences:**

| | English | Science | History |
|---|---|---|---|
| Parts per lesson | 4 sections (Reading, Grammar, Listening, Pronunciation) | 2 (Theoretical / Practical) | 1 (no split) |
| Content segmentation | Regex heading detection into vocab/reading/grammar/listening/speaking/writing (`english_section_segmentation.py`) | Plain page-range split, no section typing | Topic-ownership model: `allowedTopics`/`forbiddenTopics` per lesson, heavily validated (word count, paragraph count, fact count, question ratio, banned phrases) |
| Retrieval strategy | Mapping-first (stored chunk ids), section-filtered | Mapping-first, page-range only | Strict `lesson_id`-filtered vector query with hard rejection of any cross-lesson chunk (`HistoryRagError`) |
| Extra content | Listening comprehension activities | — | 2 AI-generated interactive images per lesson (DALL·E/GPT-image) |
| Hardcoded assumption | — | — | `validate_lesson_catalog` hard-asserts exactly 6 lessons (Ancient Egypt catalog) |

---

## 9. AI Teacher / RAG System

This is the most technically substantial subsystem. All file paths are under `backend/app/`.

### 9.1 Ingestion pipeline (PDF → text → chunk → embed → store)

1. **Manifest** — an admin first runs structure detection (`unit_detection.py::detect_book_structure`, TOC parsing + in-body heading cross-validation) producing `data/books/{book_id}/manifest.json` (`units[]` with page ranges).
2. **PDF text extraction** — `pypdf.PdfReader`, `reader.pages[i].extract_text()` (`ingest_books.py`).
3. **Two ingestion modes:**
   - *Manifest-units* (English/Science): `_ingest_manifest_units_book` walks pages, detects sections via `book_sections.build_unit_sections`.
   - *Lessons-catalog* (History): `_ingest_lessons_catalog_book` reads `lessons.json`, filters non-teachable content (`history_lessons.is_non_teachable_history_content`), assigns each chunk to a lesson "part" by topic-keyword overlap.
4. **Chunking** — `simple_chunk(text, chunk_size=1200, overlap=200)`: a **plain character-count sliding window**, not sentence/paragraph-aware, and not a LangChain text splitter despite `langchain` being a dependency.
5. **De-duplication** — a 200-char normalized-text fingerprint set prevents re-embedding identical text.
6. **Embedding** — one `embedder.embed_query(text)` call per chunk (OpenAI `text-embedding-3-small`, 1536-dim) — **no batching**, sequential OpenAI calls, no retry/backoff.
7. **Vector storage** — ChromaDB `PersistentClient(path="chroma_db")`, two collections: `pdf_chunks` (per-chunk text + metadata: book/unit/page/section, and for History: `lesson_id`/`lesson_part_id`/`keyTopics`) and `units` (one row per unit/lesson).
8. **Section anchors** — one extra "anchor" chunk per detected section type (vocab/listening/word_study/grammar/reading/speaking/writing), truncated to 8000 chars.
9. **Purge-before-reingest** — `purge_book_vectors()` deletes a book's existing vectors before re-adding (idempotent reprocessing).
10. **Post-ingest** — `lesson_content_mapping.sync_book_lesson_mappings(book_id)` persists a lesson→chunk-id JSON mapping used for fast, non-semantic retrieval later.
11. **Progress reporting** — `rag_progress_store.py` writes stage progress (`extracting_pdf → detecting_units_lessons → chunking_content → generating_embeddings → saving_vector_store → completed/failed`) to `data/rag_progress/{book_id}.json`, polled by the admin UI every 2s — display only, not used by ingest logic itself.

### 9.2 Retrieval at teaching/quiz time

Two parallel strategies:

- **Mapping-first (English/Science)** — `lesson_content_mapping.retrieve_chunks_for_lesson()`: prefers a **stored lesson→chunk mapping or page range** (plain metadata `.get()`, no vector similarity at all) and only falls back to semantic search if no mapping exists. Runs extraction validation (`validate_lesson_extraction_for_teaching`) to catch cross-lesson bleed.
- **Strict lesson-scoped (History)** — `history_rag.retrieve_history_chunks()`: queries Chroma by `lesson_id`/`unit_id` metadata *and* by vector similarity, then **explicitly discards** any chunk whose metadata doesn't match the requested lesson. If nothing valid comes back, raises `HistoryRagError` rather than degrading silently.
- Plain semantic search (`lesson_graph.retrieve_for_item`, `retrieve_for_chapter`) is used for unit planning and exam-context gathering: `embedder.embed_query(query)` → `collection.query(query_embeddings=[...], n_results=k, where={"unit_id": ...})`, default k=8–12. **No reranking**, and no explicit `hnsw:space` override — similarity metric is whatever ChromaDB's default is.
- **Retrieval failure is a hard stop**, not a hallucination risk: if retrieved text is too short or fails validation, `teach_item()` returns the literal string *"Lesson extraction failed. Please reprocess the book."* and an empty quiz — the LLM is never asked to "fill in" missing textbook content.

### 9.3 Prompt structure

- **System prompt** — `TEACH_ITEM_PROMPT` (persona "Jassmine," textbook-grounding rules, banned generic openers) or, for History, the more elaborate `HISTORY_TEACHER_PROMPT` (includes inline GOOD/BAD example sentence pairs and an 8-step lesson-flow rubric — the closest thing to "few-shot" in this codebase, though not formal separate-message exemplars).
- **User message** — retrieved excerpts formatted as `[Excerpt id=…, page=…]\n{text}` blocks (`_format_textbook_context`), followed by lesson topic, session-half indicator, and explicit instructions ("Your FIRST sentence must teach the opening concept... Do NOT start with a greeting").
- **Quiz prompts** (`MCQ_QUIZ_BANK_PROMPT`) request exactly 3 MCQs per call, each requiring a `source_quote` (verbatim textbook phrase) used later to verify the answer key.
- **Retry-with-correction pattern:** generated text is validated, and on failure the same prompt is re-invoked with an appended `"REGENERATE. You failed validation:\n- {errors}"` block, up to 3 attempts (History).

### 9.4 Generation of explanations, quizzes, hints, evaluations

- **Explanations** — `teach_item()` calls the LLM once, then (History) runs up to 3 validate/regenerate cycles against `validate_teacher_lesson` (word count ≥600, ≥5 paragraphs, ≥3 topic-facts, ≥80% non-question sentences, no forbidden-topic leakage). A second LLM call, `coverage_guard()`, can trigger one corrective regeneration for English/Science.
- **Quizzes** — `make_quiz()` generates a 3-question bank per call, served one at a time. **`ensure_mcq_integrity()`** is the key anti-hallucination safeguard: resolves the true correct option via exact match → substring match → word-overlap against the `source_quote` → word-overlap against `correct_answer` text, falling back to a scored "best option" (never blindly index 0), and shuffles option order.
- **Hints/remediation** — hardcoded ladder: wrong answer #1 and #2 each get one LLM-generated hint (`HINT_PROMPT`); wrong answer #3 triggers a full LLM-generated remediation (`REMEDIAL_PROMPT`) with a different example.
- **Free-text evaluation** — `EVAL_PROMPT` instructs a generous LLM grader ("mark CORRECT if key concepts are present, even if wording differs"); MCQ/speaking answers are graded deterministically in code, not by the LLM.
- **Listening activities** — `listening_generator.py` LLM-generates a story + comprehension questions, cached by a SHA-256 hash of `(unit_id, lesson_content, book_context, questions, grade, prompt_version)`.
- **Weekly/monthly evaluations** — `evaluation_engine.py` is **pure aggregation**, no LLM call: reads exam/attempt history and selects from a small hardcoded recommendation-string bank by score threshold.
- **Exams** — `exam_engine.generate_exam_questions()` makes one LLM call per exam (mixed MCQ/short-answer/fill-blank/matching, 15 questions for weekly, 20–30 for monthly); short-answer grading uses a second, dedicated LLM call (`EXAM_GRADE_SHORT_PROMPT`), everything else is deterministic.

### 9.5 Session/progress persistence & API surface

See §8 for the unlock state machine and §16 for the endpoint table. Session state (`session_engine.py`) and fine-grained item state (`progress_store.py`) are **flat JSON files** — not the relational database.

### 9.6 LLM provider/model configuration

```python
# backend/app/llm.py
model = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
return ChatOpenAI(model=model, api_key=openai_key, temperature=0.4, max_tokens=4096, streaming=streaming)
```
Provider: **OpenAI only**, via LangChain's `ChatOpenAI`. No local/open-source LLM path exists anywhere. Image generation (History interactive images only) uses the raw `openai` SDK, trying `gpt-image-1 → dall-e-3 → dall-e-2` in order.

### 9.7 Data models/schemas used

Chroma metadata fields: `book_id`, `unit_id`, `pdf_page`/`book_page`, `section_type`, `section_title`, and (History) `lesson_id`, `lesson_part_id`, `keyTopics`, `chunk_index`. JSON-file schemas: see §15.2.

### 9.8 Current limitations

- **Duplicate prompt constants**: `QUIZ_PROMPT`, `EVAL_PROMPT`, `HINT_PROMPT`, `REMEDIAL_PROMPT` are each **defined twice** in `prompts.py` — the second definition silently wins at import time, meaning the first (more detailed) version is dead code. A real bug worth fixing and worth noting in the thesis.
- **`teacher_prompt_pack.py`'s guided-generation pipeline is unused** — `_generate_guided_teacher_text()` exists in `lesson_graph.py` but no call site invokes it; the simpler direct-prompt path is what actually runs.
- **No embedding batching or rate-limit handling** during ingestion — sequential per-chunk OpenAI calls.
- **MCQ answer-key resolution is a heuristic fallback**, not a guarantee, when the LLM's stated `correct_answer` doesn't exactly match one of its own `options`.
- **Windows-filename colon-sanitization logic is duplicated** across at least 3 files instead of one shared helper.
- **Single shared ChromaDB SQLite file** (~17 MB) with no backup/versioning strategy; a crash mid-purge-and-reingest could leave a book's vectors partially deleted.
- **History book structural assumption is hardcoded** to exactly 6 lessons.

```mermaid
flowchart LR
    PDF[Textbook PDF] --> Extract[pypdf text extraction]
    Extract --> Chunk[simple_chunk\n1200 chars, 200 overlap]
    Chunk --> Dedup[De-dup by text fingerprint]
    Dedup --> Embed[OpenAI text-embedding-3-small]
    Embed --> Chroma[(ChromaDB\npdf_chunks + units)]
    Chroma --> Retrieve{Retrieval strategy}
    Retrieve -->|English/Science| Mapping[Mapping-first:\nstored chunk ids / page range]
    Retrieve -->|History| Strict[Strict lesson_id filter\n+ reject cross-lesson chunks]
    Mapping --> Prompt[Build teaching prompt\nwith excerpt+page provenance]
    Strict --> Prompt
    Prompt --> LLM[OpenAI ChatOpenAI\ngpt-3.5-turbo]
    LLM --> Validate{Validation passes?}
    Validate -->|No, retry <=3x| Prompt
    Validate -->|Yes| TeacherText[teacher_text + quiz bank]
    TeacherText --> MCQ[ensure_mcq_integrity\nanti-hallucination answer key]
```

---

## 10. Chatbot / Avatar System

**Rendering:** `malsy-ui/components/AvatarWidget.tsx` — Three.js scene, loads a static `public/avatar.glb` (Ready Player Me model), not a video, not a static image. Procedural idle motion (head/spine sway, blink cycle), two layout variants (`dashboard`, `lesson`).

**Avatar animations/messages:**
- Idle/gesture animation is **procedural** (client-side math), not backend-driven.
- Lip sync is a **hybrid** of two signals, per `lib/lesson-audio.ts::attachLipSync()`: (1) a text-driven viseme sequence (`lib/viseme-lipsync.ts::buildLipSyncTimeline`) spread evenly across the known audio-clip duration, blended with (2) **real audio-frequency-band analysis** of the actual TTS clip (`OfflineAudioContext` → 3 IIR-filtered bands → `applyAudioBands`) — text picks *which* mouth shape, audio energy picks *how much* it opens (a "Wav2Lip-style" heuristic, not a machine-learned lip-sync model).

**Chatbot input/output:** genuinely **AI-based**, not scripted or rule-based. All dialogue (`teacher_text`, quizzes, hints, remediation) comes from the FastAPI session endpoints (§9); the frontend only renders it (word-by-word typewriter effect is a **decorative, client-only** animation over already-fetched text) and drives the avatar's mouth from the paired TTS audio. There is no on-device dialogue-generation logic in the frontend.

**Connection to lessons/progress:** the avatar is the *presentation layer* for the session engine's output — every phrase it speaks originates from `/session/start`/`/session/answer`/`/session/continue_part2`/`/session/switch_part` responses, so avatar content is 1:1 with lesson/quiz state, not decoupled.

**Dashboard greeting:** a separate, simple client-side selector (`lib/greeting.ts`) chooses a time-of-day greeting string — this one *is* rule-based/static, unlike in-lesson speech.

---

## 11. Reading and Pronunciation System

**Backend scoring (`backend/app/pronunciation_api.py`) — phoneme-based, not raw text matching:**
1. Reference phonemes for the target sentence are generated per word by shelling out to the **`espeak-ng`** CLI (`en-us` voice), parsed into a hand-built ASCII phoneme alphabet.
2. The student's recorded audio (base64 WAV) is decoded (`soundfile`, resampled to 16kHz via `scipy` if needed) and run through a singleton **`facebook/wav2vec2-lv-60-espeak-cv-ft`** CTC model (loaded once, GPU if available) to produce a phoneme sequence directly (this model's output vocabulary *is* eSpeak phonemes — not English words), mapped IPA→eSpeak notation.
3. **Scoring is Levenshtein (edit-distance) at the phoneme-token level:** `overall_score = max(0, 1 - edit_distance / len(reference_phonemes))`, reported as a 0–100 score. Per-word scores use a second dynamic-programming pass (`_segment_words`) that finds the best alignment of the continuous phoneme stream into per-word spans, then applies the same edit-distance formula per word.
4. Endpoint: `POST /speech/pronunciation` → `{overall_score, words: [{word, ref, got, score}]}`. Also called **internally** (not via HTTP) from `/session/answer` whenever the served quiz is `type == "speaking"` — the score is substituted as the `student_answer` for grading (threshold `score >= 70.0` = correct).

**Speech-to-text (`speech_api.py`):** `POST /speech/transcribe` — uploads base64 audio to **OpenAI's hosted Whisper API** (`whisper-1`); fully cloud-dependent, no local/offline STT model, no browser Web Speech API code in this file.

**Frontend wiring — two separate, inconsistent implementations (see §2 table):**
1. **Integrated path:** `malsy-ui/components/PronunciationRecorder.tsx` records via `MediaRecorder`, base64-encodes the clip, and threads it through `PremiumQuizPanel.tsx` → `api.session.answer(..., audioBase64)` → `POST /session/answer` (the backend then calls `pronunciation_api._score_sync` internally). This is the path actually used inside real lessons.
2. **Standalone prototype:** `malsy-ui/app/lessons/pronunciation/page.tsx` uses the **browser's native `window.SpeechRecognition`** Web Speech API against a hardcoded 50-word pool, scored locally with a **separate, hand-rolled Levenshtein function** — makes **zero backend calls**, Chrome/Edge-only. This page is disconnected from the main lesson flow and duplicates functionality already served (more rigorously) by the backend path.
- `lib/api.ts` also defines `api.pronunciation.score()` (`POST /speech/pronunciation` directly) but no page in the reviewed codebase calls it directly — it appears to be unused/aspirational API surface.

**Levenshtein/edit-distance logic:** present in **two independent places** — the backend's phoneme-level DP (`pronunciation_api._edit_distance`, `_segment_words`) and the frontend prototype's word-level `scoreWord`/`levenshtein` in `app/lessons/pronunciation/page.tsx`.

**Limitations:**
- Reference phonemes are always generated for **US English** (`espeak-ng -v en-us`) regardless of the student's actual accent — a correctly-pronounced word in another English accent/dialect could score poorly.
- Hard runtime dependency on the `espeak-ng` binary being installed on the server (503 if missing).
- No voice-activity detection or denoising — raw audio goes straight into the model, so background noise is not explicitly handled.
- STT is fully dependent on network access to OpenAI; no offline fallback.
- Microphone permission handling is whatever the browser's native `getUserMedia`/`SpeechRecognition` prompt provides — no custom in-app permission-priming UX was found.
- The two pronunciation implementations giving **different scores for the same skill** (phoneme-DP vs. browser-STT-plus-word-Levenshtein) is a genuine inconsistency a thesis "Results/Discussion" section should acknowledge.

---

## 12. Games and Gamification

**Games that exist:**
- **Legacy `frontend/app/games`** — Hangman (15 hardcoded words with hints/categories, `MAX_WRONG=6`, `earned = 10 + (5 if no wrong guesses)`, persisted to the localStorage mock DB) and Spelling Bee (20 hardcoded words, difficulty 1–3, 10 rounds, `pts = 10 + (5 if no hint) + difficulty*5`, uses the browser's `speechSynthesis` — not backend TTS — to read the word aloud).
- **`malsy-ui/app/challenges/page.tsx`** — its own Hangman and Spelling Bee (also hardcoded word lists, no backend calls), plus four more game tiles (Space Blaster, Flash Cards, Word Builder, Debate Arena) explicitly marked `locked: true` ("Coming soon" — **not implemented**).
- **Legacy `frontend`'s space-themed content** (`app/space-adventure`, `app/space-learn` with its own separate Hangman variant) is scored/quizzed similarly but is not present in `malsy-ui` at all.

**Score calculation:** entirely game-local arithmetic (see formulas above); no shared "points" or "XP" system spanning games and lessons.

**Badges/achievements:** `malsy-ui/lib/studentAchievements.ts::computeEarnedAchievements()` genuinely derives 6 fixed badges (`first_lesson`, `great_reader`, `grammar_star`, `listening_hero`, `pronunciation_star`, `three_day_streak`) from real API data (`evaluations.mine()`, `continueLearning().subjects`) plus the local streak count — computed fresh on every render, no backend "achievements" table.

**Streaks:** `lib/streak.ts` — `localStorage`-only, keyed per user (`malsy_streak_{userId}`). `getStreak()` (read) is wired into the Dashboard/Profile/Challenges pages, but `recordStreakActivity()` (the increment function) **has no confirmed call site** tied to lesson completion in the pages reviewed — meaning the streak counter may not currently advance automatically as students complete lessons. **Current status:** exists, partially wired. **Needed improvement:** call `recordStreakActivity` from the lesson-completion success path.

**Leaderboard:** `app/challenges/page.tsx`'s podium and rows are **100% hardcoded mock data** (fixed names/scores); the time-range filter buttons are cosmetic and do not re-filter anything. **No backend endpoint backs this feature at all.**

**Where game state is stored:** exclusively `localStorage`, both frontends — no server-side game-score persistence exists (games are not tied to the `EnglishQuizAttempt` or `LessonEvaluation` tables).

**How gamification supports learning:** badges are earned from genuine lesson/evaluation data, giving them some pedagogical grounding; the games (Hangman/Spelling Bee) reinforce vocabulary independent of the RAG-taught curriculum content (word lists are hand-authored, not pulled from the ingested textbooks) — a design gap worth naming in the thesis (games are not curriculum-aligned).

---

## 13. Grade Report and Assessment Logic

**Current status is split between the two frontends:**

- **Legacy `frontend/app/grades`** has a fully implemented grade model (`lib/grade-calculator.ts`, `lib/grade-report.ts`, `lib/grade-database.ts`, `models/{AcademicRecord, Semester, Grade}`, `utils/{grade-validator, grade-helpers}`): weighted components — Quiz 1 (10%), Quiz 2 (10%), Assignment (20%), Midterm (20%), Participation (10%), Final Exam (30%) — computed entirely client-side against the localStorage mock database, with a secondary read-only table of real backend evaluations (`GET /evaluations/me`) shown alongside if reachable. Letter-grade conversion and pass/fail thresholds live in `utils/grade-helpers`.
- **`malsy-ui` has no equivalent page.** A repository-wide search found no `app/grades` directory and no "GPA"/"report card" logic; the closest equivalents are a single "Quiz Average" stat tile on the Dashboard and Profile pages (`avg(evaluations.map(e => e.overall_score))`, falling back to averaging grammar/comprehension/pronunciation sub-scores), both sourced from `GET /evaluations/me`.
- **Admin side has real per-student score views** (`malsy-ui/app/admin/students/[id]/page.tsx`): average overall score, full quiz-score history with grammar/comprehension/pronunciation breakdowns, and per-lesson progress — from `GET /admin/students/{id}` (`admin_student_data.student_overview`).

**Backend grade/evaluation model (relational, `LessonEvaluation` table):** `grammar_score`, `comprehension_score`, `pronunciation_score`, `overall_score`, `number_of_attempts`, `feedback`, `lesson_completed`, `completion_date` — one row per `(user, subject, content_id)`, written via `POST /evaluations` (`routers/evaluations.py::create_evaluation`), which also triggers `mark_schedule_lesson_completed` if `lesson_completed=True`.

**Missing grade handling:** neither frontend implements a formal "missing grade" or incomplete-semester state; the legacy calculator simply omits ungraded components from the weighted average (implementation detail inferred from the component list, not independently verified against the exact averaging code).

**Needed improvement for the thesis's "current status":** a unified, backend-persisted semester/weighted-grade model does not exist in the active (`malsy-ui`) frontend; this is a genuine feature gap, not an oversight in this documentation — the functionality was built once (legacy `frontend`) and not carried forward.

---

## 14. Schedule, Attendance, and Locking Logic

**Two schedule generation layers:**

1. **Personal randomized timetable** (`default_schedule.py::create_random_schedule_for_student`) — created at registration: **16 fixed session slots** (English×4: Comprehension/Grammar/Listening/Pronunciation; Science×2: Theoretical/Practical; History×2: Videos/Theoretical; each ×2 copies), randomly (unseeded `random.Random()`) distributed across **Sunday–Thursday only** (Friday/Saturday are fixed rest days), tagged via `location = "MALSY:STUDENT:{user_id}|{session_label}"`. Non-reproducible across regenerations (a real limitation — re-running produces a different layout each time, unlike the deterministic weekly-plan seed below).
2. **Weekly subject-day layout planner** (`weekly_schedule_planner.py::generate_weekly_plan`) — a deterministic-per-seed (`student_week_seed = sha256(user_id + week_start)`) fallback that assigns *subjects* (not lesson instances) to days when no personal timetable exists; in practice this is rarely hit since registration always creates a personal timetable.

**Turning layout into actual lesson instances** (`lesson_schedule_service.py`):
- `collect_subject_sequences` builds ordered per-subject lesson lists from visible/published/grade-matched books.
- `_create_week_schedule_from_timetable` walks each of the 16 personal slots and assigns the **next uncompleted lesson** for that slot's subject, creating a `StudentLessonScheduleItem` row (`lesson_id` uniquely encodes chapter + session label + duplicate index).
- `ensure_current_week_schedule` (called at login) checks whether the current week already has a schedule, deletes stale incomplete rows from prior weeks, and regenerates as needed.

**"Today's schedule" / subject locking — two mechanisms, deliberately reconciled:**
- **(a) DB unlock chain** (`_recompute_unlock_chain`): marks exactly one non-completed schedule row `available` (the earliest by day-order after the last completed one); everything else `locked`.
- **(b) Content-progress override** (`schedule_availability_service.evaluate_schedule_session`): re-derives the *true* lock state from book/section progress (`session_engine`), producing a human `lock_reason` (e.g. `Complete "Lesson 3" before starting "Lesson 4".`).
- **The function students actually see**, `lesson_schedule_service.fetch_student_weekly_schedule`, combines both **plus a special rule**: the first non-completed session that falls on **today** (or an explicitly requested day) is force-marked `available` regardless of what the content-progress chain would otherwise say — i.e., *today's next lesson is always startable*, while every other day's sessions still show the true book-progress lock. This is the concrete answer to "how subjects are locked if not scheduled": a subject/lesson not reachable today (wrong day, or book-progress-locked on a future day) renders as locked with an explanatory reason string.

**Attendance:** a separate relational concern — `Attendance` rows are created only via `POST /attendance` (admin-only, `require_admin`), joined against `Schedule`/`Subject` for reporting (`GET /attendance/me`, admin reports). There is **no automatic attendance-taking** wired to lesson completion — attendance and lesson-progress are two parallel, only loosely reconciled systems (the admin view has to fuzzy-match evaluations to attendance rows by subject-name heuristics, `admin_student_data._eval_for_lesson`).

**Connection to the admin dashboard:** `admin_student_data.build_student_schedule` re-derives the same weekly schedule for a given student, overlaying `LessonEvaluation` matches and a third status label (`_admin_schedule_status`, which additionally flags "missed" for past, incomplete sessions).

**Current limitations:**
- Two independently-defined `DAY_ORDER` constants exist in the codebase — `weekly_schedule_planner.py` uses a Sunday-first order, `student_portal_service.py`/`timetable_service.py` use a Monday-first order — a latent bug risk for any code assuming one canonical ordering.
- The 16-slot personal timetable's random assignment is unseeded, so "regenerate my timetable" produces a different schedule every time (no stability guarantee).
- `schedule_sync_service._schedule_ids_for_subject`'s legacy fallback path uses Python's built-in `hash()` on a string for day placement — not stable across process restarts unless `PYTHONHASHSEED` is fixed.
- An undocumented magic number (`BLOATED_SCHEDULE_THRESHOLD = 40`) force-regenerates a schedule if row count exceeds it — a symptom-suppression safeguard rather than a root-cause fix for whatever accumulates extra rows.

```mermaid
flowchart TD
    A[Student registers] --> B[create_random_schedule_for_student\n16 personal slots, Sun-Thu]
    B --> C[generate_lesson_schedule_for_student\nassign next-uncompleted lesson per slot]
    C --> D[(StudentLessonScheduleItem rows)]
    E[Student logs in / views week] --> F[ensure_current_week_schedule]
    F --> G[fetch_student_weekly_schedule]
    G --> H[_recompute_unlock_chain\nDB layout status]
    G --> I[evaluate_schedule_session\nbook-progress true lock state]
    H --> J{Is this the first pending\nsession on TODAY?}
    I --> J
    J -->|Yes| K[Force status = available]
    J -->|No| L[Use book-progress status\n+ lock_reason]
    K --> M[Return week to frontend]
    L --> M
```

---

## 15. Database / Storage Design

MALSY uses **three** distinct persistence mechanisms side by side.

### 15.1 PostgreSQL (relational, source of truth for identity/schedule/assessment records)

Engine: `asyncpg` via async SQLAlchemy (`backend/app/database.py`), connection string `DATABASE_URL` in `backend/.env` (format `postgresql+asyncpg://user:pass@host:port/dbname`). All primary keys are `UUID` (Postgres-specific dialect type) — not portable to SQLite/MySQL without modification.

```mermaid
erDiagram
    USERS ||--o{ STUDENT_LESSON_SCHEDULE_ITEMS : has
    USERS ||--o{ STUDENT_SCHEDULE_ENROLLMENTS : has
    USERS ||--o{ ATTENDANCE : has
    USERS ||--o{ ENGLISH_QUIZ_ATTEMPTS : has
    USERS ||--o{ LESSON_EVALUATIONS : has
    USERS ||--o{ EXPERIMENT_SESSIONS : has
    USERS ||--o{ PARENT_NOTIFICATIONS : has
    SUBJECTS ||--o{ SCHEDULES : has
    SUBJECTS ||--o{ LAB_EXPERIMENTS : has
    SUBJECTS ||--o{ STUDENT_LESSON_SCHEDULE_ITEMS : categorizes
    SCHEDULES ||--o{ STUDENT_SCHEDULE_ENROLLMENTS : filled_by
    SCHEDULES ||--o{ ATTENDANCE : recorded_for
    LAB_EXPERIMENTS ||--o{ EXPERIMENT_SESSIONS : attempted_in

    USERS {
        uuid user_id PK
        string email UK
        string password_hash
        string role
        int grade_level
        string account_status
        string guardian_email
    }
    STUDENT_LESSON_SCHEDULE_ITEMS {
        uuid schedule_item_id PK
        uuid user_id FK
        uuid subject_id FK
        string lesson_id
        string day_of_week
        date week_start_date
        int order_index
        string status
    }
    SUBJECTS {
        uuid subject_id PK
        string subject_name UK
        string subject_code UK
    }
    SCHEDULES {
        uuid schedule_id PK
        uuid subject_id FK
        string day_of_week
        time start_time
        time end_time
        string session_type
    }
    STUDENT_SCHEDULE_ENROLLMENTS {
        uuid enrollment_id PK
        uuid user_id FK
        uuid schedule_id FK
        string enrollment_status
    }
    ATTENDANCE {
        uuid attendance_id PK
        uuid user_id FK
        uuid subject_id FK
        uuid schedule_id FK
        date session_date
        string attendance_status
    }
    ENGLISH_QUIZ_ATTEMPTS {
        uuid attempt_id PK
        uuid user_id FK
        string content_id
        bool is_correct
        float phoneme_accuracy_score
    }
    LESSON_EVALUATIONS {
        uuid evaluation_id PK
        uuid user_id FK
        string content_id
        float overall_score
        bool lesson_completed
    }
    LAB_EXPERIMENTS {
        uuid experiment_id PK
        uuid subject_id FK
        string experiment_name
    }
    EXPERIMENT_SESSIONS {
        uuid session_id PK
        uuid user_id FK
        uuid experiment_id FK
        string session_status
        int final_score
    }
    PARENT_NOTIFICATIONS {
        uuid notification_id PK
        uuid user_id FK
        string guardian_email
        bool is_read
    }
```

| Table | Purpose | Key fields | Read/written by |
|---|---|---|---|
| `users` | Identity, guardian contact | email, password_hash, role, grade_level, guardian_* | `auth.py`, `routers/users.py`, `admin_student_data.py` |
| `student_lesson_schedule_items` | Per-student, day-based lesson-instance schedule (no fixed clock time) | user_id, subject_id, lesson_id, day_of_week, week_start_date, order_index, status | `lesson_schedule_service.py`, `dashboard.py` |
| `subjects` | Canonical subject list | subject_name, subject_code, subject_type | `routers/subjects.py`, schedule/enrollment FKs |
| `schedules` | Time-slotted sessions (both shared *and* per-student personal slots, see §14) | subject_id, day_of_week, start/end_time, session_type | `default_schedule.py`, `routers/schedules.py` |
| `student_schedule_enrollments` | Student↔schedule join, with drop history | user_id, schedule_id, enrollment_status, drop_date | `routers/enrollments.py` |
| `attendance` | Manually-recorded attendance | user_id, subject_id, schedule_id, session_date, status | `routers/attendance.py` (admin-write, student-read) |
| `english_quiz_attempts` | Raw quiz-attempt log (incl. pronunciation sub-scores) | user_id, content_id, submitted_answer, phoneme_accuracy_score | `routers/quiz.py` |
| `lesson_evaluations` | Canonical "did the student pass this lesson" record | user_id, content_id, grammar/comprehension/pronunciation/overall_score, lesson_completed | `routers/evaluations.py` |
| `lab_experiments` | Catalog of virtual-lab experiments | subject_id, experiment_name, lab_scene_id | `routers/labs.py` |
| `experiment_sessions` | A student's attempt at one lab experiment | user_id, experiment_id, final_score, safety_compliance | `routers/labs.py` |
| `parent_notifications` | Guardian-facing messages | user_id, guardian_email, notification_type, message, is_read | `routers/notifications.py` |

### 15.2 JSON-file store (`backend/data/`, via `storage.py`) — AI-teacher/RAG runtime state

No transactions, no locking — `json.load`/`json.dump`, last write wins. This is where **most of the AI-teacher-specific state actually lives**, not in PostgreSQL:

| File pattern | Purpose | Written/read by |
|---|---|---|
| `progress_{student_id}.json` | Global chapter/unit-index cursor | `session_engine.py` |
| `progress_{student_id}_{book_id}.json` | Per-book lesson unlock (`max_unlocked_lesson_index`, `completed_lesson_numbers`) | `session_engine.py` |
| `progress_{student_id}_{chapter_id}.json` | Fine-grained in-lesson item cursor, hints, attempt history | `progress_store.py` |
| `plan_{chapter_id}.json` / `unitplan_{student}_{chapter}.json` | Legacy per-chapter / per-student generated plans | `lesson_planner.py`, `unit_plan_store.py` |
| `canonical_unitplans/{book_id}/{unit}.json` | Admin-approved canonical lesson plan | `canonical_plan_store.py` |
| `lesson_mappings/{book_id}.json` | Lesson → Chroma chunk-id mapping | `lesson_content_mapping.py` |
| `exam_{...}.json` | Generated exam state (questions, attempts, score) | `exam_store.py` |
| `evaluation_{student}.json` | Weekly/monthly evaluation summaries | `evaluation_store.py` |
| `timeline_{student}.json` | Course week/month tracking, unit-completion timestamps | `student_timeline_store.py` |
| `active_session.json` | **Single, global** in-memory teaching session (no student id in filename!) | `active_session_store.py`, `main.py::ACTIVE_SESSION` |
| `listening/{unit_id}.json` | Cached listening-comprehension activity | `listening_store.py` |
| `rag_progress/{book_id}.json` | Ingestion progress display state | `rag_progress_store.py` |
| `interactive_images/{book_id}/{unit}/manifest.json` + PNGs | History AI-generated images | `history_interactive_images.py` |
| `book_registry.json`, `subject_registry.json` | Book/subject metadata, visibility/archive flags | `book_registry.py`, `subject_registry.py` |
| `books/{book_id}/{manifest.json, lessons.json, book.pdf, sections.json}` | Source book content and structure | `ingest_books.py`, `book_lessons_catalog.py` |
| `tts_audio/*.wav` | Generated TTS audio clips (never cleaned up — no eviction/TTL) | `tts_api.py` |

### 15.3 ChromaDB (vector store)

`backend/chroma_db/` — a local persistent `chroma.sqlite3` (~17 MB) plus per-segment binary directories. Two collections confirmed: **`pdf_chunks`** (per-chunk text + metadata) and **`units`** (one row per unit/lesson). No `hnsw:space` override anywhere — similarity search uses ChromaDB's implicit default distance function.

### 15.4 Supabase (object storage only — `malsy-ui`)

`malsy-ui/lib/supabase-storage.ts` uses `@supabase/supabase-js` **exclusively** for two storage buckets (`lesson-videos`, `lesson-images`) holding AI-generated media. **There is no Supabase Postgres/Auth usage anywhere in this codebase** — this is worth stating explicitly since Supabase is often assumed to be a full BaaS; here it is object storage only.

### 15.5 Client-side storage (`localStorage`, both frontends)

- `malsy-ui`: JWT tokens (`malsy_token`/`malsy_admin_token`), streak counters, game stats, theme preference.
- Legacy `frontend`: an entire **mock student database** (`lib/database.ts`) — accounts, passwords (plaintext in this mock store), progress, game scores — functioning as a parallel, unsynced identity system to the real backend.

### 15.6 Migrations

`backend/migrations/001_rename_parent_to_guardian.sql` (one-time, not replayed automatically), `002_lesson_schedule_day_columns.sql`, `003_schedule_week_start.sql` (both replayed idempotently at every boot via `db_migrations.apply_schema_patches`, using `ADD COLUMN IF NOT EXISTS`, not by executing the `.sql` files directly — the SQL files document the change; the Python function enforces it).

---

## 16. APIs and Backend Endpoints

All routes are unauthenticated unless noted. Base URL default `http://localhost:8000` (`NEXT_PUBLIC_API_URL`).

### 16.1 Session / lesson-teaching (defined directly in `main.py`)

| Method | Route | Request | Response (key fields) | Auth |
|---|---|---|---|---|
| POST | `/session/start` | `{student_id, chapter_id, lesson_title?, lesson_description?}` | `teacher_text, quiz, listening?, course_week, course_month, evaluation_summary` | none |
| POST | `/session/answer` | `{student_id, student_answer?, option_index?, audio_base64?}` | `correct, evaluation, hint/remediation_text, next_action, recommendations` | none |
| POST | `/session/next_unit` | `{student_id}` | next unit's teacher_text/quiz or `done` | none |
| POST | `/session/continue_part2` | `{student_id}` | next section/part content | none |
| POST | `/session/switch_part` | `{student_id, target_part}` | requested part content (if unlocked) | none |
| GET | `/units` | query `book_id?` | list of Chroma-indexed units | none |
| GET | `/unit/{unit_id}` | — | unit content | none |
| GET | `/units/{unit_id}/listening` | — | listening activity (no answer key) | none |
| GET | `/books/{book_id}/lessons` | — | published lesson catalog | none |
| GET | `/books/{book_id}/lesson-progress` | query `student_id` | `max_unlocked_lesson_index, completed_lesson_numbers` | none |
| GET | `/books/lesson-nav/{chapter_id}` | — | `{lesson, next_lesson}` metadata | none |
| GET/POST | `/lesson/interactive-images` | `{unit_id, teacher_text?, force?}` | History-only AI interactive images | none |
| POST | `/lesson/script` | `{unit_id, part_number, previous_scripts}` | validated video narration script | none |

**Note:** none of the `/session/*` or `/books/*` endpoints require a JWT — student identity is passed as a plain `student_id` string in the request body/query, not derived from an authenticated token. This is a significant gap versus the JWT-protected `routers/*.py` endpoints (§16.3) and is flagged again in §19/§21.

### 16.2 Exam / evaluation / avatar (also in `main.py`)

| Method | Route | Request | Response |
|---|---|---|---|
| POST | `/exam/weekly/start` | `{student_id, unit_id}` | exam state (first question) |
| POST | `/exam/monthly/start` | `{student_id}` | exam state, or error if no completed units |
| GET | `/exam/{exam_id}` | query `student_id` | current exam state |
| POST | `/exam/answer` | `{student_id, exam_id, question_id, answer}` | grading result |
| POST | `/exam/finish` | `{student_id, exam_id}` | final score |
| GET | `/evaluation/weekly` \| `/monthly` \| `/summary` \| `/unit/{id}` | query `student_id` | evaluation aggregates |
| POST | `/evaluation/reset` | `{student_id}` | `{ok: true}` |
| POST | `/avatar/lipsync/prepare` | `{student_id, text, speech_rate}` | viseme timeline + thresholds |
| POST | `/avatar/lipsync/evaluate` | expected/actual visemes + timing | pass/fail + metrics |
| POST | `/avatar/lipsync/qa/run` | `{utterance_count, jitter_ms, ...}` | synthetic QA harness results |
| POST | `/tts` | `{text, voice_id, speed, format}` | `{audio_url, voice_id}` |
| POST | `/speech/transcribe` | `{audio_base64, language?}` | `{text}` |
| POST | `/speech/pronunciation` | `{audio_base64, sentence}` | `{overall_score, words[]}` |
| WS | `/ws/teacher` | JSON messages (`session_start`, `session_answer`, `session_continue_part2`, `session_next_unit`, `ping`) | streamed `teacher_sentence`/`quiz`/`evaluation_summary`/`next_action` events |

### 16.3 REST routers (`backend/app/routers/*.py`) — JWT-protected unless noted

| Router (prefix) | Endpoints | Auth |
|---|---|---|
| `/auth` | `POST /register`, `POST /login`, `GET /me` | none / none / JWT |
| `/users` | `GET/PUT /me`, `GET ""` (admin), `GET /{id}` | JWT / JWT / admin / JWT (self-or-admin) |
| `/subjects` | `GET ""` | JWT |
| `/schedules` | `GET ""`, `GET /{id}` | JWT |
| `/enrollments` | `GET /me`, `POST ""`, `DELETE /{id}` | JWT |
| `/attendance` | `GET /me`, `GET /me/subject/{id}`, `POST ""` (admin, `require_admin`) | JWT / JWT / DB-admin |
| `/quiz` | `POST /attempts`, `GET /attempts/me` | JWT |
| `/evaluations` | `GET /me`, `GET /me/{content_id}`, `POST ""` | JWT |
| `/labs` | `GET /experiments`, `GET /experiments/{id}`, `POST/PUT /sessions`, `GET /sessions/me` | JWT |
| `/notifications` | `GET /parent?guardian_email=` (public), `POST ""` (admin), `PUT /{id}/read` | none / admin / none |
| `/dashboard` | `GET /next-session`, `GET /my-week`, `GET /my-subjects`, `GET /continue-learning` | JWT |
| `/portal` | `GET /subjects`, `GET /search?q=` | JWT |
| `/admin` | ~45 endpoints — login, dashboard, analytics, students CRUD/overview, reports, curriculum, lesson content/preview/regenerate, books upload/structure/process/plans, subjects CRUD, schedule generation (full table below) | fixed-admin-or-DB-admin |

**`/admin` endpoint highlights** (full list in the admin router; grouped here):
- Auth/overview: `POST /admin/login`, `GET /admin/me`, `GET /admin/dashboard`, `GET /admin/analytics`, `GET /admin/debug/book/{key}`.
- Students: `GET /admin/students`, `GET /admin/students/{id}/overview`, `.../parents`, `.../schedule`, `.../attendance`, `PATCH .../deactivate`, `DELETE /admin/students/{id}` (soft-delete only), `PATCH /admin/users/{id}/status`.
- Reports: `GET /admin/reports/{attendance,evaluations,labs}`.
- Curriculum/content: `GET /admin/curriculum/{portal,english}`, `GET /admin/lessons/content`, `GET /admin/lessons/{id}/content`, `POST /admin/lessons/{id}/preview-session[/switch-part]`, `GET .../preview-quiz`, `POST .../regenerate`, `GET /admin/units/{id}/listening`.
- Books: `GET /admin/books`, `POST /admin/books/upload`, `POST /admin/subjects/{key}/upload-book`, `GET/PATCH /admin/books/{id}/structure`, `POST .../extract-structure`, `POST .../structure/approve`, `POST .../process` (=`/reprocess`), `GET .../processing-status`, `PATCH .../visibility`, `PATCH .../archive`, `GET/PATCH /admin/books/{id}/plans`, `POST .../plans/{generate,regenerate}`, `PATCH .../plans/approve`.
- Subjects: `GET/POST /admin/subjects`, `PATCH .../visibility`, `PATCH .../archive`, `GET /admin/content/subjects`.
- Schedules: `POST /admin/schedules/generate-random`.

**Error handling (global, `main.py`):** custom handlers for `IntegrityError` (409/400 with a human message), `SQLAlchemyError` (500, generic), `ValidationError` (422 with Pydantic error detail), and a catch-all `Exception` handler — in `DEBUG` mode (default **true** if the env var is unset) these responses include `error_type`, `error_message`, and a full Python traceback in the JSON body, a real information-disclosure risk before production.

---

## 17. Admin Dashboard / Teacher / Parent Features

**Implemented (backend + `malsy-ui/app/admin`, real data throughout):**
- Dashboard/analytics counts, student list + full per-student overview (attendance stats, evaluation stats, lab stats, enrolled modules, quiz-score history).
- **Book publishing pipeline** (the most mature feature in the whole project): upload PDF → extract/edit/approve structure → RAG ingest with live progress polling → generate/edit/approve lesson plan → toggle visibility/archive. Each stage is backed by a real endpoint and a real background job (`_run_structure_extraction_job`, `_run_ingest_job`, `_run_plan_generation_job`, `_run_schedule_sync_job`).
- **Admin lesson preview** — runs the *exact same* `lesson_graph` a student would get, under a synthetic `PREVIEW_STUDENT_ID`, including the answer key (`quiz_with_answers`) — lets an admin verify AI output before publishing.
- Subject CRUD (create, visibility toggle, archive), which cascades to schedule sync jobs.
- Bulk schedule generation for all students (`POST /admin/schedules/generate-random`).

**Partially implemented / needs improvement:**
- `admin_preview_service._preview_sessions` is a **plain module-level dict keyed only by `chapter_id`** — not per-admin, not multi-worker-safe, lost on restart; two admins previewing the same lesson simultaneously would interfere with each other.
- **Parent notifications**: the `ParentNotification` model and `POST /notifications`/`GET /notifications/parent` endpoints exist, but no automated trigger (e.g., "notify guardian when a lesson is completed") was found anywhere in the reviewed code — notifications must currently be created manually via the admin-only `POST /notifications` endpoint. **There is no guardian-facing UI in either frontend** — a parent would have to call the public `GET /notifications/parent?guardian_email=...` endpoint directly. This is a "planned, not delivered" feature for the thesis's honest accounting.
- **Teacher reporting**: the admin's per-student/attendance/evaluation reports serve this role; there is no separate "teacher" role distinct from "admin" in the data model.
- **Lesson/video generation controls**: real for AI-teacher text/quiz content (admin preview/regenerate); the OpenAI-Sora **video** generation pipeline exists only in the **legacy** `frontend` and `malsy-ui/app/api/generate-lesson-video` (a Next.js BFF route, separate from the FastAPI admin pipeline) — these are two different, non-unified "video generation" systems.

---

## 18. Virtual Chemistry Lab / Unity Integration

**Current, accurate status (not aspirational):**

1. **A real, working chemistry-lab *simulation* exists, but it is 2D and not 3D/Unity.** `frontend/app/lab/page.tsx` (legacy frontend) implements Equipment catalog, a chemical Mixer (10 chemicals, a lookup table of 6 known reactant-pair reactions with balanced equations), a pH Tester, and a Safety Quiz — entirely flat React UI, zero 3D content. It does record session telemetry to the real backend (`POST/PUT /labs/sessions`, matching the `LabExperiment`/`ExperimentSession` tables in §15.1). `malsy-ui/app/lab/page.tsx` has its own separate implementation (340 lines; not diffed line-by-line against the legacy version in this pass, but confirmed to exist and to call `GET /labs/experiments` with a hardcoded fallback array if the backend returns nothing).
2. **`test2/` is a browser-based (Three.js) avatar-teacher prototype that genuinely talks to the live backend** — not a chemistry lab at all, and not a Unity build. It loads a Ready Player Me `.glb` avatar, auto-rigs bones/morph targets, and calls the real `POST /tts` and `POST /avatar/lipsync/prepare` endpoints (verified byte-for-byte against `tts_api.py`/`main.py`) plus `POST /session/start`. It can be run today via `python -m http.server` (frontend) + `uvicorn app.main:app` (backend).
3. **The "Unity WebGL" half described in `test2/README.md` does not exist as code.** `test2/Oculus/LipSync/` is the unmodified, vendor-supplied Meta/Oculus Lip Sync **Unity SDK package** — Editor scripts, platform plugins, and its own generic demo scene, none of which reference MALSY. The README instructs a developer to *create* a new Unity project and *write* three C# scripts (`AvatarBridge`, `WebGlAudioUrlPlayer`, `RpmAmplitudeLipSync`) — a repository-wide search confirms **none of these three scripts exist anywhere in the repo**. There is no `.unity` scene, no Unity project file, and no WebGL build output for MALSY specifically.
4. **No science lesson currently links to any lab activity.** The `LabExperiment.content_id` field exists in the schema (a hook for linking an experiment to a specific lesson/chapter id) but no code path was found that surfaces a "launch lab" call-to-action from within a Science lesson's AI-taught content — the lab pages are separate top-level nav items, not lesson-embedded.
5. **How experiment completion/scores are tracked today:** via `ExperimentSession` (`observation_accuracy`, `procedure_completion`, `safety_compliance`, `expected_result_achieved`, `final_score`, `number_of_attempts`, `feedback`) — this part of the data model is real and used by the flat 2D lab UI's telemetry calls.

**Gaps to close for a genuine "virtual chemistry lab" as described in the thesis's stated scope:**
- No Unity project is checked into the repository; either build one and check it in, or (more realistically given the working Three.js prototype) extend `test2/app.js`'s scene with actual lab-equipment 3D assets and interaction logic instead of pursuing the Unity path.
- The three bridge scripts described in the README need to be written (or the Unity approach dropped).
- A content link between specific Science `chapter_id`/lesson and a specific `LabExperiment`/3D scene needs to be built and exposed in the lesson UI.
- The flat 2D lab (currently the only *chemistry-specific* implementation) and the avatar/TTS prototype (currently the only *3D/Unity-adjacent* implementation) are entirely separate systems today; unifying them is future work, not a small integration task.

---

## 19. Configuration and Environment

**Backend (`backend/.env`, gitignored — variable names only, values redacted here for security):**

| Variable | Purpose | Default if unset |
|---|---|---|
| `DATABASE_URL` | Postgres async DSN (`postgresql+asyncpg://...`) | none — app raises `ValueError` at import if missing |
| `SECRET_KEY` | JWT signing secret | `"change-me-before-deploying-to-production"` (placeholder — **must** be overridden) |
| `JWT_ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Student JWT lifetime | `60` |
| `OPENAI_API_KEY` | OpenAI API access (chat, embeddings, Whisper, TTS, image gen) | required for all AI features; hard 503s if missing |
| `OPENAI_MODEL` | Chat model override | `gpt-3.5-turbo` |
| `TTS_BACKEND` | `openai` \| `piper` \| `coqui_xtts` | `openai` |
| `PIPER_EXE`, `PIPER_MODEL_PATH` | Offline TTS binary/model paths | required only if `TTS_BACKEND=piper` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Fixed admin login | **`admin` / `12345`** if unset — must be overridden before any real deployment |
| `DEBUG` | Include tracebacks in error responses | **`true`** if unset |

**`malsy-ui/.env.local` / `.env.example`:**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | FastAPI backend base URL (default `http://localhost:8000`) |
| `OPENAI_API_KEY` | Used by Next.js BFF routes for Sora video + script generation |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Object storage only (buckets must be public or use signed URLs) |
| `SUPABASE_VIDEO_BUCKET`, `SUPABASE_IMAGES_BUCKET` | Bucket names |

**Required packages:**
- Backend (`requirements.txt`, **all unpinned** — no exact versions committed): `fastapi`, `uvicorn`, `torch`, `transformers`, `soundfile`, `scipy`, `pypdf`, `chromadb`, `langchain`, `langchain-openai`, `langgraph`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `passlib[bcrypt]`, `python-jose[cryptography]`, `python-multipart`, `pydantic[email]`. Notably, `openai` itself is **used but not listed** (`speech_api.py`/`tts_api.py` import it directly) — an unlisted transitive/implicit dependency. `espeak-ng` is a required **system binary**, not pip-installable.
- Offline TTS (`requirements-offline-tts.txt`): `TTS>=0.22.0` (Coqui) — Piper needs no Python package, only the external binary + `.onnx` model.
- Frontend (`malsy-ui/package.json`): `next@14.2.35`, `react@18`, `@supabase/supabase-js@^2.108`, `framer-motion@^12`, `three@^0.160`, `lucide-react`. Legacy `frontend/package.json`: `next@14.2.35`, `openai@^6.39`, `three@^0.184`.

**Install/run commands:**
```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Active frontend
cd malsy-ui && npm install && npm run dev   # port 3001

# Legacy frontend
cd frontend && npm install && npm run dev   # port 3000

# Avatar/Unity prototype (test2)
cd test2 && python -m http.server 5500      # requires backend running on :8000
```

**Development vs. production configuration:** the project has **no production configuration profile at all** — `DEBUG` defaults true, `SECRET_KEY`/`ADMIN_PASSWORD` default to insecure placeholders, CORS is wide open (`allow_origins=["*"]`), and there is no Dockerfile, CI pipeline, or deployment manifest found anywhere in the repository. This is squarely a development-only prototype today.

**Security warnings for the thesis:**
- `backend/.env` is correctly gitignored, but its **default fallback values** (`ADMIN_PASSWORD="12345"`, `SECRET_KEY` placeholder) are hardcoded in source and will silently activate if the file is ever missing or incomplete — this should be called out explicitly as a "fail-secure vs. fail-open" defect.
- `DEBUG=true` by default leaks stack traces to any client.
- No rate limiting anywhere (login, TTS, STT, or LLM-backed endpoints) — a cost/abuse risk given every AI call is billed against `OPENAI_API_KEY`.
- The `/session/*` and `/books/*` endpoints (main.py) accept a bare `student_id` string with **no JWT verification at all** — any caller can act as any student by guessing/enumerating IDs.

---

## 20. Testing and Verification

**Current status: no automated test suite exists in this repository.** A search for `test_*.py`, `*.test.ts(x)`, `pytest.ini`, `jest.config.*`, and similar found none (the root `test.py` is a standalone manual/dev script for microphone + wav2vec2 experimentation, not a test file in the pytest sense; `test2/` is a naming coincidence — an avatar/Unity prototype folder, not a test directory). Below is a **testing plan** derived directly from the code's actual behavior, organized by the categories requested, each naming the exact modules a real test would exercise.

| # | Test | Type | Files/modules involved | Expected result |
|---|---|---|---|---|
| 1 | Register → login → JWT round-trip | Auth (integration) | `routers/auth.py`, `auth.py` | Valid token issued; `/auth/me` returns the same user; wrong password → 401 |
| 2 | Admin fixed-credential login vs. DB-admin login | Auth (unit+integration) | `admin_auth.py` | Both paths produce a token accepted by `require_admin_access`; `POST /attendance` correctly rejects the fixed-token admin (known inconsistency, §6) |
| 3 | `ensure_mcq_integrity` resolves correct option even when `correct_answer` text doesn't exactly match an option string | RAG unit test | `lesson_graph.py::ensure_mcq_integrity`, `_resolve_correct_option`, `_best_option_fallback` | Returns a plausible `correct_index`; shuffled option order never leaks position bias |
| 4 | History retrieval never returns cross-lesson chunks | RAG retrieval test | `history_rag.py::retrieve_history_chunks` | Every returned chunk's metadata lesson id equals the requested lesson id; raises `HistoryRagError` when none match |
| 5 | English retrieval respects mapping-first strategy | RAG retrieval test | `lesson_content_mapping.retrieve_chunks_for_lesson` | Uses stored mapping/page range when present; falls back to semantic search only when absent |
| 6 | Lesson unlock monotonicity | Progress/unit test | `session_engine.record_lesson_passed`, `save_progress` | `max_unlocked_lesson_index`/`max_unlocked_part` never decreases across repeated/out-of-order calls |
| 7 | Schedule "today override" | Schedule locking test | `lesson_schedule_service.fetch_student_weekly_schedule` | The first pending session on the current day is always `available`; other days reflect true book-progress lock state |
| 8 | Weekly personal-timetable compliance | Schedule unit test | `default_schedule._timetable_is_compliant`, `create_random_schedule_for_student` | Exactly 16 slots, only Sun–Thu, each of the 8 session labels appears exactly twice |
| 9 | Grade/evaluation aggregation | Assessment unit test | `evaluation_engine.weekly_evaluation`/`monthly_evaluation` | Averages match manually-computed values from seeded `exam_store`/`progress_store` fixtures |
| 10 | Pronunciation scoring against known reference | Speech unit test | `pronunciation_api._edit_distance`, `_segment_words`, `_ref_phonemes` | A perfect-match synthetic phoneme sequence scores 100; a scrambled one scores proportionally lower |
| 11 | TTS backend fallback | Speech integration test | `tts_api.py`, `local_tts.py` | With `TTS_BACKEND=piper` and no `ffmpeg`, an `mp3` request silently serves a `.wav` (assert the actual returned `Content-Type`/extension, not just success) |
| 12 | Database constraint handling | DB integration test | `main.py` exception handlers, `models.py` unique constraints | Duplicate email registration → 409 via `IntegrityError` handler, not a raw 500 |
| 13 | Admin book pipeline end-to-end | Integration test | `routers/admin.py` (`upload → extract-structure → approve → process → plans/generate → plans/approve → visibility`) | Book transitions through every `status`/`plan_status` value correctly; `GET /books/{id}/lessons` becomes reachable only after publish |
| 14 | Frontend route guard | UI test | `malsy-ui/components/ClientShell.tsx` | Unauthenticated user hitting a protected route is redirected to `/login`; authenticated user is not |
| 15 | Avatar lip-sync QA harness | Synthetic QA test (already exists as code, not as an assertion-based test) | `avatar_lipsync.run_qa_harness` | `ready_for_rollout` computed correctly from `pass_rate`; note this only tests the *synthetic* simulation, not real device telemetry (§10) |

**Recommended tooling for the thesis's methodology chapter:** `pytest` + `httpx.AsyncClient`/`pytest-asyncio` for backend API tests against a disposable test database; `pytest` fixtures for seeding `progress_*`/`exam_*` JSON files; Playwright or Cypress for `malsy-ui` end-to-end flows (login → dashboard → lesson → quiz); a small fixture ChromaDB collection for RAG retrieval tests instead of the production `chroma_db/`.

---

## 21. Results and Technical Evaluation

**What currently works successfully (verified from code, not from a live deployment — see §24 for what could not be confirmed):**
- End-to-end AI-tutoring flow: schedule → lesson retrieval (RAG) → LLM teaching text → quiz → grading → progress unlock → schedule completion is fully wired and internally consistent.
- The admin content-publishing pipeline (upload → structure → ingest → plan → publish) is the most mature, fully-implemented feature in the system.
- Anti-hallucination safeguards are genuinely present and non-trivial: hard retrieval-failure stop (no LLM guessing), MCQ answer-key resolution via multiple fallback strategies, per-lesson content-scope validation to prevent cross-lesson bleed.
- Speech pipeline uses real, appropriate models (wav2vec2 phoneme CTC + eSpeak for pronunciation; Whisper for STT) rather than superficial string matching.

**Performance:** cannot be empirically assessed from source alone (no load-testing artifacts, no logs of response latency were found). Structurally relevant facts: every chunk is embedded with a separate OpenAI API call (no batching) during ingestion, which will scale poorly for large books; the system holds a **single global in-memory session**, meaning throughput for concurrent students is effectively zero beyond one — this is the single largest architectural performance ceiling.

**Usability:** the avatar + typewriter-effect teaching UI, schedule-driven "what do I do today" framing, and hint-then-remediate quiz flow are coherent, learner-appropriate design choices. Counterpoints: two inconsistent pronunciation-practice UIs, a hardcoded leaderboard, and a missing grades page in the active frontend all create an uneven experience across features.

**Maintainability:** code is organized by clear single-responsibility modules (one file per concern), but several concrete maintainability issues were found: duplicate prompt constants silently shadowing each other in `prompts.py`; two independently-defined `DAY_ORDER` constants; three separate places implementing Windows-filename colon-sanitization; a legacy frontend and an active frontend with partially overlapping but non-identical feature sets and no migration plan documented in-repo.

**Scalability:** the single-in-memory-session design and the unbatched/unbacked-off OpenAI ingestion calls are the two clearest scalability limits; the JSON-file storage layer (no locking, one file per student per concern) would need to move to a proper database or cache for multi-user production load.

**Security:** default admin credentials, a placeholder JWT secret, `DEBUG=true` by default, wide-open CORS, and unauthenticated `/session/*` endpoints (student identity spoofable via a guessed `student_id`) are all real, code-confirmed weaknesses appropriate for a graduation-project prototype but requiring remediation before any real deployment (see §19).

**Accessibility:** not evaluated in the code (no ARIA-attribute audit or accessibility testing artifacts were found); the standalone pronunciation prototype explicitly requires Chrome/Edge (Web Speech API), which is itself an accessibility/compatibility gap worth naming.

**AI reliability:** bounded by real safeguards (see above) but also by real, code-confirmed weak points: MCQ correctness sometimes falls back to a word-overlap heuristic rather than a verified ground truth; evaluation of free-text answers is LLM-graded with an explicitly "generous" rubric (subjective, not deterministic); the History subject's hardcoded 6-lesson assumption means the RAG/validation pipeline is not yet subject-generalized to arbitrary textbooks.

**Limitations, summarized:** single-student concurrency; no automated tests; default-insecure configuration; two divergent frontends with unmerged feature sets; a Unity/WebGL "lab" that is currently only vendor scaffolding; parent notifications with no delivery/UI path; no formal grade/GPA system in the active frontend.

---

## 22. Future Work

Grounded in the gaps actually observed in the code (not aspirational marketing):

1. **Production backend hardening**: override all insecure defaults (`SECRET_KEY`, `ADMIN_PASSWORD`, `DEBUG`), restrict CORS, add JWT-based auth to the currently-open `/session/*`/`/books/*` endpoints, add rate limiting on AI-backed and auth endpoints.
2. **Multi-student concurrency**: replace the single global `ACTIVE_SESSION` with a per-student session store (the JSON-file pattern already used elsewhere in `session_engine.py` could be extended, or moved to Redis/Postgres for proper concurrency).
3. **Real database migration for AI-teacher state**: move progress/plan/exam/evaluation JSON files into PostgreSQL (or another ACID store) to get transactional safety and remove the "last write wins" JSON race condition.
4. **Teacher/parent portals**: build the guardian-facing UI that currently doesn't exist (only a public, unauthenticated `GET /notifications/parent` endpoint exists server-side); wire automatic notification triggers to lesson-completion/evaluation events.
5. **Unify the two frontends**: either port the legacy `frontend`'s unique features (grade report, games, space-themed content, Sora video pipeline) into `malsy-ui`, or make a deliberate, documented decision to retire them.
6. **Better RAG evaluation**: replace the hardcoded History 6-lesson assumption with a general validator; add automated retrieval-quality tests (§20); resolve the duplicate-prompt-constant bug in `prompts.py`; decide whether to keep or remove the unused `teacher_prompt_pack.py` guided-generation pipeline.
7. **Unity/WebGL virtual lab completion**: either implement the three documented Unity C# bridge scripts and a real Unity WebGL build, or formally redirect the "virtual lab" effort toward extending the already-working Three.js prototype (`test2/app.js`) with lab-specific 3D content — and in either case, link specific Science lessons to specific lab experiments (the `LabExperiment.content_id` field is ready for this but unused today).
8. **Accessibility improvements**: replace/augment the Chrome/Edge-only Web Speech API pronunciation prototype with the already-more-robust backend wav2vec2 path; add ARIA auditing across both frontends.
9. **Analytics**: the admin analytics endpoint currently reports only coarse counts (students-by-grade, books-by-status/subject); richer engagement/retention analytics (time-on-task, hint-usage rates, per-section mastery trends) would need new aggregation code.
10. **Deployment/DevOps**: no Dockerfile, CI pipeline, or infra-as-code exists; introducing containerization and a CI test gate (once §20's test suite exists) is a clear next step.
11. **User studies**: no usability/learning-outcome study artifacts exist in the repo; a real deployment with homeschooling families would be needed to validate the pedagogical claims made in Chapter 1/2 of the thesis.

---

## 23. Thesis-Ready Technical Summary

MALSY is implemented as a service-oriented prototype comprising a Python/FastAPI backend and two TypeScript/Next.js frontends, unified by a shared REST/JSON contract. The backend's persistence layer is deliberately heterogeneous: PostgreSQL (accessed asynchronously via SQLAlchemy 2.0 and `asyncpg`) holds identity, scheduling, enrollment, attendance, and assessment records, chosen for its relational integrity guarantees on data with genuine foreign-key relationships; a flat JSON-file store (`backend/app/storage.py`) holds the substantially larger volume of AI-tutoring runtime state — per-student progress cursors, generated lesson plans, exam instances, and evaluation summaries — a pragmatic but non-transactional choice that trades ACID guarantees for implementation speed during prototyping; and a local ChromaDB instance provides vector similarity search over textbook content ingested through a bespoke PDF-to-chunk-to-embedding pipeline.

The system's central technical contribution is its **retrieval-scoped lesson-teaching pipeline**, implemented as a LangGraph state machine (`lesson_graph.py`) that enforces textbook fidelity through two complementary mechanisms depending on subject: a "mapping-first" strategy for English and Science that prefers previously-computed lesson-to-chunk mappings over live vector search, and a strict lesson-identifier-filtered retrieval for History that discards any chunk not provably belonging to the requested lesson and fails closed (raising an explicit error) rather than degrading to potentially irrelevant content. Generated multiple-choice questions are further protected by a multi-strategy answer-key resolver (`ensure_mcq_integrity`) that reconciles a language model's stated correct answer against its own options via exact match, substring match, and two levels of word-overlap scoring against a required verbatim source quotation — a defense against a well-known failure mode of LLM-generated assessment content (the model stating an answer that does not literally appear among its own options).

Progress gating is implemented as a monotonic, two-level unlock state machine: book-level lesson unlocking (`session_engine.is_lesson_unlocked`/`record_lesson_passed`) and within-lesson section/part unlocking (`save_progress`'s `max_unlocked_part` tracking), both of which are combined at schedule-rendering time with a day-based scheduling layer that reconciles two independently-computed lock states — a database-backed sequential "slot" unlock chain and a JSON-backed "true" content-progress lock — via an explicit, documented override rule that always keeps the day's next pending lesson reachable regardless of the underlying content-progress chain. This design choice reflects a deliberate pedagogical stance (a homeschooling student should never find *today* entirely blocked) implemented as an override rather than a redesign of the underlying locking logic, which is a reasonable engineering trade-off for a prototype but introduces the two-source-of-truth reconciliation complexity documented in `admin_student_data._admin_schedule_status`.

The speech subsystem is notable for using phoneme-level rather than orthographic comparison for pronunciation assessment: reference phonemes are generated via the `espeak-ng` grapheme-to-phoneme engine, student speech is transcribed directly to a phoneme sequence via a fine-tuned wav2vec2 CTC model (`facebook/wav2vec2-lv-60-espeak-cv-ft`), and the two sequences are compared using classical Levenshtein edit-distance, both at the whole-utterance and per-word (via a dynamic-programming segmentation) level. This is architecturally sound but constrained to a single reference accent (US English), a limitation explicitly worth surfacing in the thesis's evaluation chapter. Text-to-speech and avatar animation are decoupled: TTS defaults to OpenAI's cloud API with an offline Piper/Coqui fallback, while avatar lip-sync is driven by a client-side hybrid of a text-derived viseme heuristic and real-time frequency-band analysis of the synthesized audio — a practical middle ground between a fully text-driven (inaccurate) and a fully phoneme-aligned (implementation-heavy) lip-sync approach.

Two architectural risks should be foregrounded in the thesis's limitations discussion: the backend's teaching-session state is held in a single global in-memory variable explicitly documented in the source as "single-student mode," meaning the current implementation is a functional single-tenant prototype rather than a multi-student production system; and authentication coverage is inconsistent — the relational-data REST routers are uniformly JWT-protected, but the AI-teaching endpoints defined directly in `main.py` (`/session/*`, most of `/books/*`) accept an unauthenticated, client-supplied `student_id`, meaning the security boundary that exists elsewhere in the system does not yet extend to its core teaching functionality. Both are correctly framed as prototype-stage findings rather than design failures, and both have a clear, code-consistent remediation path documented in §22.

---

## 24. Missing Information Needed for Final Thesis

The following cannot be determined from static code analysis alone and should be gathered directly (from the running system, the developer, or supplementary documentation) before finalizing the thesis:

1. **Exact installed package versions** — `requirements.txt` is entirely unpinned; a `pip freeze` from the actual working environment is needed for a reproducible "Implementation" chapter appendix.
2. **Live performance figures** — response latency for lesson generation, TTS synthesis time, RAG retrieval time, ingestion time per book — none of this is logged/benchmarked in the repository; would require running the system and measuring.
3. **Actual deployment target** (if any) — no Dockerfile, CI config, or hosting documentation exists; whether this ever ran outside `localhost` is unknown from the code.
4. **Which frontend is intended to be the thesis's "final" system** — `malsy-ui` is clearly the actively developed one by commit recency, but the thesis should state explicitly whether the legacy `frontend`'s unique features (grades, games, space content) are considered in-scope, deprecated, or "future work merge candidates" — this is a product decision the code cannot answer.
5. **Whether a real PostgreSQL database has ever been populated with realistic multi-student data**, or whether all development/testing happened with a single seeded student — relevant to how confidently §21's scalability claims can be extended.
6. **User/usability study data** — no user-testing artifacts exist in-repo; any claims about learner engagement, effectiveness, or homeschooling-parent feedback must come from outside this codebase.
7. **The actual value of `OPENAI_MODEL`/`TTS_BACKEND` used in the demonstrated/defended version of the system** — these are environment-configured and not committed; the thesis defense should state which model/backend was active during any demo.
8. **Intended scope of the Unity/WebGL lab** — whether the project genuinely intends to ship a Unity build, or whether the working Three.js prototype in `test2/` is the intended long-term direction, is a product decision not resolvable from the code (§18).
9. **Legal/compliance considerations** for handling minors' data (COPPA/GDPR-K equivalent) — nothing in the code addresses this, and it is out of scope for static analysis but likely relevant to a "Discussion"/"Future Work" chapter about a children's education product.
10. **Any load/concurrency testing** confirming or refuting the single-in-memory-session limitation's real-world impact — this documentation states the limitation as read from code; its practical severity under real multi-student load has not been measured.
