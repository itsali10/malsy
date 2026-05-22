// Spelling Bee Game Logic

const spellingWords = [
    { word: 'CHEMISTRY', hint: 'The study of matter and chemicals', difficulty: 1 },
    { word: 'EXPERIMENT', hint: 'A scientific test', difficulty: 1 },
    { word: 'MOLECULE', hint: 'A group of atoms', difficulty: 2 },
    { word: 'GRAMMAR', hint: 'Rules of language', difficulty: 1 },
    { word: 'VOCABULARY', hint: 'Words you know', difficulty: 2 },
    { word: 'SENTENCE', hint: 'A complete thought in words', difficulty: 1 },
    { word: 'CONTINENT', hint: 'Large landmasses', difficulty: 1 },
    { word: 'CIVILIZATION', hint: 'Advanced society', difficulty: 3 },
    { word: 'GOVERNMENT', hint: 'System that rules', difficulty: 2 },
    { word: 'EDUCATION', hint: 'Process of learning', difficulty: 1 },
    { word: 'KNOWLEDGE', hint: 'Information you know', difficulty: 2 },
    { word: 'SCIENCE', hint: 'Study of nature', difficulty: 1 },
    { word: 'MATHEMATICS', hint: 'Study of numbers', difficulty: 2 },
    { word: 'GEOGRAPHY', hint: 'Study of Earth', difficulty: 2 },
    { word: 'HISTORY', hint: 'Study of the past', difficulty: 1 },
    { word: 'LITERATURE', hint: 'Written works', difficulty: 2 },
    { word: 'PHYSICS', hint: 'Study of motion and energy', difficulty: 2 },
    { word: 'BIOLOGY', hint: 'Study of living things', difficulty: 2 },
    { word: 'ASTRONOMY', hint: 'Study of space', difficulty: 3 },
    { word: 'PRONUNCIATION', hint: 'How to say a word', difficulty: 3 }
];

let currentWord = null;
let score = 0;
let level = 1;
let correctCount = 0;
let totalWords = 10;
let currentRound = 0;
let hintUsed = false;

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const currentSession = localStorage.getItem('currentSession');
    if (!currentSession || !db.getSession(currentSession)) {
        window.location.href = 'login.html';
        return;
    }

    // Load best score
    const studentData = JSON.parse(localStorage.getItem('currentStudent'));
    if (studentData) {
        const student = db.getStudentById(studentData.id);
        if (student) {
            document.getElementById('bestScore').textContent = student.games.spellingBee.bestScore;
        }
    }

    // Initialize game
    startNewGame();

    // Event listeners
    document.getElementById('submitBtn').addEventListener('click', checkSpelling);
    document.getElementById('spellingInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkSpelling();
        }
    });
    document.getElementById('audioBtn').addEventListener('click', playAudio);
    document.getElementById('newGameBtn').addEventListener('click', startNewGame);
    document.getElementById('hintBtn').addEventListener('click', showHint);
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'games.html';
    });
});

function startNewGame() {
    score = 0;
    level = 1;
    correctCount = 0;
    currentRound = 0;
    hintUsed = false;
    
    updateDisplay();
    loadNextWord();
}

function loadNextWord() {
    if (currentRound >= totalWords) {
        endGame();
        return;
    }

    // Filter words by difficulty level
    const availableWords = spellingWords.filter(w => w.difficulty <= level);
    currentWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    
    // Display word with blanks
    displayWord();
    document.getElementById('wordHint').textContent = '';
    document.getElementById('spellingInput').value = '';
    document.getElementById('spellingInput').focus();
    hintUsed = false;
    document.getElementById('hintBtn').disabled = false;
    
    currentRound++;
    updateDisplay();
}

function displayWord() {
    const wordDisplay = document.getElementById('wordDisplay');
    // Show word with some letters hidden
    const word = currentWord.word;
    const hiddenIndices = [];
    
    // Hide 30-50% of letters based on difficulty
    const hideCount = Math.ceil(word.length * (0.3 + (currentWord.difficulty * 0.1)));
    
    while (hiddenIndices.length < hideCount) {
        const index = Math.floor(Math.random() * word.length);
        if (!hiddenIndices.includes(index)) {
            hiddenIndices.push(index);
        }
    }
    
    let display = '';
    for (let i = 0; i < word.length; i++) {
        if (hiddenIndices.includes(i)) {
            display += '_ ';
        } else {
            display += word[i] + ' ';
        }
    }
    
    wordDisplay.textContent = display.trim();
}

function checkSpelling() {
    const input = document.getElementById('spellingInput').value.trim().toUpperCase();
    
    if (!input) {
        showMessage('Please enter a word!', 'error');
        return;
    }
    
    if (input === currentWord.word) {
        // Correct!
        let points = 10;
        if (!hintUsed) points += 5; // Bonus for not using hint
        points += (currentWord.difficulty * 5); // Bonus for difficulty
        
        score += points;
        correctCount++;
        
        showMessage(`Correct! +${points} points! 🎉`, 'success');
        updateDisplay();
        
        setTimeout(() => {
            loadNextWord();
        }, 1500);
        
        // Level up every 3 correct words
        if (correctCount % 3 === 0 && level < 3) {
            level++;
            showMessage(`Level Up! Now at Level ${level}`, 'success');
        }
    } else {
        showMessage(`Incorrect! The word was: ${currentWord.word}`, 'error');
        setTimeout(() => {
            loadNextWord();
        }, 2000);
    }
}

function showHint() {
    if (!hintUsed) {
        document.getElementById('wordHint').textContent = `Hint: ${currentWord.hint}`;
        hintUsed = true;
        document.getElementById('hintBtn').disabled = true;
    }
}

function playAudio() {
    // Use Web Speech API to pronounce the word
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(currentWord.word);
        utterance.lang = 'en-US';
        utterance.rate = 0.8;
        speechSynthesis.speak(utterance);
    } else {
        showMessage('Audio not supported in your browser', 'error');
    }
}

function updateDisplay() {
    document.getElementById('score').textContent = score;
    document.getElementById('level').textContent = level;
    document.getElementById('correctCount').textContent = correctCount;
    document.getElementById('totalWords').textContent = totalWords;
    
    const progress = (currentRound / totalWords) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
}

function endGame() {
    const finalScore = score;
    showMessage(`Game Complete! Final Score: ${finalScore}`, 'success');
    
    // Update best score
    updateBestScore(finalScore);
    
    setTimeout(() => {
        if (confirm(`Game Over! Your score: ${finalScore}\n\nPlay again?`)) {
            startNewGame();
        } else {
            window.location.href = 'games.html';
        }
    }, 2000);
}

function updateBestScore(finalScore) {
    const studentData = JSON.parse(localStorage.getItem('currentStudent'));
    if (studentData && finalScore > 0) {
        db.updateGameScore(studentData.id, 'spellingBee', finalScore);
        const student = db.getStudentById(studentData.id);
        if (student) {
            document.getElementById('bestScore').textContent = student.games.spellingBee.bestScore;
            localStorage.setItem('currentStudent', JSON.stringify(db.sanitizeStudent(student)));
        }
    }
}

function showMessage(text, type) {
    const message = document.getElementById('message');
    message.textContent = text;
    message.className = `message ${type}`;
    message.style.display = 'block';
    
    setTimeout(() => {
        message.style.display = 'none';
    }, 3000);
}

