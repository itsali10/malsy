// Reading Exercise Feature
// Provides speech-recognition-based sentence reading with word-level colour feedback.

window.readingExercise = (() => {
    const EXCELLENT_THRESHOLD = 0.9;
    const GOOD_THRESHOLD = 0.6;

    let currentSentence = '';
    let sentences = [];
    let sentenceIndex = 0;
    let recognition = null;
    let isListening = false;
    let onCompletedCallback = null;

    // ─── Public API ──────────────────────────────────────────────────────────────

    function open(lessonSentences, lessonName, onCompleted) {
        sentences = [...lessonSentences];
        sentenceIndex = 0;
        onCompletedCallback = onCompleted || null;

        if (!document.getElementById('readingExerciseModal')) {
            buildModal();
        }

        setModalTitle(lessonName);
        loadSentence(sentenceIndex);
        showModal();
        initSpeechRecognition();
    }

    function close() {
        stopListening();
        hideModal();
    }

    // ─── Modal Construction ───────────────────────────────────────────────────────

    function buildModal() {
        const overlay = document.createElement('div');
        overlay.id = 'readingExerciseModal';
        overlay.className = 'rx-overlay hidden';

        overlay.innerHTML = `
            <div class="rx-panel" role="dialog" aria-modal="true" aria-label="Reading Exercise">
                <button class="rx-close" id="rxCloseBtn" type="button" aria-label="Close">×</button>

                <p class="rx-lesson-title" id="rxLessonTitle"></p>

                <div class="rx-score-badge" id="rxScoreBadge">
                    <span class="rx-score-icon">😐</span>
                    <span class="rx-score-value" id="rxScoreValue">—</span>
                    <span class="rx-score-label">pts</span>
                    <span class="rx-score-icon">😐</span>
                </div>

                <div class="rx-legend">
                    <span class="rx-legend-dot excellent"></span> Excellent
                    <span class="rx-legend-dot good"></span> Good
                    <span class="rx-legend-dot wrong"></span> Wrong / Missed
                </div>

                <div class="rx-sentence-box" id="rxSentenceBox"></div>

                <div class="rx-status" id="rxStatus">Press the microphone button to start reading.</div>

                <div class="rx-counter" id="rxCounter"></div>

                <div class="rx-controls">
                    <button class="rx-btn rx-btn-retry" id="rxRetryBtn" type="button" title="Try again">↺</button>
                    <button class="rx-btn rx-btn-speak" id="rxSpeakBtn" type="button" title="Start speaking">🎤</button>
                    <button class="rx-btn rx-btn-next" id="rxNextBtn" type="button" title="Next sentence">→</button>
                </div>

                <div class="rx-no-support hidden" id="rxNoSupport">
                    Your browser does not support speech recognition. Try Chrome or Edge.
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        bindModalEvents();
    }

    function bindModalEvents() {
        document.getElementById('rxCloseBtn').addEventListener('click', close);
        document.getElementById('rxRetryBtn').addEventListener('click', () => loadSentence(sentenceIndex));
        document.getElementById('rxNextBtn').addEventListener('click', advanceSentence);
        document.getElementById('rxSpeakBtn').addEventListener('click', () => {
            if (isListening) {
                stopListening();
            } else {
                startListening();
            }
        });

        document.getElementById('readingExerciseModal').addEventListener('click', (event) => {
            if (event.target === event.currentTarget) {
                close();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                close();
            }
        });
    }

    // ─── Sentence Display ─────────────────────────────────────────────────────────

    function loadSentence(index) {
        stopListening();
        currentSentence = sentences[index] || '';
        const sentenceBox = document.getElementById('rxSentenceBox');
        const counter = document.getElementById('rxCounter');
        const status = document.getElementById('rxStatus');
        const scoreBadge = document.getElementById('rxScoreBadge');
        const scoreValue = document.getElementById('rxScoreValue');
        const nextBtn = document.getElementById('rxNextBtn');

        sentenceBox.innerHTML = buildWordSpans(currentSentence, []);
        counter.textContent = `Sentence ${index + 1} of ${sentences.length}`;
        status.textContent = 'Press the microphone button to start reading.';
        scoreBadge.className = 'rx-score-badge';
        scoreValue.textContent = '—';
        nextBtn.disabled = false;

        setSpeakBtnState('idle');
    }

    function buildWordSpans(sentence, scoredWords) {
        const clean = sentence.replace(/[.,!?]/g, '');
        const words = clean.split(/\s+/).filter(Boolean);

        return words.map((word, index) => {
            const scored = scoredWords[index];
            const cssClass = scored ? `rx-word ${scored.grade}` : 'rx-word';
            return `<span class="${cssClass}">${word}</span>`;
        }).join(' ') + (sentence.match(/[.,!?]$/) ? sentence.slice(-1) : '');
    }

    function setModalTitle(name) {
        document.getElementById('rxLessonTitle').textContent = name;
    }

    function advanceSentence() {
        if (sentenceIndex < sentences.length - 1) {
            sentenceIndex += 1;
            loadSentence(sentenceIndex);
        } else {
            showCompletionMessage();
        }
    }

    function showCompletionMessage() {
        const status = document.getElementById('rxStatus');
        status.textContent = 'All sentences completed. Great work!';
        document.getElementById('rxNextBtn').disabled = true;
        if (typeof onCompletedCallback === 'function') {
            onCompletedCallback();
        }
    }

    // ─── Speech Recognition ───────────────────────────────────────────────────────

    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            document.getElementById('rxNoSupport').classList.remove('hidden');
            document.getElementById('rxSpeakBtn').disabled = true;
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            handleTranscript(transcript);
        };

        recognition.onerror = () => {
            setStatus('Could not understand. Try speaking more clearly.');
            setSpeakBtnState('idle');
            isListening = false;
        };

        recognition.onend = () => {
            isListening = false;
            setSpeakBtnState('idle');
        };
    }

    function startListening() {
        if (!recognition) {
            return;
        }
        isListening = true;
        setSpeakBtnState('listening');
        setStatus('Listening… read the sentence aloud.');
        recognition.start();
    }

    function stopListening() {
        if (recognition && isListening) {
            isListening = false;
            recognition.abort();
        }
        setSpeakBtnState('idle');
    }

    function setSpeakBtnState(state) {
        const btn = document.getElementById('rxSpeakBtn');
        if (!btn) {
            return;
        }
        if (state === 'listening') {
            btn.textContent = '⏹';
            btn.classList.add('listening');
            btn.title = 'Stop';
        } else {
            btn.textContent = '🎤';
            btn.classList.remove('listening');
            btn.title = 'Start speaking';
        }
    }

    function setStatus(text) {
        const el = document.getElementById('rxStatus');
        if (el) {
            el.textContent = text;
        }
    }

    // ─── Scoring ──────────────────────────────────────────────────────────────────

    function handleTranscript(transcript) {
        const expectedWords = tokenize(currentSentence);
        const spokenWords = tokenize(transcript);
        const scoredWords = expectedWords.map((word, index) => {
            const spoken = spokenWords[index] || '';
            const similarity = wordSimilarity(word, spoken);
            const grade = gradeWord(similarity, spoken);
            return { word, spoken, similarity, grade };
        });

        const score = computeScore(scoredWords);
        displayResult(scoredWords, score);
    }

    function tokenize(text) {
        return text.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/).filter(Boolean);
    }

    function wordSimilarity(expected, spoken) {
        if (!spoken) {
            return 0;
        }
        if (expected === spoken) {
            return 1;
        }
        const distance = levenshtein(expected, spoken);
        const maxLength = Math.max(expected.length, spoken.length);
        return 1 - distance / maxLength;
    }

    function gradeWord(similarity, spoken) {
        if (!spoken) {
            return 'wrong';
        }
        if (similarity >= EXCELLENT_THRESHOLD) {
            return 'excellent';
        }
        if (similarity >= GOOD_THRESHOLD) {
            return 'good';
        }
        return 'wrong';
    }

    function computeScore(scoredWords) {
        if (scoredWords.length === 0) {
            return 0;
        }
        const total = scoredWords.reduce((sum, entry) => {
            if (entry.grade === 'excellent') return sum + 1;
            if (entry.grade === 'good') return sum + 0.5;
            return sum;
        }, 0);
        return Math.round((total / scoredWords.length) * 100);
    }

    function displayResult(scoredWords, score) {
        const sentenceBox = document.getElementById('rxSentenceBox');
        const scoreValue = document.getElementById('rxScoreValue');
        const scoreBadge = document.getElementById('rxScoreBadge');

        sentenceBox.innerHTML = scoredWords.map((entry) => `
            <span class="rx-word ${entry.grade}">${entry.word}</span>
        `).join(' ');

        scoreValue.textContent = `${score}/100`;
        scoreBadge.className = `rx-score-badge score-${gradeLabel(score)}`;
        setStatus(motivationalMessage(score));
    }

    function gradeLabel(score) {
        if (score >= 85) return 'excellent';
        if (score >= 55) return 'good';
        return 'wrong';
    }

    function motivationalMessage(score) {
        if (score >= 85) return 'Excellent reading! Keep it up!';
        if (score >= 55) return 'Good effort! Try again to improve.';
        return 'Keep practising! You will get better.';
    }

    // ─── Levenshtein distance ─────────────────────────────────────────────────────

    function levenshtein(a, b) {
        const m = a.length;
        const n = b.length;
        const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
        for (let j = 0; j <= n; j += 1) {
            dp[0][j] = j;
        }
        for (let i = 1; i <= m; i += 1) {
            for (let j = 1; j <= n; j += 1) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
        }
        return dp[m][n];
    }

    // ─── Modal Visibility ─────────────────────────────────────────────────────────

    function showModal() {
        const overlay = document.getElementById('readingExerciseModal');
        if (overlay) {
            overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    function hideModal() {
        const overlay = document.getElementById('readingExerciseModal');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    return { open, close };
})();
