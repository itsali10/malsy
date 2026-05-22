// Games Page Logic

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const currentSession = localStorage.getItem('currentSession');
    if (!currentSession || !db.getSession(currentSession)) {
        window.location.href = 'login.html';
        return;
    }

    // Load student stats
    const studentData = JSON.parse(localStorage.getItem('currentStudent'));
    if (studentData) {
        const student = db.getStudentById(studentData.id);
        if (student) {
            document.getElementById('hangmanBest').textContent = student.games.hangman.bestScore;
            document.getElementById('spellingBest').textContent = student.games.spellingBee.bestScore;
        }
    }

    // Game card click handlers
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => {
            const game = card.dataset.game;
            if (game === 'hangman') {
                window.location.href = 'hangman.html';
            } else if (game === 'spellingBee') {
                window.location.href = 'spelling-bee.html';
            }
        });
    });

    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });

    const student = studentData ? db.getStudentById(studentData.id) : null;
    instructorAvatar.init({ context: 'games', student });
});

