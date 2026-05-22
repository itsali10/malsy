// Instructor Avatar — Persistent Guide Character
//
// Self-contained module: injects its own DOM, styles, and behaviour.
// Works on every page. Speaks context-aware messages.
// Unity-ready: call instructorAvatar.enableUnity(iframeSrc) to embed a 3D build.
//
// Public API:
//   instructorAvatar.init(options)
//   instructorAvatar.speak(message, actionLabel?, actionFn?, autoDismissMs?)
//   instructorAvatar.celebrate()
//   instructorAvatar.enableUnity(iframeSrc)

window.instructorAvatar = (() => {

    // ── Context messages ───────────────────────────────────────────────────────

    const PAGE_MESSAGES = {
        dashboard: {
            default:  "Welcome back! Let's continue your learning journey today! 🌟",
            noProgress: "Hi! I'm Prof. Malsy — your guide throughout your studies. Let's start with English!",
            allDone:  "Outstanding! You've completed everything! Check your grade report. 🏆"
        },
        english:  "Let's practise reading and writing together today! 📚",
        science:  "Science is amazing! Ready to explore experiments? 🔬",
        history:  "Let's travel back in time and learn history! 🏛️",
        geography:"Let's explore countries, maps, and cultures of the world! 🗺️",
        socialStudies: "Social Studies covers history, geography, and cultures. Let's dive in! 🌍",
        games:    "Learning through play is the best way! Let's go! 🎮",
        grades:   "Let's review your grades and celebrate your progress! 📊",
        chemLab:  "Welcome to the Chemistry Lab! Remember: safety first! ⚗️",
        hangman:  "Guess the hidden word — one letter at a time! Good luck! 🎯",
        spelling: "Show off your spelling skills! You've got this! 🐝"
    };

    const INSTRUCTOR_NAME = "Prof. Malsy";

    let _bubbleVisible = false;
    let _autoDismissTimer = null;

    // ── Injection ──────────────────────────────────────────────────────────────

    function injectStyles() {
        if (document.querySelector('link[data-instructor]')) { return; }
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = resolveRoot() + 'styles-instructor.css';
        link.setAttribute('data-instructor', '1');
        document.head.appendChild(link);
    }

    function resolveRoot() {
        const path = window.location.pathname;
        if (path.includes('/features/') || path.includes('/services/')) {
            return '../';
        }
        return '';
    }

    function buildWidget() {
        if (document.getElementById('instructorWidget')) { return; }

        const widget = document.createElement('div');
        widget.id        = 'instructorWidget';
        widget.className = 'instructor-widget';

        widget.innerHTML = `
            <!-- Speech bubble -->
            <div class="instructor-bubble" id="instBubble" role="status" aria-live="polite">
                <button class="bubble-close" id="instBubbleClose" title="Dismiss">×</button>
                <p class="bubble-label">${INSTRUCTOR_NAME}</p>
                <p class="bubble-text"  id="instBubbleText"></p>
                <button class="bubble-action" id="instBubbleAction"></button>
            </div>

            <!-- Character body -->
            <div class="instructor-body" id="instBody" title="Click to hear from ${INSTRUCTOR_NAME}">
                <div class="instructor-char" id="instChar">
                    <!-- Unity canvas replaces this when uploaded -->
                    <iframe class="instructor-unity-frame" id="instUnityFrame" title="Unity Avatar" allowfullscreen></iframe>

                    <!-- CSS-drawn teacher character (default) -->
                    <div class="inst-face-wrap">
                        <span class="inst-cap">🎓</span>
                        <div class="inst-face">
                            <div class="inst-eyes">
                                <div class="inst-eye"></div>
                                <div class="inst-eye"></div>
                            </div>
                            <div class="inst-smile"></div>
                        </div>
                    </div>

                    <!-- Online indicator -->
                    <div class="inst-online" title="Online"></div>
                </div>
            </div>

            <!-- Name tag -->
            <div class="instructor-name-tag" id="instNameTag">👩‍🏫 ${INSTRUCTOR_NAME}</div>
        `;

        document.body.appendChild(widget);
        bindWidgetEvents();
    }

    function bindWidgetEvents() {
        document.getElementById('instBody').addEventListener('click', () => {
            if (_bubbleVisible) {
                hideBubble();
            } else {
                showBubble();
            }
        });

        document.getElementById('instBubbleClose').addEventListener('click', (e) => {
            e.stopPropagation();
            hideBubble();
        });
    }

    // ── Bubble control ─────────────────────────────────────────────────────────

    function showBubble() {
        const bubble = document.getElementById('instBubble');
        if (!bubble) { return; }
        bubble.classList.add('visible');
        _bubbleVisible = true;
    }

    function hideBubble() {
        const bubble = document.getElementById('instBubble');
        if (!bubble) { return; }
        bubble.classList.remove('visible');
        _bubbleVisible = false;
        clearTimeout(_autoDismissTimer);
    }

    // ── Public: speak ──────────────────────────────────────────────────────────

    /**
     * Show a message in the speech bubble.
     * @param {string}       message
     * @param {string|null}  actionLabel   - Optional button label
     * @param {Function|null}actionFn      - Callback when button clicked
     * @param {number}       autoDismissMs - Auto-hide after N ms (0 = stay)
     */
    function speak(message, actionLabel = null, actionFn = null, autoDismissMs = 0) {
        const textEl   = document.getElementById('instBubbleText');
        const actionEl = document.getElementById('instBubbleAction');
        if (!textEl || !actionEl) { return; }

        textEl.textContent = message;

        if (actionLabel && actionFn) {
            actionEl.textContent = actionLabel;
            actionEl.classList.add('visible');
            actionEl.onclick = () => {
                hideBubble();
                actionFn();
            };
        } else {
            actionEl.classList.remove('visible');
        }

        showBubble();
        clearTimeout(_autoDismissTimer);
        if (autoDismissMs > 0) {
            _autoDismissTimer = setTimeout(hideBubble, autoDismissMs);
        }
    }

    // ── Public: celebrate ──────────────────────────────────────────────────────

    function celebrate() {
        speak("Amazing job! You completed this lesson! 🎉🌟", null, null, 4000);
        const charEl = document.getElementById('instChar');
        if (!charEl) { return; }
        charEl.classList.add('celebrate');
        charEl.addEventListener('animationend', () => {
            charEl.classList.remove('celebrate');
        }, { once: true });
    }

    // ── Public: enableUnity ────────────────────────────────────────────────────

    /**
     * Swap the CSS face for a Unity WebGL iframe.
     * @param {string} iframeSrc - URL of the Unity WebGL build index.html
     */
    function enableUnity(iframeSrc) {
        const widget = document.getElementById('instructorWidget');
        const frame  = document.getElementById('instUnityFrame');
        if (!widget || !frame) { return; }
        frame.src = iframeSrc;
        widget.classList.add('unity-active');
    }

    // ── Context message resolver ───────────────────────────────────────────────

    function getContextMessage(context, student) {
        if (context === 'dashboard') {
            if (!student) {
                return PAGE_MESSAGES.dashboard.default;
            }
            const hasProgress =
                student.progress.english.lessonsCompleted > 0 ||
                student.progress.science.lessonsCompleted > 0 ||
                student.progress.socialStudies.lessonsCompleted > 0;

            if (!hasProgress) {
                return PAGE_MESSAGES.dashboard.noProgress;
            }

            const allDone =
                student.progress.english.lessonsCompleted  >= student.progress.english.totalLessons &&
                student.progress.science.lessonsCompleted  >= student.progress.science.totalLessons;

            return allDone
                ? PAGE_MESSAGES.dashboard.allDone
                : PAGE_MESSAGES.dashboard.default;
        }

        return PAGE_MESSAGES[context] || PAGE_MESSAGES.dashboard.default;
    }

    // ── Public: init ───────────────────────────────────────────────────────────

    /**
     * Initialise the widget on any page.
     * @param {object} options
     * @param {string}  options.context      - e.g. 'dashboard', 'english', 'games'
     * @param {object}  [options.student]    - Student object for personalised messages
     * @param {string}  [options.nameOverride] - Override instructor name shown in tag
     */
    function init(options = {}) {
        injectStyles();
        buildWidget();

        if (options.nameOverride) {
            const tag = document.getElementById('instNameTag');
            if (tag) { tag.textContent = `👩‍🏫 ${options.nameOverride}`; }
        }

        const message = getContextMessage(options.context || 'dashboard', options.student || null);

        // Greet after a short delay so page renders first
        setTimeout(() => {
            speak(message, null, null, 7000);
        }, 900);
    }

    return { init, speak, celebrate, enableUnity };
})();
