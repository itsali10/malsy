# 🎓 Malsy — AI-Powered Online Learning Platform

> An intelligent, interactive online school for students aged 6–14.  
> Built with HTML · CSS · JavaScript · Web Speech API

---

## 💡 What Is It?

Malsy is a browser-based educational platform that delivers structured lessons, an AI instructor avatar, real-time pronunciation practice, a weighted grading system, and educational games — all in one place, with no installation required.

---

## 🎯 Core Objectives

- Deliver a structured, sequential curriculum (English · Science · Social Studies)
- Motivate students through gamification (badges, streaks, progress bars)
- Automate academic grading across two full semesters
- Provide a persistent AI guide character throughout the student's journey
- Build a Unity-ready architecture for live 3D avatar integration

---

## 🚀 Key Features

| Feature | Description |
|---|---|
| 🖥️ Smart Dashboard | Personalized greeting, AI recommendations, progress bars, streak counter |
| 👩‍🏫 AI Speaking Teacher | Full-body animated instructor in the sidebar; Unity-ready slot |
| 📚 3 Subjects | 9 lessons each — sequentially unlocked; Chemistry Lab (Science) |
| 🗣️ Reading Exercise | Microphone-based oral reading with per-word accuracy scoring |
| 📊 Grade Report | Weighted 2-semester system with auto-calculation and printable PDF |
| 🎮 Educational Games | Hangman and Spelling Bee with personal best tracking |
| 🏅 Achievements | 10+ badges unlocked by real activity milestones |
| 🤖 AI Chatbot | Floating assistant that answers questions and suggests next steps |

---

## 📐 Architecture (Clean & Modular)

```
UI (HTML/CSS)  →  Controllers (JS)  →  Features  →  Services  →  Models / Utils  →  Data (localStorage)
```

Every layer has a single responsibility. Business logic never touches the DOM. Data never touches the UI.

---

## 📊 Grading System (at a glance)

| Component | Weight |
|---|---|
| Quiz Average (Q1 + Q2) | 20% |
| Assignment / Project | 20% |
| Midterm Exam | 20% |
| Participation | 10% |
| Final Exam | 30% |

`Year Grade = (Semester 1 + Semester 2) / 2` · Pass threshold: **50** · Grades: F → A+

---

## 🧭 Student Journey (10 Steps)

`Sign Up` → `Log In` → `Dashboard` → `Choose Subject` → `Complete Lessons` → `Reading Exercise` → `View Grades` → `Chat with AI` → `Play Games` → `Earn Badges`

---

## 🛠️ Technologies

`HTML5` · `CSS3` · `JavaScript ES6+` · `Web Speech API` · `localStorage` · `Google Fonts` · `Unity WebGL (planned)`

---

## 📁 Folder Structure

```
GradGame/
 ├── core/          Curriculum config (single source of truth)
 ├── models/        Grade, Semester, AcademicRecord data shapes
 ├── services/      Auth, progress, chatbot, grade calculator
 ├── utils/         Validators and grade helpers
 ├── features/      Reading exercise, achievements, avatar widget
 └── database.js    All localStorage operations
```

---

## ▶️ Run in 2 Steps

```bash
npx serve -l 5500 .          # Start local server
# Open → http://localhost:5500/login.html
```

---

## 🔮 What's Next

Mobile app · Real backend (Node.js + PostgreSQL) · Live Unity 3D avatar · Teacher portal · AI personalisation engine

---

*For full documentation see `README.md`*
