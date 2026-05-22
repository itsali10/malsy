// Subject Page Controller

const subjectPageState = {
    subject: null,
    studentId: null,
    selectedLesson: null
};

document.addEventListener('DOMContentLoaded', () => {
    const authContext = authService.requireActiveStudent();
    if (!authContext) {
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const subject = urlParams.get('subject');
    if (!subject || !['english', 'science', 'socialStudies'].includes(subject)) {
        window.location.href = 'dashboard.html';
        return;
    }

    subjectPageState.subject = subject;
    subjectPageState.studentId = authContext.student.id;
    document.getElementById('subjectTitle').textContent = learningConfig[subject].title;

    renderSubjectPage();
    bindGlobalEvents();
    instructorAvatar.init({ context: subject, student: authContext.student });
});

function bindGlobalEvents() {
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });
}

function renderSubjectPage() {
    const student = db.getStudentById(subjectPageState.studentId);
    const contentContainer = document.getElementById('subjectContent');

    if (subjectPageState.subject === 'socialStudies') {
        renderSocialStudies(contentContainer, student);
    } else {
        renderLinearSubject(contentContainer, student, subjectPageState.subject);
    }
}

function renderLinearSubject(container, student, subjectKey) {
    const config = learningConfig[subjectKey];
    const progress = student.progress[subjectKey];

    const chemistryLabCard = subjectKey === 'science'
        ? `
            <section class="option-large" id="chemistryLabCard">
                <div class="option-icon">⚗️</div>
                <h2>${config.chemistryLab.title}</h2>
                <p>${config.chemistryLab.description}</p>
                <p class="option-description">The card is active now and can point to your Unity build whenever you upload it.</p>
                <button class="btn-start" id="enterChemistryLabBtn">Open Chemistry Lab</button>
            </section>
        `
        : '';

    const spaceSection = subjectKey === 'science'
        ? buildVideoSection('🚀', 'Learn About Space', 'science')
        : '';

    container.innerHTML = `
        <div class="subject-layout">
            ${chemistryLabCard}
            <div class="science-content-grid">
                <section>
                    <div class="lessons-container">
                        ${config.lessons.map((lesson) => createLinearLessonCard(lesson, progress.completedLessons)).join('')}
                    </div>
                </section>
                <aside class="lesson-detail-panel" id="lessonDetailPanel">
                    ${buildEmptyDetailPanel(config.title)}
                </aside>
            </div>
            ${spaceSection}
        </div>
    `;

    bindLinearLessonEvents(subjectKey);
    if (subjectKey === 'science') {
        bindChemistryLabEvent();
    }
}

function createLinearLessonCard(lesson, completedLessons) {
    const completed = completedLessons.includes(lesson.id);
    const locked = progressService.isLinearLessonLocked(completedLessons, lesson.id) && !completed;
    const statusClass = completed ? 'completed' : (locked ? 'locked' : 'available');
    const statusText = completed ? 'Completed' : (locked ? 'Locked' : 'Ready to Start');

    return `
        <article class="lesson-card ${statusClass}" data-lesson="${lesson.id}">
            <div class="lesson-number">Lesson ${lesson.id}</div>
            <h3>${lesson.name}</h3>
            <p>${lesson.description}</p>
            <div class="lesson-status">${statusText}</div>
        </article>
    `;
}

function bindLinearLessonEvents(subjectKey) {
    document.querySelectorAll('.lesson-card').forEach((card) => {
        card.addEventListener('click', () => {
            const lessonNumber = Number(card.dataset.lesson);
            openLinearLesson(subjectKey, lessonNumber);
        });
    });
}

function openLinearLesson(subjectKey, lessonNumber) {
    const student = db.getStudentById(subjectPageState.studentId);
    const config = learningConfig[subjectKey];
    const progress = student.progress[subjectKey];
    const lesson = config.lessons.find((item) => item.id === lessonNumber);
    const isCompleted = progress.completedLessons.includes(lessonNumber);
    const isLocked = progressService.isLinearLessonLocked(progress.completedLessons, lessonNumber) && !isCompleted;

    const detailPanel = document.getElementById('lessonDetailPanel');
    if (isLocked) {
        detailPanel.innerHTML = `
            <h3>Lesson ${lessonNumber} is locked</h3>
            <p>Complete Lesson ${lessonNumber - 1} first to unlock this lesson.</p>
        `;
        return;
    }

    const hasReadingExercise = subjectKey === 'english' && Array.isArray(lesson.readingExercises) && lesson.readingExercises.length > 0;

    detailPanel.innerHTML = `
        <h3>${lesson.name}</h3>
        <p>${lesson.description}</p>
        <div class="detail-status ${isCompleted ? 'completed' : 'active'}">
            ${isCompleted ? 'This lesson is completed.' : 'This lesson is ready.'}
        </div>
        ${hasReadingExercise && !isCompleted ? `
            <button class="rx-open-btn" id="startReadingBtn">
                🎤 Start Reading Exercise
            </button>
        ` : ''}
        <button class="btn-start ${isCompleted ? 'btn-disabled' : ''}" id="completeLessonBtn" ${isCompleted ? 'disabled' : ''} style="margin-top:10px;">
            ${isCompleted ? 'Already Completed' : 'Mark Lesson as Completed'}
        </button>
    `;

    if (hasReadingExercise && !isCompleted) {
        document.getElementById('startReadingBtn').addEventListener('click', () => {
            readingExercise.open(
                lesson.readingExercises,
                lesson.name,
                () => {
                    progressService.completeLesson(subjectPageState.studentId, subjectKey, lessonNumber);
                    showInlineToast(`Reading complete! Lesson ${lessonNumber} marked as done.`);
                    instructorAvatar.celebrate();
                    renderSubjectPage();
                }
            );
        });
    }

    if (!isCompleted) {
        document.getElementById('completeLessonBtn').addEventListener('click', () => {
            progressService.completeLesson(subjectPageState.studentId, subjectKey, lessonNumber);
            showInlineToast(`Great work! Lesson ${lessonNumber} completed.`);
            instructorAvatar.celebrate();
            renderSubjectPage();
        });
    }
}

function bindChemistryLabEvent() {
    const button = document.getElementById('enterChemistryLabBtn');
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        db.setChemistryLabVisited(subjectPageState.studentId);
        window.location.href = 'index.html';
    });
}

function renderSocialStudies(container, student) {
    const socialConfig = learningConfig.socialStudies;
    const socialProgress = student.progress.socialStudies.sections;

    const sectionIcons = { history: '🏛️', geography: '🗺️' };
    const videoTitles  = { history: 'History Videos', geography: 'Geography Videos' };

    container.innerHTML = `
        <div class="subject-layout social-layout">
            <section class="social-sections">
                ${socialConfig.sections.map((section) => `
                    <div class="social-section-block">
                        <h2>${sectionIcons[section.key] || '📖'} ${section.title}</h2>
                        <div class="lessons-container">
                            ${section.lessons.map((lesson) => createSocialLessonCard(section.key, lesson, socialProgress[section.key])).join('')}
                        </div>
                        ${buildVideoSection(sectionIcons[section.key] || '📹', videoTitles[section.key] || section.title + ' Videos', section.key)}
                    </div>
                `).join('')}
            </section>
            <aside class="lesson-detail-panel" id="lessonDetailPanel">
                ${buildEmptyDetailPanel('Social Studies')}
            </aside>
        </div>
    `;

    bindSocialLessonEvents();
}

function createSocialLessonCard(sectionKey, lesson, completedLessons) {
    const isCompleted = completedLessons.includes(lesson.id);
    const isLocked = progressService.isSocialLessonLocked(completedLessons, lesson.id) && !isCompleted;
    const statusClass = isCompleted ? 'completed' : (isLocked ? 'locked' : 'available');
    const statusText = isCompleted ? 'Completed' : (isLocked ? 'Locked' : 'Ready to Start');

    return `
        <article class="lesson-card ${statusClass}" data-section="${sectionKey}" data-lesson="${lesson.id}">
            <div class="lesson-number">${sectionKey.toUpperCase()} - Lesson ${lesson.id}</div>
            <h3>${lesson.name}</h3>
            <p>${lesson.description}</p>
            <div class="lesson-status">${statusText}</div>
        </article>
    `;
}

// ── Video section builder ─────────────────────────────────────────────────────

function getVideosByCategory(category) {
    if (!window.videoManifest || !Array.isArray(window.videoManifest)) { return []; }
    return window.videoManifest.filter((v) => v.category === category);
}

function buildVideoSection(icon, sectionTitle, category) {
    const videos = getVideosByCategory(category);

    const inner = videos.length > 0
        ? `<div class="video-cards-grid">
               ${videos.map((v) => `
                   <div class="video-card">
                       <video class="video-player" controls preload="metadata">
                           <source src="videos/${v.file}" type="video/mp4">
                           Your browser does not support the video element.
                       </video>
                       <p class="video-card-title">${v.title}</p>
                   </div>
               `).join('')}
           </div>`
        : `<div class="video-empty-state">
               <span class="video-empty-icon">📂</span>
               <p class="video-empty-title">No videos uploaded yet</p>
               <p class="video-empty-hint">Add <code>.mp4</code> files to the <code>videos/</code> folder and register them in <code>videos/manifest.js</code> with <code>category: '${category}'</code>.</p>
           </div>`;

    return `
        <div class="video-section">
            <h3 class="video-section-title">${icon} ${sectionTitle}</h3>
            ${inner}
        </div>
    `;
}

function bindSocialLessonEvents() {
    document.querySelectorAll('.lesson-card').forEach((card) => {
        card.addEventListener('click', () => {
            const lessonNumber = Number(card.dataset.lesson);
            const sectionKey = card.dataset.section;
            openSocialLesson(sectionKey, lessonNumber);
        });
    });
}

function openSocialLesson(sectionKey, lessonNumber) {
    const student = db.getStudentById(subjectPageState.studentId);
    const sectionConfig = learningConfig.socialStudies.sections.find((section) => section.key === sectionKey);
    const lesson = sectionConfig.lessons.find((item) => item.id === lessonNumber);
    const completedLessons = student.progress.socialStudies.sections[sectionKey];
    const isCompleted = completedLessons.includes(lessonNumber);
    const isLocked = progressService.isSocialLessonLocked(completedLessons, lessonNumber) && !isCompleted;
    const detailPanel = document.getElementById('lessonDetailPanel');

    if (isLocked) {
        detailPanel.innerHTML = `
            <h3>Lesson ${lessonNumber} is locked</h3>
            <p>Complete ${sectionConfig.title} Lesson ${lessonNumber - 1} to unlock this lesson.</p>
        `;
        return;
    }

    detailPanel.innerHTML = `
        <h3>${sectionConfig.title}: ${lesson.name}</h3>
        <p>${lesson.description}</p>
        <div class="detail-status ${isCompleted ? 'completed' : 'active'}">
            ${isCompleted ? 'This lesson is completed.' : 'Ready for the student. Mark complete after finishing.'}
        </div>
        <button class="btn-start ${isCompleted ? 'btn-disabled' : ''}" id="completeLessonBtn" ${isCompleted ? 'disabled' : ''}>
            ${isCompleted ? 'Already Completed' : 'Mark Lesson as Completed'}
        </button>
    `;

    if (!isCompleted) {
        document.getElementById('completeLessonBtn').addEventListener('click', () => {
            progressService.completeLesson(subjectPageState.studentId, 'socialStudies', lessonNumber, sectionKey);
            showInlineToast(`${sectionConfig.title} lesson ${lessonNumber} completed.`);
            instructorAvatar.celebrate();
            renderSubjectPage();
        });
    }
}

function buildEmptyDetailPanel(subjectTitle) {
    return `
        <h3>${subjectTitle} Lesson Panel</h3>
        <p>Select any unlocked lesson to view details and mark progress.</p>
    `;
}

function showInlineToast(message) {
    let toast = document.getElementById('subjectToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'subjectToast';
        toast.className = 'subject-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2200);
}

