window.authService = {
    requireActiveStudent() {
        const currentSessionToken = localStorage.getItem('currentSession');
        if (!currentSessionToken) {
            window.location.href = 'login.html';
            return null;
        }

        const session = db.getSession(currentSessionToken);
        if (!session) {
            this.clearClientSession();
            window.location.href = 'login.html';
            return null;
        }

        const student = db.getStudentById(session.studentId);
        if (!student) {
            this.clearClientSession();
            window.location.href = 'login.html';
            return null;
        }

        localStorage.setItem('currentStudent', JSON.stringify(db.sanitizeStudent(student)));
        return {
            sessionToken: currentSessionToken,
            session,
            student
        };
    },

    clearClientSession() {
        localStorage.removeItem('currentSession');
        localStorage.removeItem('currentStudent');
    },

    logout(sessionToken) {
        if (sessionToken) {
            db.deleteSession(sessionToken);
        }
        this.clearClientSession();
        window.location.href = 'login.html';
    }
};
