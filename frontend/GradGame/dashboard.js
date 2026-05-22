// Dashboard Controller
// Orchestrates all dashboard features: profile, progress, AI banner,
// weekly activity, achievements, navigation, and chatbot.

window.__teacherSpeechOverrideUntil = 0;

/** Temporarily overrides rotating teacher messages (e.g. subject carousel). */
window.flashTeacherMessage = function (text, ms = 5000) {
    const el = document.getElementById('atpMsg');
    if (!el) return;
    window.__teacherSpeechOverrideUntil = Date.now() + ms;
    el.style.transition = 'opacity 0.22s ease';
    el.style.opacity = '0';
    window.setTimeout(() => {
        el.textContent = text;
        el.style.opacity = '1';
    }, 230);
};

document.addEventListener('DOMContentLoaded', () => {
    const authContext = authService.requireActiveStudent();
    if (!authContext) {
        return;
    }

    const { student, sessionToken } = authContext;

    try {
        achievementsSystem.recordVisit(student.id);

        renderProfile(student);
        renderProgress(student);
        renderWeeklyActivity(student.id);
        renderAiBanner(student);
        renderAchievements(student);
        bindNavigationEvents(sessionToken);
        if (window.SubjectCarousel) {
            const carouselRoot = document.getElementById('subjectCarousel');
            if (carouselRoot) {
                window.SubjectCarousel.init({ root: carouselRoot });
            }
        }
        initializeChatbot(student);
        checkNewAchievements(student);

        initTeacherPanel(student);
        initSettings(student);
        renderFinalExamSchedule();
    } catch (err) {
        console.error('[dashboard] init error:', err);
        const greet = document.getElementById('headerGreeting');
        if (greet) {
            greet.textContent = 'Something went wrong loading the dashboard. Please refresh or log in again.';
        }
    }
});

// ── School schedule (day-by-day) ─────────────────────────────────────────────

function escapeHtml(text) {
    if (text == null) { return ''; }
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderFinalExamSchedule() {
    const root = document.getElementById('finalExamsSection');
    if (!root) { return; }

    const cfg = window.examScheduleConfig;
    if (!cfg || !Array.isArray(cfg.exams)) {
        root.innerHTML = '';
        return;
    }

    if (cfg.exams.length === 0) {
        root.innerHTML = `
            <div class="final-exams-card">
                <div class="fe-empty">
                    Your day-by-day schedule will appear here once your school adds events in
                    <code style="background:rgba(255,255,255,.15);padding:2px 6px;border-radius:4px;">core/exam-schedule-config.js</code>.
                </div>
            </div>`;
        return;
    }

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const sorted = [...cfg.exams].sort((a, b) => {
        const da = new Date(a.date + 'T12:00:00');
        const db = new Date(b.date + 'T12:00:00');
        if (da - db !== 0) return da - db;
        return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });

    let nextIndex = -1;
    for (let i = 0; i < sorted.length; i += 1) {
        const d = new Date(sorted[i].date + 'T12:00:00');
        d.setHours(0, 0, 0, 0);
        if (d >= todayMidnight) {
            nextIndex = i;
            break;
        }
    }

    const isoLocalToday = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    })();

    const dayOrder = [];
    const seenDates = new Set();
    sorted.forEach((e) => {
        if (!seenDates.has(e.date)) {
            seenDates.add(e.date);
            dayOrder.push(e.date);
        }
    });

    function dotClassFor(exam) {
        const k = exam.subjectKey;
        if (k === 'english') return 'english';
        if (k === 'science') return 'science';
        if (k === 'socialStudies') return 'social';
        return 'default';
    }

    function formatDayHeader(isoDate) {
        const d = new Date(isoDate + 'T12:00:00');
        return d.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    }

    let flatIdx = 0;
    const dayBlocks = dayOrder.map((dateIso) => {
        const items = sorted
            .filter((e) => e.date === dateIso)
            .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));

        const isToday = dateIso === isoLocalToday;

        const sessions = items.map((exam) => {
            const isNext = flatIdx === nextIndex;
            flatIdx += 1;

            const dc = dotClassFor(exam);
            const subj = escapeHtml(exam.subject || '');
            const room = escapeHtml(exam.room || '');
            const notes = escapeHtml(exam.notes || '');
            const t1 = escapeHtml(exam.startTime || '');
            const t2 = escapeHtml(exam.endTime || '');
            const metaParts = [];
            if (room) metaParts.push(room);
            if (notes) metaParts.push(notes);
            const meta = metaParts.length
                ? `<div class="fe-session-meta">${metaParts.join(' · ')}</div>`
                : '';

            return `
                <li class="fe-session ${isNext ? 'fe-session--next' : ''}">
                    <span class="fe-session-time">${t1} – ${t2}</span>
                    <div class="fe-session-main">
                        <span class="fe-dot ${dc}" aria-hidden="true"></span>
                        <span class="fe-session-subj">${subj}</span>
                        ${isNext ? '<span class="fe-next-badge">Next up</span>' : ''}
                    </div>
                    ${meta}
                </li>`;
        }).join('');

        return `
            <div class="fe-day-block ${isToday ? 'fe-day-block--today' : ''}">
                <div class="fe-day-head">
                    <span class="fe-day-title">${escapeHtml(formatDayHeader(dateIso))}</span>
                    ${isToday ? '<span class="fe-day-chip">Today</span>' : ''}
                </div>
                <ul class="fe-session-list" role="list">${sessions}</ul>
            </div>`;
    }).join('');

    const dayCount = dayOrder.length;

    root.innerHTML = `
        <p class="section-title" style="margin-bottom:14px;">
            📅 ${escapeHtml(cfg.title || 'School schedule')}
            <span class="title-pill" style="background:rgba(124,58,237,.15);color:var(--clr-primary);">${dayCount} day${dayCount === 1 ? '' : 's'} · ${sorted.length} session${sorted.length === 1 ? '' : 's'}</span>
        </p>
        <div class="final-exams-card">
            <div class="fe-header fe-header--schedule">
                <div class="fe-title-block">
                    <p class="fe-schedule-lead">${escapeHtml(cfg.subtitle || '')}</p>
                </div>
                ${cfg.academicYearLabel ? `<span class="fe-year-pill">${escapeHtml(cfg.academicYearLabel)}</span>` : ''}
            </div>
            <div class="fe-schedule-days">${dayBlocks}</div>
        </div>`;
}

// ── Profile ───────────────────────────────────────────────────────────────────

function renderProfile(student) {
    const safeName = student.name && String(student.name).trim() ? student.name : 'Student';
    const firstName = safeName.split(' ')[0];
    const fallback  = `https://via.placeholder.com/80/7c3aed/ffffff?text=${encodeURIComponent(firstName.charAt(0).toUpperCase())}`;
    const photo     = student.picture || fallback;

    // Header profile chip
    const headerPhoto = document.getElementById('headerPhoto');
    const headerName  = document.getElementById('headerName');
    const headerId    = document.getElementById('headerId');
    if (headerPhoto) { headerPhoto.src = photo; headerPhoto.alt = safeName; }
    if (headerName)  { headerName.textContent = safeName; }
    if (headerId)    { headerId.textContent = student.id; }

    // Personalised greeting
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const greetEl = document.getElementById('headerGreeting');
    if (greetEl) {
        greetEl.innerHTML =
            `${timeGreeting}, <span class="name-accent">${firstName}</span> 👋 Ready to learn?`;
    }

    // Streak count
    const streakEl = document.getElementById('streakCount');
    if (streakEl) {
        const days = achievementsSystem.getWeeklyActivity(student.id).filter((d) => d.active).length;
        streakEl.textContent = days;
    }
}

// ── Progress bars ─────────────────────────────────────────────────────────────

function renderProgress(student) {
    const e = progressService.getProgressPercent(student, 'english');
    const s = progressService.getProgressPercent(student, 'science');
    const o = progressService.getProgressPercent(student, 'socialStudies');

    setProgress('english', e);
    setProgress('science', s);
    setProgress('social',  o);
}

function setProgress(key, value) {
    // Sidebar bars
    const barEl  = document.getElementById(`${key === 'social' ? 'social' : key}Bar`);
    const pctEl  = document.getElementById(`${key === 'social' ? 'social' : key}Progress`);

    // Card bars (use same key map)
    const subjectKey = key === 'social' ? 'social' : key;
    const cardBar  = document.getElementById(`${subjectKey}CardBar`);
    const cardPct  = document.getElementById(`${subjectKey}CardPct`);

    if (barEl)  { barEl.style.width  = `${value}%`; }
    if (pctEl)  { pctEl.textContent  = `${value}%`; }
    if (cardBar) { cardBar.style.width = `${value}%`; }
    if (cardPct) { cardPct.textContent = `${value}%`; }
}

// ── Weekly activity dots ──────────────────────────────────────────────────────

function renderWeeklyActivity(studentId) {
    const days   = achievementsSystem.getWeeklyActivity(studentId);
    const labels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const container = document.getElementById('weekDots');
    if (!container) { return; }

    container.innerHTML = days.map((day) => {
        const dayOfWeek = new Date(day.date + 'T12:00:00').getDay();
        const emoji = day.active ? '✅' : '·';
        return `
            <div class="week-dot">
                <div class="dot-circle ${day.active ? 'active' : ''}">${emoji}</div>
                <span class="dot-label">${labels[dayOfWeek]}</span>
            </div>
        `;
    }).join('');
}

// ── AI Recommendation banner ──────────────────────────────────────────────────

function renderAiBanner(student) {
    const e = progressService.getProgressPercent(student, 'english');
    const s = progressService.getProgressPercent(student, 'science');
    const o = progressService.getProgressPercent(student, 'socialStudies');

    const title   = document.getElementById('aiBannerTitle');
    const body    = document.getElementById('aiBannerBody');
    const btn     = document.getElementById('aiBannerBtn');
    if (!title || !body || !btn) {
        return;
    }

    let recommendation = { subject: null, text: '', btn: 'Start Now →' };

    if (e === 0 && s === 0 && o === 0) {
        recommendation = {
            subject: 'english',
            text: 'Start with English Lesson 1 — Grammar Foundations. Your journey begins here!',
            btn: 'Start English →'
        };
    } else if (e < 100 && (e <= s) && (e <= o)) {
        recommendation = {
            subject: 'english',
            text: `You are ${e}% through English. Keep going — your next lesson is waiting!`,
            btn: `Continue English (${e}%) →`
        };
    } else if (s < 100 && (s <= o)) {
        recommendation = {
            subject: 'science',
            text: `You are ${s}% through Science. Let's explore more experiments!`,
            btn: `Continue Science (${s}%) →`
        };
    } else if (o < 100) {
        recommendation = {
            subject: 'socialStudies',
            text: `You are ${o}% through Social Studies. History and Geography await!`,
            btn: `Continue Social Studies (${o}%) →`
        };
    } else {
        recommendation = {
            subject: null,
            text: 'Amazing! You have completed all subjects. Try the games or review your grade report.',
            btn: 'View Grades →'
        };
    }

    const firstName = (student.name && String(student.name).trim())
        ? student.name.split(' ')[0]
        : 'there';
    title.textContent = `Hi ${firstName}! Here is what your AI tutor recommends today 🤖`;
    body.textContent  = recommendation.text;
    btn.textContent   = recommendation.btn;

    btn.addEventListener('click', () => {
        if (recommendation.subject) {
            window.location.href = `subject.html?subject=${recommendation.subject}`;
        } else {
            window.location.href = 'grades.html';
        }
    });
}

// ── Achievements ──────────────────────────────────────────────────────────────

function renderAchievements(student) {
    const earned  = achievementsSystem.getEarned(student.id);
    const all     = achievementsSystem.getAll();
    const grid    = document.getElementById('achievementsGrid');
    const counter = document.getElementById('badgeCount');
    if (!grid) { return; }

    if (counter) {
        counter.textContent = `${earned.length} earned`;
    }

    if (earned.length === 0) {
        grid.innerHTML = '<p class="no-badges">Complete lessons to earn your first badge! 🌟</p>';
        return;
    }

    const earnedIds = earned.map((b) => b.id);
    const chips = all.map((def) => {
        const isEarned = earnedIds.includes(def.id);
        return `
            <div class="badge-chip ${isEarned ? '' : 'badge-chip-locked'}" title="${def.description}">
                <span class="badge-chip-icon">${def.icon}</span>
                <div class="badge-chip-info">
                    <p class="badge-title">${def.title}</p>
                    <p class="badge-desc">${def.description}</p>
                </div>
            </div>
        `;
    });

    grid.innerHTML = chips.join('');
}

function checkNewAchievements(student) {
    const newBadges = achievementsSystem.checkAndUnlock(student);
    if (newBadges.length === 0) { return; }

    renderAchievements(student);

    newBadges.forEach((badge, index) => {
        window.setTimeout(() => {
            showAchievementToast(badge);
        }, index * 1800);
    });
}

function showAchievementToast(badge) {
    let toast = document.getElementById('achievementToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id        = 'achievementToast';
        toast.className = 'achievement-toast';
        document.body.appendChild(toast);
    }

    toast.innerHTML = `
        <div class="achievement-toast-title">${badge.icon} New Achievement Unlocked!</div>
        <div class="achievement-toast-body">${badge.title} — ${badge.description}</div>
    `;

    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
}

// ── Navigation ────────────────────────────────────────────────────────────────

function bindNavigationEvents(sessionToken) {
    const gamesCard = document.getElementById('gamesCard');
    if (gamesCard) {
        gamesCard.addEventListener('click', () => {
            window.location.href = 'games.html';
        });
    }

    const gradesCard = document.getElementById('gradesCard');
    if (gradesCard) {
        gradesCard.addEventListener('click', () => {
            window.location.href = 'grades.html';
        });
    }

    const historyVideosCard = document.getElementById('historyVideosCard');
    if (historyVideosCard) {
        historyVideosCard.addEventListener('click', () => {
            // Static path from GradGame root (not the ai-history-video server root on :3000)
            window.location.assign(new URL('ai-history-video/public/home.html?topic=history', window.location.href).href);
        });
    }

    const scienceVideosCard = document.getElementById('scienceVideosCard');
    if (scienceVideosCard) {
        scienceVideosCard.addEventListener('click', () => {
            window.location.assign(new URL('ai-history-video/public/space-learn/index.html', window.location.href).href);
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (window.confirm('Are you sure you want to logout?')) {
                authService.logout(sessionToken);
            }
        });
    }
}

// ── Chatbot popup ─────────────────────────────────────────────────────────────

function initializeChatbot(student) {
    const chatPopup    = document.getElementById('chatPopup');
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const chatCloseBtn  = document.getElementById('chatCloseBtn');
    const chatForm      = document.getElementById('chatForm');
    const chatInput     = document.getElementById('chatInput');
    const chatMessages  = document.getElementById('chatMessages');

    if (!chatPopup || !chatForm || !chatToggleBtn || !chatCloseBtn || !chatInput || !chatMessages) {
        return;
    }

    appendMessage('bot', chatbotService.getWelcomeMessage(student.name));

    chatToggleBtn.addEventListener('click', () => {
        const isHidden = chatPopup.classList.contains('hidden');
        if (isHidden) {
            openChat();
        } else {
            closeChat();
        }
    });

    chatCloseBtn.addEventListener('click', closeChat);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { closeChat(); }
    });

    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const question = chatInput.value.trim();
        if (!question) { return; }

        appendMessage('student', question);
        chatInput.value = '';

        const latestStudent = db.getStudentById(student.id) || student;
        const reply = chatbotService.respond(question, latestStudent);
        window.setTimeout(() => {
            appendMessage('bot', reply);
        }, 280);
    });

    function openChat() {
        chatPopup.classList.remove('hidden');
        chatToggleBtn.textContent = '✕ Close';
        chatInput.focus();
    }

    function closeChat() {
        chatPopup.classList.add('hidden');
        chatToggleBtn.textContent = '💬 Ask Malsy';
    }

    function appendMessage(sender, message) {
        const el = document.createElement('div');
        el.className   = `chat-message ${sender}`;
        el.textContent = message;
        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// ── Settings (Photo Upload) ───────────────────────────────────────────────────

function initSettings(student) {
    const overlay        = document.getElementById('settingsOverlay');
    const settingsBtn    = document.getElementById('settingsBtn');
    const closeBtn       = document.getElementById('settingsClose');
    const cancelBtn      = document.getElementById('cancelSettingsBtn');
    const fileInput      = document.getElementById('photoFileInput');
    const saveBtn        = document.getElementById('savePhotoBtn');
    const currentPhotoEl = document.getElementById('settingsCurrentPhoto');
    const newPhotoEl     = document.getElementById('settingsNewPhoto');
    const newPhotoFrame  = document.getElementById('newPhotoFrame');

    if (!overlay || !settingsBtn || !closeBtn || !cancelBtn || !fileInput || !saveBtn
        || !currentPhotoEl || !newPhotoEl || !newPhotoFrame) {
        return;
    }

    let pendingDataUrl = null;

    function openModal() {
        const latest = db.getStudentById(student.id);
        currentPhotoEl.src = latest.picture || document.getElementById('headerPhoto').src;
        pendingDataUrl = null;
        newPhotoFrame.classList.add('hidden');
        saveBtn.disabled = true;
        fileInput.value = '';
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    // Open via camera button on the profile chip
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal();
    });

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Close when clicking outside the modal card
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeModal(); }
    });

    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) { closeModal(); }
    });

    // File selected → resize → show preview
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) { return; }

        if (file.size > 5 * 1024 * 1024) {
            showSettingsError('Photo must be smaller than 5 MB.');
            fileInput.value = '';
            return;
        }

        resizeImageToDataUrl(file, 200, (dataUrl) => {
            pendingDataUrl = dataUrl;
            newPhotoEl.src = dataUrl;
            newPhotoFrame.classList.remove('hidden');
            saveBtn.disabled = false;
        });
    });

    // Save → persist + update all photo elements on screen
    saveBtn.addEventListener('click', () => {
        if (!pendingDataUrl) { return; }

        saveBtn.textContent = 'Saving…';
        saveBtn.disabled = true;

        try {
            db.updateStudentPhoto(student.id, pendingDataUrl);
        } catch (err) {
            console.error('[settings] save photo failed:', err);
            showSettingsError(err.message || 'Could not save photo. Storage may be full — try a smaller image.');
            saveBtn.textContent = '✅ Save Photo';
            saveBtn.disabled = false;
            return;
        }

        // Update every photo element on the page
        ['headerPhoto'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) { el.src = pendingDataUrl; }
        });

        // Update the AI teacher panel if it shows the student
        student.picture = pendingDataUrl;

        closeModal();

        saveBtn.textContent = '✅ Save Photo';
        saveBtn.disabled = false;

        showPhotoSavedToast();
    });
}

// Resize an image File to a square-capped JPEG data URL using <canvas>
function resizeImageToDataUrl(file, maxSize, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            if (width > maxSize || height > maxSize) {
                if (width >= height) {
                    height = Math.round((height / width) * maxSize);
                    width  = maxSize;
                } else {
                    width  = Math.round((width / height) * maxSize);
                    height = maxSize;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width  = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            let dataUrl;
            try {
                dataUrl = canvas.toDataURL('image/jpeg', 0.78);
            } catch (err) {
                console.warn('[settings] Could not export image (try another file):', err);
                showSettingsError('Could not process this image. Try JPG or PNG from your device.');
                return;
            }
            callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function showSettingsError(message) {
    let toast = document.getElementById('settingsErrorToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id        = 'settingsErrorToast';
        toast.className = 'achievement-toast';
        toast.style.background = '#dc2626';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<div class="achievement-toast-title">⚠️ ${message}</div>`;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function showPhotoSavedToast() {
    let toast = document.getElementById('photoSavedToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id        = 'photoSavedToast';
        toast.className = 'achievement-toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `
        <div class="achievement-toast-title">📷 Photo Updated!</div>
        <div class="achievement-toast-body">Your profile photo has been saved.</div>
    `;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── AI Teacher Panel ──────────────────────────────────────────────────────────

function initTeacherPanel(student) {
    const firstName = (student.name && String(student.name).trim())
        ? student.name.split(' ')[0]
        : 'friend';
    const e = progressService.getProgressPercent(student, 'english');
    const s = progressService.getProgressPercent(student, 'science');
    const o = progressService.getProgressPercent(student, 'socialStudies');

    const messages = buildTeacherMessages(firstName, e, s, o);

    let idx = 0;
    const msgEl = document.getElementById('atpMsg');
    if (!msgEl) { return; }

    msgEl.textContent = messages[0];

    // Cycle through messages every 5 seconds (paused while carousel flashes a line)
    setInterval(() => {
        if (Date.now() < (window.__teacherSpeechOverrideUntil || 0)) {
            return;
        }
        idx = (idx + 1) % messages.length;
        msgEl.style.opacity = '0';
        setTimeout(() => {
            msgEl.textContent = messages[idx];
            msgEl.style.opacity = '1';
        }, 300);
    }, 5000);
}

function buildTeacherMessages(name, engPct, sciPct, ssPct) {
    const all = [
        `Hello, ${name}! Ready to learn something amazing today? 🌟`,
        `You are doing great, ${name}! Keep up the momentum! 💪`,
    ];

    if (engPct < 100) {
        all.push(`English is ${engPct}% done. Let's practise reading together! 📚`);
    }
    if (sciPct < 100) {
        all.push(`Science is ${sciPct}% done. The lab awaits, ${name}! 🔬`);
    }
    if (ssPct < 100) {
        all.push(`Let's explore history and geography! ${ssPct}% done so far. 🌍`);
    }
    if (engPct === 100 && sciPct === 100 && ssPct === 100) {
        all.push(`Outstanding, ${name}! You have completed all subjects! 🏆`);
    }

    all.push('Swipe the subject cards or tap Start learning! 👇');
    all.push('I will celebrate every lesson you complete! 🎉');
    all.push('Try the Educational Games when you need a fun break! 🎮');

    return all;
}

// Call this from the browser console (or your Unity loader) to embed a Unity build:
// window.enableUnityTeacher('path/to/unity/build/index.html')
window.enableUnityTeacher = function (src) {
    const frame = document.getElementById('atpUnityFrame');
    const figure = document.getElementById('atpFigure');
    if (!frame || !figure) { return; }
    frame.src = src;
    figure.classList.add('unity-active');
};
