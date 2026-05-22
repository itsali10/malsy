// Login and Signup Logic

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignupLink = document.getElementById('showSignup');
    const showLoginLink = document.getElementById('showLogin');
    const messageDiv = document.getElementById('message');

    // Toggle between login and signup forms
    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.remove('active');
        signupForm.classList.add('active');
        clearMessage();
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.classList.remove('active');
        loginForm.classList.add('active');
        clearMessage();
    });

    // Login Form Handler
    document.getElementById('loginFormElement').addEventListener('submit', (e) => {
        e.preventDefault();
        clearMessage();

        const studentId = document.getElementById('loginId').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!studentId || !password) {
            showMessage('Please fill in all fields', 'error');
            return;
        }

        const result = db.authenticateStudent(studentId, password);

        if (result.success) {
            // Create session
            const session = db.createSession(studentId);
            
            // Store session in localStorage
            localStorage.setItem('currentSession', session.token);
            localStorage.setItem('currentStudent', JSON.stringify(result.student));

            showMessage('Login successful! Redirecting...', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            showMessage(result.error, 'error');
        }
    });

    // Signup Form Handler
    document.getElementById('signupFormElement').addEventListener('submit', (e) => {
        e.preventDefault();
        clearMessage();

        const name = document.getElementById('signupName').value.trim();
        const studentId = document.getElementById('signupId').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;
        const picture = document.getElementById('signupPicture').value.trim();

        // Validation
        if (!name || !studentId || !email || !password || !confirmPassword) {
            showMessage('Please fill in all required fields', 'error');
            return;
        }

        if (password.length < 6) {
            showMessage('Password must be at least 6 characters', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showMessage('Passwords do not match', 'error');
            return;
        }

        if (studentId.length < 3) {
            showMessage('Student ID must be at least 3 characters', 'error');
            return;
        }

        try {
            const student = db.createStudent({
                id: studentId,
                name: name,
                email: email,
                password: password,
                picture: picture || ''
            });

            // Create session
            const session = db.createSession(studentId);
            
            // Store session
            localStorage.setItem('currentSession', session.token);
            localStorage.setItem('currentStudent', JSON.stringify(db.sanitizeStudent(student)));

            showMessage('Account created successfully! Redirecting...', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } catch (error) {
            showMessage(error.message, 'error');
        }
    });

    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 3000);
        }
    }

    function clearMessage() {
        messageDiv.style.display = 'none';
        messageDiv.textContent = '';
    }

    // Check if already logged in
    const currentSession = localStorage.getItem('currentSession');
    if (currentSession) {
        const session = db.getSession(currentSession);
        if (session) {
            window.location.href = 'dashboard.html';
        }
    }
});

