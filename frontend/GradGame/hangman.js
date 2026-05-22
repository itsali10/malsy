// Hangman Game Logic

const words = [
    { word: 'CHEMISTRY', hint: 'The study of matter and its properties', category: 'Science' },
    { word: 'EXPERIMENT', hint: 'A test to discover something', category: 'Science' },
    { word: 'MOLECULE', hint: 'A group of atoms bonded together', category: 'Science' },
    { word: 'GRAMMAR', hint: 'Rules for using language correctly', category: 'English' },
    { word: 'VOCABULARY', hint: 'Words you know and use', category: 'English' },
    { word: 'SENTENCE', hint: 'A group of words expressing a complete thought', category: 'English' },
    { word: 'CONTINENT', hint: 'Large landmasses on Earth', category: 'Geography' },
    { word: 'CIVILIZATION', hint: 'Advanced human society', category: 'History' },
    { word: 'GOVERNMENT', hint: 'System that rules a country', category: 'Social Studies' },
    { word: 'CULTURE', hint: 'Beliefs and customs of a group', category: 'Social Studies' },
    { word: 'EDUCATION', hint: 'Process of learning', category: 'General' },
    { word: 'KNOWLEDGE', hint: 'Information and understanding', category: 'General' },
    { word: 'STUDENT', hint: 'Someone who learns', category: 'General' },
    { word: 'TEACHER', hint: 'Someone who teaches', category: 'General' },
    { word: 'SCIENCE', hint: 'Study of the natural world', category: 'Science' }
];

let currentWord = '';
let guessedLetters = [];
let wrongGuesses = 0;
let score = 0;
let maxWrongGuesses = 6;
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
            document.getElementById('bestScore').textContent = student.games.hangman.bestScore;
        }
    }

    // Initialize game
    setupKeyboard();
    startNewGame();

    // Event listeners
    document.getElementById('newGameBtn').addEventListener('click', startNewGame);
    document.getElementById('hintBtn').addEventListener('click', showHint);
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'games.html';
    });
});

function startNewGame() {
    // Reset game state
    guessedLetters = [];
    wrongGuesses = 0;
    hintUsed = false;
    
    // Select random word
    currentWord = words[Math.floor(Math.random() * words.length)];
    
    // Update display
    updateWordDisplay();
    updateHangman();
    updateKeyboard();
    clearMessage();
    
    // Show hint and category
    document.getElementById('hintText').textContent = currentWord.hint;
    document.getElementById('category').textContent = currentWord.category;
    document.getElementById('hint').style.display = 'none';
}

function setupKeyboard() {
    const keyboard = document.getElementById('keyboard');
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    keyboard.innerHTML = '';
    
    for (let letter of letters) {
        const button = document.createElement('button');
        button.className = 'key';
        button.textContent = letter;
        button.dataset.letter = letter;
        button.addEventListener('click', () => guessLetter(letter));
        keyboard.appendChild(button);
    }
}

function guessLetter(letter) {
    if (guessedLetters.includes(letter)) return;
    
    guessedLetters.push(letter);
    const button = document.querySelector(`[data-letter="${letter}"]`);
    button.disabled = true;
    
    if (currentWord.word.includes(letter)) {
        button.classList.add('correct');
        updateWordDisplay();
        checkWin();
    } else {
        button.classList.add('wrong');
        wrongGuesses++;
        updateHangman();
        checkLose();
    }
    
    updateKeyboard();
}

function updateWordDisplay() {
    const display = document.getElementById('wordDisplay');
    display.innerHTML = '';
    
    for (let letter of currentWord.word) {
        const span = document.createElement('span');
        span.className = 'letter';
        if (guessedLetters.includes(letter)) {
            span.textContent = letter;
            span.classList.add('revealed');
        } else {
            span.textContent = '_';
        }
        display.appendChild(span);
    }
}

function updateHangman() {
    const parts = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    
    for (let i = 0; i < wrongGuesses && i < parts.length; i++) {
        document.getElementById(parts[i]).style.display = 'block';
    }
}

function updateKeyboard() {
    // Keyboard is already updated in guessLetter
}

function showHint() {
    if (!hintUsed) {
        document.getElementById('hint').style.display = 'block';
        hintUsed = true;
        document.getElementById('hintBtn').disabled = true;
    }
}

function checkWin() {
    const wordArray = currentWord.word.split('');
    const allGuessed = wordArray.every(letter => guessedLetters.includes(letter));
    
    if (allGuessed) {
        score += 10;
        if (wrongGuesses === 0) score += 5; // Bonus for perfect game
        document.getElementById('score').textContent = score;
        showMessage('Congratulations! You guessed it! 🎉', 'success');
        
        // Update best score
        updateBestScore();
        
        setTimeout(() => {
            startNewGame();
        }, 2000);
    }
}

function checkLose() {
    if (wrongGuesses >= maxWrongGuesses) {
        showMessage(`Game Over! The word was: ${currentWord.word}`, 'error');
        score = 0;
        document.getElementById('score').textContent = score;
        
        setTimeout(() => {
            startNewGame();
        }, 3000);
    }
}

function updateBestScore() {
    const studentData = JSON.parse(localStorage.getItem('currentStudent'));
    if (studentData && score > 0) {
        db.updateGameScore(studentData.id, 'hangman', score);
        const student = db.getStudentById(studentData.id);
        if (student) {
            document.getElementById('bestScore').textContent = student.games.hangman.bestScore;
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

function clearMessage() {
    document.getElementById('message').style.display = 'none';
}

