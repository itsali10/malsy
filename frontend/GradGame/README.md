# 🎓 Malsy — AI-Powered Online Learning Platform

> An intelligent, interactive, and kid-friendly online school platform designed to make learning engaging, structured, and measurable for students aged 6–14.

---

## 📌 Project Title

**Malsy — AI-Powered Online Learning Platform**

A fully client-side, browser-based educational portal that combines structured curriculum delivery, an AI instructor avatar, smart grade tracking, gamification, and a personalized learning assistant — all in one platform.

---

## 📖 Project Overview

Malsy is a modern educational web platform built to simulate the experience of an AI-powered online school. Students log in to a personalized dashboard, progress through sequentially unlocked lessons across three core subjects, interact with an AI guide character (Prof. Malsy), receive adaptive recommendations, track their academic performance through a weighted grading system, and engage with educational mini-games.

The platform was designed with three priorities:

1. **Engagement** — Kid-friendly visuals, animations, achievement badges, streak tracking, and gamified learning keep students motivated.
2. **Structure** — Lessons are unlocked sequentially, mirroring a real classroom where foundational knowledge must be acquired before advancing.
3. **Measurability** — A rigorous, weighted grading system with two semesters, multiple components, and automatic grade calculation gives educators and students clear academic visibility.

What makes Malsy unique is the integration of a persistent **AI Speaking Teacher** (Prof. Malsy) — a full-body animated instructor character displayed in the sidebar that speaks contextual messages based on student progress, celebrates lesson completions, and is architected as a **Unity-ready slot** so a real 3D character can be embedded without any structural change.

---

## 🎯 Objectives of the Project

1. Provide a structured, sequential learning environment that mirrors a real school curriculum.
2. Increase student motivation through gamification: achievement badges, streaks, progress bars, and celebration animations.
3. Deliver personalized AI-driven guidance that adapts to each student's progress and recommends the next step.
4. Implement a complete, transparent, and automated academic grading system across two semesters.
5. Support interactive skill practice — specifically oral reading with real-time pronunciation feedback using the browser's speech recognition API.
6. Create a Unity-ready architecture so 3D avatar content can be embedded into the platform without rebuilding any UI.
7. Follow clean architecture principles so the codebase is modular, testable, and easy to extend.

---

## 👥 Target Audience

| Group | Description |
|---|---|
| **Primary students (ages 6–14)** | The core users. The UI uses large fonts, friendly colors, emojis, and rewards to suit younger learners. |
| **Teachers / Educators** | Can monitor grade reports, lesson completion, and manage student accounts. |
| **Schools and institutions** | Can deploy Malsy as a supplementary digital learning portal. |
| **Parents** | Can view their child's progress, weekly activity, and grade report at a glance. |

The platform is specifically suited for this audience because:
- The visual design is soft, colorful, and inviting without being distracting.
- Language is friendly and encouraging ("Let's Go!", "Great Job!", "You completed this lesson! 🎉").
- The AI instructor and chatbot reduce the need for adult supervision during independent study.
- Progress is always visible, giving students a sense of accomplishment and direction.

---

## 🧠 System Architecture

Malsy follows a **Modular Clean Architecture** pattern applied to a vanilla JavaScript frontend. The codebase is divided into distinct layers, each with a single responsibility.

### Architecture Layers

```
┌─────────────────────────────────────────────────┐
│              UI Layer (HTML + CSS)               │
│  dashboard.html  subject.html  grades.html ...   │
├─────────────────────────────────────────────────┤
│            Controller Layer (JS pages)           │
│  dashboard.js  subject.js  grades.js  login.js   │
├─────────────────────────────────────────────────┤
│              Feature Layer                       │
│  reading-exercise.js  achievements.js            │
│  instructor-avatar.js                            │
├─────────────────────────────────────────────────┤
│              Service Layer                       │
│  auth-service.js     progress-service.js         │
│  chatbot-service.js  grade-calculator.js         │
│  grade-report.js     grade-database.js           │
├─────────────────────────────────────────────────┤
│              Core & Model Layer                  │
│  learning-config.js  Grade.js  Semester.js       │
│  AcademicRecord.js                               │
├─────────────────────────────────────────────────┤
│              Utility Layer                       │
│  grade-validator.js  grade-helpers.js            │
├─────────────────────────────────────────────────┤
│              Data Layer                          │
│  database.js  (localStorage)                     │
└─────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Role |
|---|---|
| **UI (HTML/CSS)** | Defines page structure and visual design. Contains no business logic. |
| **Controllers (.js page files)** | Orchestrate user interactions, call services, and update the DOM. |
| **Features** | Self-contained interactive modules (reading exercise modal, achievement system, avatar widget). |
| **Services** | Reusable business logic: authentication, progress calculation, grade computation, chatbot responses. |
| **Core / Models** | Data shape definitions and centralized curriculum configuration — the single source of truth. |
| **Utils** | Pure helper functions: validation, formatting, letter grade conversion. |
| **Data Layer** | All `localStorage` read/write operations are isolated here. No other layer touches storage directly. |

---

## 🛠️ Technologies & Languages Used

| Technology | Why Chosen | Used For |
|---|---|---|
| **HTML5** | Universal browser support; semantic markup | Page structure for all screens |
| **CSS3** | No build tools required; powerful enough for full design systems | Animations, layout (Grid/Flexbox), responsive design, design tokens via custom properties |
| **JavaScript (ES6+)** | Runs natively in the browser; IIFE modules keep code clean | All business logic, DOM manipulation, session management, grade calculations |
| **Web Speech API** | Built into modern browsers; no external library needed | Microphone-based oral reading exercise with real-time transcription |
| **localStorage** | Browser-native; zero setup | Persistent student data, session tokens, progress, achievements, and grades |
| **Google Fonts (Nunito)** | Rounded, friendly letterforms suited to children | Typography across the entire platform |
| **Unity WebGL (planned)** | Industry-standard 3D engine | Full-body AI instructor avatar (slot is built and ready) |

---

## 🚀 Features

### 🔐 Authentication
- Secure student signup with name, ID, and password.
- Session-based login with token stored in `localStorage`.
- Route guards on all pages — unauthenticated users are redirected to login.
- Safe logout that clears the session token.

### 🖥️ Student Dashboard
- Personalized, time-aware greeting ("Good morning, Sara 👋").
- **Profile chip** pinned to the sticky header — student photo, full name, and ID always visible.
- **Streak counter** tracking consecutive days of activity.
- **AI Recommendation Banner** — analyses progress across all subjects and recommends the single most impactful next action.
- **Subject cards** with animated progress bars per subject.
- **Quick Access** cards for Educational Games and Grade Report.
- **Achievement showcase** displaying earned and locked badges.

### 👩‍🏫 AI Speaking Teacher (Prof. Malsy)
- Full-body instructor character displayed as a tall, cinematic panel in the dashboard sidebar.
- Built from a layered CSS character: graduation cap, animated blinking face, professional blouse and skirt, shoes.
- Dark stage background with perspective grid, radial floor glow, and breathing float animation.
- Cycles through personalised contextual messages based on the student's actual progress.
- Integrated speech bubble that updates every 5 seconds.
- **Unity-ready**: one function call swaps the CSS figure for a live Unity WebGL iframe — no layout changes needed.
- On subject and grades pages, a compact floating version of the instructor appears (bottom-left) with page-specific messages and a `celebrate()` animation triggered on every lesson completion.

### 📚 Subjects & Lessons
- **Three core subjects**: English, Science, Social Studies.
- Sequential locking — a lesson unlocks only after the previous one is completed.
- Each lesson has a name, description, completion status, and locked/active state clearly communicated.
- Inline toast notifications on lesson completion.

### 🗣️ Reading Exercise (English)
- Microphone-based oral reading exercise embedded in English lessons.
- Student reads sentences aloud; the browser transcribes speech in real time.
- Each word is graded using **Levenshtein distance similarity**:
  - 🟢 **Excellent** (≥ 90% match)
  - 🔵 **Good** (≥ 70% match)
  - 🟠 **Wrong / Missed** (below threshold)
- A total score is computed and displayed.
- Completing the reading exercise automatically marks the lesson as done.

### ⚗️ Chemistry Lab (Science)
- Reserved as a Unity WebGL integration slot within the Science subject.
- A dedicated card with visual placeholder is displayed in the lesson list.
- Tracked separately in the progress system.

### 🌍 Social Studies Sections
- Divided into two independent sections: **History** and **Geography**.
- Each section has its own sequential lessons and video upload slots for teacher-uploaded content.

### 🎮 Educational Games
- **Hangman** — guess the hidden word before the figure is drawn. Best score tracked per student.
- **Spelling Bee** — listen and spell challenging words correctly. Best score tracked per student.

### 📊 Grade Report System
- Dedicated grade report page with per-subject tabs (English, Science, Social Studies).
- Two semesters per academic year, each with five grade components.
- Weighted automatic calculation — no manual arithmetic needed.
- Missing grades handled gracefully with proportional weight redistribution.
- Printable report via the browser's native print dialog.
- Year grade displayed as a numeric score, letter grade, and pass/fail status.

### 🏅 Achievements & Gamification
- Badge system with multiple achievement definitions (first login, lesson completion, lab visit, streak milestones, etc.).
- New badge earned → animated toast notification slides in from the top-right.
- All badges shown on the dashboard (earned = coloured; locked = greyed out).
- Weekly activity dots showing which days the student visited.

### 🤖 AI Chatbot
- Floating chat button (bottom-right) opens a popup chat window.
- Responds to questions about progress, subjects, and next steps.
- Welcome message personalised with the student's name.
- Available exclusively on the dashboard.

---

## 🧭 User Journey

### Step 1 — Create an Account
The student visits `login.html` and clicks **Sign Up**. They enter their full name, a student ID, and a password. The account is saved locally and a session is created.

### Step 2 — Log In
Returning students enter their ID and password. The system validates credentials, creates a session token, and redirects to the dashboard.

### Step 3 — Access the Dashboard
The dashboard loads with:
- A personalized greeting in the sticky header.
- The student's photo, name, and ID pinned in the top-right profile chip.
- **Prof. Malsy** (the AI teacher) displayed as a standing character in the sidebar, speaking a welcome message.
- An AI recommendation banner suggesting the next lesson.
- Subject cards with current progress percentages.

### Step 4 — Choose a Subject
The student clicks a subject card (English, Science, or Social Studies). They are taken to `subject.html?subject=english` (or science / socialStudies).

### Step 5 — Start Lessons
The subject page displays all lessons. Completed lessons are marked green. The next available lesson is highlighted. Locked lessons are dimmed.

The student clicks an available lesson to open its detail panel.

- **English lessons** show a "🎤 Start Reading Exercise" button. The student reads sentences aloud and receives instant word-by-word feedback. Completing the exercise marks the lesson done.
- **Science / Social Studies lessons** have a "Mark Lesson as Completed" button.

Prof. Malsy celebrates every completion with a bounce animation and a congratulatory message.

### Step 6 — Progress Through the Curriculum
Each subject has 9 lessons. Science additionally includes the Chemistry Lab. Social Studies has History and Geography tracks, each with independent lesson sequences.

### Step 7 — View Grades and Progress
From the dashboard, the student clicks **Grade Report**. They select a subject tab and enter grades for Semester 1 and Semester 2 (quizzes, assignments, midterm, participation, final exam). The system instantly calculates:
- Quiz average
- Weighted semester grade
- Year grade, letter grade, and pass/fail status

### Step 8 — Interact with the AI Assistant
The student clicks the **"💬 Ask Malsy"** button (bottom-right). The chat popup opens. They can type any question — the chatbot responds with contextual guidance, progress updates, or subject advice.

### Step 9 — Play Educational Games
From the **Quick Access** section, the student opens the Games hub. They choose Hangman or Spelling Bee, play for a score, and their best result is saved to their profile.

### Step 10 — Track Improvement
The dashboard always reflects the current state:
- Progress bars update after each lesson.
- Weekly activity dots fill in on each visit day.
- New badges appear as milestones are reached.
- The AI banner updates its recommendation to reflect what's left to do.

---

## 📚 Subjects Breakdown

### 📖 English

| Detail | Description |
|---|---|
| **Lessons** | 9 sequential lessons |
| **Topics** | Grammar foundations, vocabulary, reading comprehension, writing skills, punctuation, creative writing |
| **Key Feature** | Oral reading exercise with microphone-based pronunciation grading |
| **Skills Developed** | Reading fluency, spelling accuracy, sentence construction, written expression |
| **Why It Matters** | English is the foundation for all academic study and communication. Strong early English skills directly impact performance in every other subject. |

**Example Lesson Activities:**
- Listen to a passage and read it aloud; receive per-word accuracy scores.
- Identify parts of speech in sample sentences.
- Complete fill-in-the-blank grammar exercises.

---

### 🔬 Science

| Detail | Description |
|---|---|
| **Lessons** | 9 sequential lessons + Chemistry Lab |
| **Topics** | Scientific method, biology basics, physics concepts, chemistry fundamentals, the environment |
| **Key Feature** | Dedicated Chemistry Lab slot (Unity WebGL ready) for interactive 3D experiments |
| **Skills Developed** | Scientific reasoning, hypothesis formation, experimental observation, data interpretation |
| **Why It Matters** | Science literacy equips students to understand the natural world and prepares them for STEM pathways. |

**Example Lesson Activities:**
- Step through a virtual scientific method scenario.
- Identify living and non-living things.
- Visit the Chemistry Lab to conduct guided experiments (Unity phase).

---

### 🌍 Social Studies

| Detail | Description |
|---|---|
| **Sections** | History and Geography (independent tracks) |
| **Lessons** | Each section has its own sequentially unlocked lessons |
| **Topics** | Ancient civilizations, world history, maps, continents, cultures, economies |
| **Key Feature** | Video upload slots per section for teacher-provided documentary and lecture content |
| **Skills Developed** | Historical thinking, spatial awareness, cultural empathy, critical analysis |
| **Why It Matters** | Understanding history and geography builds civic awareness and global citizenship, skills increasingly important in a connected world. |

**Example Lesson Activities:**
- Read about an ancient civilization and answer comprehension questions.
- Identify countries and capitals on an interactive map.
- Watch a teacher-uploaded video on a historical event and reflect.

---

## 📊 Grading System Explanation

### Academic Structure

Each subject operates on a **two-semester academic year**. Both semesters are assessed independently and then averaged for the year grade.

### Weight Distribution (per Semester)

| Component | Weight | Notes |
|---|---|---|
| Quiz 1 | 10% | Part of combined quiz average |
| Quiz 2 | 10% | Part of combined quiz average |
| **Quiz Average** | **20%** | Average of Quiz 1 and Quiz 2 |
| Assignment / Project | 20% | Coursework submitted during semester |
| Midterm Exam | 20% | Mid-semester written examination |
| Participation | 10% | In-class or platform engagement |
| Final Exam | 30% | End-of-semester written examination |
| **Total** | **100%** | |

### How Calculations Work

**Step 1 — Quiz Average:**
```
quizAverage = (quiz1 + quiz2) / 2
```

**Step 2 — Semester Grade:**
```
semesterGrade = (quizAverage × 0.20)
              + (assignment   × 0.20)
              + (midterm      × 0.20)
              + (participation× 0.10)
              + (finalExam    × 0.30)
```

**Step 3 — Year Grade:**
```
yearGrade = (semester1Grade + semester2Grade) / 2
```

**Missing Grades:** If a grade component has not been entered, its weight is proportionally redistributed among the components that do have values, ensuring the result always maps to the 0–100 scale.

### Letter Grade Scale

| Score Range | Letter Grade | Classification |
|---|---|---|
| 90 – 100 | A+ | Distinction |
| 85 – 89 | A | Distinction |
| 80 – 84 | A− | Distinction |
| 75 – 79 | B+ | Merit |
| 70 – 74 | B | Merit |
| 65 – 69 | B− | Merit |
| 60 – 64 | C+ | Pass |
| 55 – 59 | C | Pass |
| 50 – 54 | C− | Pass |
| 45 – 49 | D | Borderline |
| Below 45 | F | Fail |

**Pass Threshold: 50**

---

## 🧩 Project Structure

```
GradGame/
│
├── core/
│   └── learning-config.js          # Single source of truth for all subjects,
│                                   # lessons, and reading exercise sentences
│
├── models/
│   ├── Grade.js                    # Grade type definitions and factory
│   ├── Semester.js                 # Semester weights and structure
│   └── AcademicRecord.js          # Full academic year record per student/subject
│
├── services/
│   ├── auth-service.js             # Session validation, route protection, logout
│   ├── progress-service.js         # Progress %, lesson locking, completion API
│   ├── chatbot-service.js          # AI chatbot response logic
│   ├── grade-calculator.js         # Pure grade calculation (quiz avg, semester, year)
│   ├── grade-report.js             # Structured report generation per student/year
│   └── grade-database.js          # Grade persistence in localStorage
│
├── utils/
│   ├── grade-validator.js          # Input validation (0–100, numeric, required)
│   └── grade-helpers.js            # Rounding, letter grades, pass/fail, CSS classes
│
├── features/
│   ├── reading-exercise.js         # Microphone reading modal + Levenshtein scoring
│   ├── achievements.js             # Badge system: definitions, unlock logic, storage
│   └── instructor-avatar.js        # Floating AI guide widget (non-dashboard pages)
│
├── database.js                     # Data layer: students, sessions, progress, games
│
├── login.html / login.js           # Authentication: signup + login pages
├── dashboard.html / dashboard.js   # Main student hub with AI teacher panel
├── subject.html / subject.js       # Dynamic subject + lesson viewer
├── grades.html / grades.js         # Grade entry, calculation, and report viewer
├── games.html / games.js           # Educational games hub
├── hangman.html / hangman.js       # Hangman word-guessing game
├── spelling-bee.html / spelling-bee.js  # Spelling challenge game
├── index.html                      # Chemistry lab (Unity integration landing)
│
├── styles-dashboard.css            # Dashboard design system and component styles
├── styles-subject.css              # Subject and lesson page styles
├── styles-grades.css               # Grade report page styles
├── styles-reading.css              # Reading exercise modal styles
├── styles-instructor.css           # Floating instructor avatar widget styles
│
└── README.md                       # This file
```

---

## ▶️ How to Run the Project

### Prerequisites
- A modern web browser (Chrome or Edge recommended for Web Speech API support).
- [Node.js](https://nodejs.org/) installed (only needed to run the local server).

### Step-by-Step Setup

**1. Download or Clone the Repository**
```bash
git clone https://github.com/your-username/your-repo.git
cd GradGame
```

**2. Start a Local Web Server**

The project must be served over HTTP (not opened as a file) because the browser requires a server context for `localStorage`, the Speech API, and module scripts.

```bash
npx serve -l 5500 .
```

This command downloads and runs a simple static server. No installation needed.

**3. Open the Platform**

Open your browser and go to:
```
http://localhost:5500/login.html
```

**4. Create a Student Account**

- Click **Sign Up**.
- Enter your full name, a student ID (e.g., `2024001`), and a password.
- Click **Create Account** — you will be redirected to the dashboard.

**5. Explore**

| Page | URL |
|---|---|
| Login / Signup | `http://localhost:5500/login.html` |
| Dashboard | `http://localhost:5500/dashboard.html` |
| English Subject | `http://localhost:5500/subject.html?subject=english` |
| Science Subject | `http://localhost:5500/subject.html?subject=science` |
| Social Studies | `http://localhost:5500/subject.html?subject=socialStudies` |
| Grade Report | `http://localhost:5500/grades.html` |
| Games Hub | `http://localhost:5500/games.html` |

> **Note:** Use Chrome or Edge for the best experience. The oral reading exercise requires microphone access and the Web Speech API, which is best supported in Chromium-based browsers.

### Enabling the Unity Teacher Avatar

When a Unity WebGL build is ready, open the browser console on `dashboard.html` and run:
```javascript
window.enableUnityTeacher('path/to/unity/build/index.html');
```
The CSS character in the sidebar is replaced by the live Unity iframe — no code changes needed.

---

## 💡 Future Improvements

| Feature | Description |
|---|---|
| **AI Personalisation Engine** | Use machine learning to adapt lesson difficulty and pacing based on each student's performance history. |
| **Backend & Database** | Replace `localStorage` with a real server (Node.js + PostgreSQL) to support multi-device access and teacher dashboards. |
| **More Subjects** | Add Mathematics, Arabic Language, Islamic Studies, and Art as full subject tracks. |
| **Teacher Portal** | Separate login for teachers to upload videos, create quizzes, grade assignments, and view class-wide analytics. |
| **Mobile App** | Convert the platform to a React Native or Flutter mobile app for iOS and Android. |
| **Live Unity Avatar** | Integrate a fully animated, voice-responsive 3D teacher character via Unity WebGL. |
| **Parent Dashboard** | A read-only view for parents showing their child's progress, grades, and weekly activity. |
| **Push Notifications** | Remind students of incomplete lessons or upcoming exam dates. |
| **Offline Mode** | Use Service Workers and IndexedDB to allow the platform to work without an internet connection. |
| **Accessibility** | Full WCAG 2.1 compliance — screen reader support, keyboard navigation, and high-contrast mode. |

---

## 🧾 Notes & Assumptions

- **No backend**: This project runs entirely in the browser using `localStorage`. All student data is stored locally on the device used for login. Clearing browser data will reset all progress.
- **Authentication security**: The current implementation stores hashed passwords client-side for demonstration purposes. Production deployment must use server-side authentication with bcrypt, HTTPS, and proper session management.
- **Web Speech API**: Oral reading exercises require Chrome or Edge. Other browsers may not support the `SpeechRecognition` API. A fallback manual-completion button is always available.
- **Unity spaces**: The Chemistry Lab and the AI Speaking Teacher panel are reserved integration points. The CSS placeholders are production-quality and swap seamlessly for Unity WebGL iframes when the builds are ready.
- **Data migration**: If a student account was created in an earlier version of the platform, the `normalizeStudent()` function in `database.js` automatically migrates their data to the current schema on first login.
- **Academic year**: The grade report uses the current calendar year as the academic year (retrieved via `new Date().getFullYear()`).
- **Browser compatibility**: Tested on Chrome 120+ and Edge 120+. Basic functionality works on Firefox, but the reading exercise is unavailable.

---

## 📄 License

This project was developed as an academic graduation project. All rights reserved.  
For academic, demonstration, and portfolio use only.

---

<div align="center">
  <strong>Built with ❤️ for students who love to learn.</strong><br>
  <em>Malsy — Where every lesson is a step forward.</em>
</div>
