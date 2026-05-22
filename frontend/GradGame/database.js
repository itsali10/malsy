// Database Management System
// Uses localStorage now, but service boundaries are prepared for backend APIs later.

class Database {
    constructor() {
        this.storageKey = 'malsy_students';
        this.sessionsKey = 'malsy_sessions';
        this.subjectBlueprint = {
            english: { totalLessons: 9 },
            science: { totalLessons: 9 },
            socialStudies: { sections: { history: 4, geography: 4 } }
        };
        this.init();
    }

    init() {
        try {
            if (!localStorage.getItem(this.storageKey)) {
                this.safeSetItem(this.storageKey, JSON.stringify([]));
            }
            if (!localStorage.getItem(this.sessionsKey)) {
                this.safeSetItem(this.sessionsKey, JSON.stringify([]));
            }
            this.ensureDataIntegrity();
        } catch (err) {
            console.error('[database] init failed — storage may be full or blocked.', err);
        }
    }

    ensureDataIntegrity() {
        let students = this.getRawStudents();
        if (!Array.isArray(students)) {
            console.warn('[database] Student data was not an array — resetting.');
            students = [];
            this.safeSetItem(this.storageKey, JSON.stringify([]));
            return;
        }

        const valid = students.filter((s) => s && typeof s === 'object');
        if (valid.length !== students.length) {
            console.warn('[database] Removed invalid student entries.');
        }

        let wasUpdated = valid.length !== students.length;
        const normalized = valid.map((student) => {
            const next = this.normalizeStudent(student);
            if (JSON.stringify(next) !== JSON.stringify(student)) {
                wasUpdated = true;
            }
            return next;
        });
        if (wasUpdated) {
            this.safeSetItem(this.storageKey, JSON.stringify(normalized));
        }
    }

    safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (err) {
            console.error('[database] localStorage.setItem failed (quota full or private mode?):', key, err);
            return false;
        }
    }

    createDefaultProgress() {
        return {
            english: {
                totalLessons: this.subjectBlueprint.english.totalLessons,
                completedLessons: [],
                lessonsCompleted: 0,
                score: 0
            },
            science: {
                totalLessons: this.subjectBlueprint.science.totalLessons,
                completedLessons: [],
                lessonsCompleted: 0,
                chemistryLabVisited: false,
                score: 0
            },
            socialStudies: {
                sections: {
                    history: [],
                    geography: []
                },
                sectionTotals: this.subjectBlueprint.socialStudies.sections,
                lessonsCompleted: 0,
                score: 0
            }
        };
    }

    normalizeStudent(student) {
        const fallbackProgress = this.createDefaultProgress();
        const rawProgress = student.progress || {};
        const normalizedProgress = {
            english: this.normalizeLinearProgress(rawProgress.english, fallbackProgress.english),
            science: this.normalizeLinearProgress(rawProgress.science, fallbackProgress.science, true),
            socialStudies: this.normalizeSocialProgress(rawProgress.socialStudies, fallbackProgress.socialStudies)
        };

        return {
            ...student,
            picture: student.picture || `https://via.placeholder.com/150/667eea/ffffff?text=${encodeURIComponent((student.name || 'Student').charAt(0) || 'S')}`,
            progress: normalizedProgress,
            games: {
                hangman: {
                    gamesPlayed: student.games?.hangman?.gamesPlayed || 0,
                    bestScore: student.games?.hangman?.bestScore || 0
                },
                spellingBee: {
                    gamesPlayed: student.games?.spellingBee?.gamesPlayed || 0,
                    bestScore: student.games?.spellingBee?.bestScore || 0
                }
            }
        };
    }

    normalizeLinearProgress(progress, fallback, includeLabFlag = false) {
        const totalLessons = fallback.totalLessons;
        let completedLessons = Array.isArray(progress?.completedLessons)
            ? progress.completedLessons
            : this.legacyCountToArray(progress?.lessonsCompleted, totalLessons);

        completedLessons = completedLessons
            .map((lesson) => Number(lesson))
            .filter((lesson) => Number.isInteger(lesson) && lesson >= 1 && lesson <= totalLessons)
            .sort((a, b) => a - b);

        const uniqueLessons = [...new Set(completedLessons)];
        const normalized = {
            totalLessons,
            completedLessons: uniqueLessons,
            lessonsCompleted: uniqueLessons.length,
            score: Number(progress?.score) || 0
        };

        if (includeLabFlag) {
            normalized.chemistryLabVisited = Boolean(progress?.chemistryLabVisited);
        }

        return normalized;
    }

    normalizeSocialProgress(progress, fallback) {
        const totals = fallback.sectionTotals;
        const rawSections = progress?.sections || {};
        const historyLessons = this.normalizeSectionLessons(rawSections.history, progress?.lessonsCompleted, totals.history);
        const geographyLessons = this.normalizeSectionLessons(rawSections.geography, 0, totals.geography);
        const totalCompleted = historyLessons.length + geographyLessons.length;

        return {
            sections: {
                history: historyLessons,
                geography: geographyLessons
            },
            sectionTotals: totals,
            lessonsCompleted: totalCompleted,
            score: Number(progress?.score) || 0
        };
    }

    normalizeSectionLessons(sectionArray, legacyLessonsCompleted, totalLessons) {
        const fromArray = Array.isArray(sectionArray) ? sectionArray : this.legacyCountToArray(legacyLessonsCompleted, totalLessons);
        return [...new Set(
            fromArray
                .map((lesson) => Number(lesson))
                .filter((lesson) => Number.isInteger(lesson) && lesson >= 1 && lesson <= totalLessons)
        )].sort((a, b) => a - b);
    }

    legacyCountToArray(count, max) {
        const safeCount = Math.min(Math.max(Number(count) || 0, 0), max);
        return Array.from({ length: safeCount }, (_, index) => index + 1);
    }

    createStudent(studentData) {
        const students = this.getRawStudents();

        if (students.find((student) => student.id === studentData.id)) {
            throw new Error('Student ID already exists');
        }
        if (students.find((student) => student.email === studentData.email)) {
            throw new Error('Email already registered');
        }

        const student = {
            id: studentData.id,
            name: studentData.name,
            email: studentData.email,
            password: this.hashPassword(studentData.password),
            picture: studentData.picture || `https://via.placeholder.com/150/667eea/ffffff?text=${encodeURIComponent(studentData.name.charAt(0).toUpperCase())}`,
            createdAt: new Date().toISOString(),
            progress: this.createDefaultProgress(),
            games: {
                hangman: { gamesPlayed: 0, bestScore: 0 },
                spellingBee: { gamesPlayed: 0, bestScore: 0 }
            }
        };

        students.push(student);
        if (!this.safeSetItem(this.storageKey, JSON.stringify(students))) {
            students.pop();
            throw new Error('Could not save account: browser storage is full or unavailable. Try another browser or free some space.');
        }
        return this.normalizeStudent(student);
    }

    getRawStudents() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) {
                return [];
            }
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn('[database] Corrupt or unreadable student list — resetting.', err);
            this.safeSetItem(this.storageKey, JSON.stringify([]));
            return [];
        }
    }

    getAllStudents() {
        return this.getRawStudents().map((student) => this.normalizeStudent(student));
    }

    getStudentById(studentId) {
        const student = this.getRawStudents().find((entry) => entry.id === studentId);
        return student ? this.normalizeStudent(student) : null;
    }

    getStudentByEmail(email) {
        const student = this.getRawStudents().find((entry) => entry.email === email);
        return student ? this.normalizeStudent(student) : null;
    }

    authenticateStudent(studentId, password) {
        const student = this.getStudentById(studentId);
        if (!student) {
            return { success: false, error: 'Student ID not found' };
        }
        if (student.password !== this.hashPassword(password)) {
            return { success: false, error: 'Incorrect password' };
        }
        return { success: true, student: this.sanitizeStudent(student) };
    }

    updateStudent(studentId, updates) {
        const students = this.getRawStudents();
        const index = students.findIndex((student) => student.id === studentId);
        if (index === -1) {
            throw new Error('Student not found');
        }

        Object.keys(updates).forEach((key) => {
            if (key !== 'password' && key !== 'id') {
                students[index][key] = updates[key];
            }
        });

        const normalized = this.normalizeStudent(students[index]);
        students[index] = normalized;
        if (!this.safeSetItem(this.storageKey, JSON.stringify(students))) {
            throw new Error('Could not save changes: browser storage is full.');
        }
        return normalized;
    }

    updateProgress(studentId, subject, progressData) {
        const student = this.getStudentById(studentId);
        if (!student || !student.progress[subject]) {
            return null;
        }
        const mergedProgress = {
            ...student.progress,
            [subject]: {
                ...student.progress[subject],
                ...progressData
            }
        };
        this.updateStudent(studentId, { progress: mergedProgress });
        return mergedProgress;
    }

    markLessonComplete(studentId, subject, lessonNumber, section = null) {
        const student = this.getStudentById(studentId);
        if (!student) {
            return null;
        }

        const progress = this.deepClone(student.progress);
        if (subject === 'english' || subject === 'science') {
            const total = progress[subject].totalLessons;
            if (lessonNumber < 1 || lessonNumber > total) {
                throw new Error('Invalid lesson number');
            }

            if (!progress[subject].completedLessons.includes(lessonNumber)) {
                progress[subject].completedLessons.push(lessonNumber);
                progress[subject].completedLessons.sort((a, b) => a - b);
                progress[subject].lessonsCompleted = progress[subject].completedLessons.length;
            }
        } else if (subject === 'socialStudies') {
            if (!section || !['history', 'geography'].includes(section)) {
                throw new Error('Invalid social studies section');
            }
            const total = progress.socialStudies.sectionTotals[section];
            if (lessonNumber < 1 || lessonNumber > total) {
                throw new Error('Invalid lesson number');
            }
            if (!progress.socialStudies.sections[section].includes(lessonNumber)) {
                progress.socialStudies.sections[section].push(lessonNumber);
                progress.socialStudies.sections[section].sort((a, b) => a - b);
                progress.socialStudies.lessonsCompleted = progress.socialStudies.sections.history.length + progress.socialStudies.sections.geography.length;
            }
        }

        this.updateStudent(studentId, { progress });
        return this.getStudentById(studentId).progress;
    }

    updateStudentPhoto(studentId, photoDataUrl) {
        return this.updateStudent(studentId, { picture: photoDataUrl });
    }

    setChemistryLabVisited(studentId) {
        const student = this.getStudentById(studentId);
        if (!student) {
            return null;
        }
        const progress = this.deepClone(student.progress);
        progress.science.chemistryLabVisited = true;
        this.updateStudent(studentId, { progress });
        return progress.science;
    }

    updateGameScore(studentId, game, score) {
        const student = this.getStudentById(studentId);
        if (!student) {
            return null;
        }
        if (game === 'hangman' || game === 'spellingBee') {
            student.games[game].gamesPlayed += 1;
            if (score > student.games[game].bestScore) {
                student.games[game].bestScore = score;
            }
        }
        this.updateStudent(studentId, { games: student.games });
        return student.games;
    }

    createSession(studentId) {
        const sessions = this.getSessions();
        const session = {
            studentId,
            token: this.generateToken(),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString()
        };
        sessions.push(session);
        if (!this.safeSetItem(this.sessionsKey, JSON.stringify(sessions))) {
            sessions.pop();
            throw new Error('Could not create session: browser storage is full.');
        }
        return session;
    }

    getSession(token) {
        const sessions = this.getSessions();
        const session = sessions.find((entry) => entry.token === token);
        if (!session) {
            return null;
        }
        if (new Date(session.expiresAt) < new Date()) {
            this.deleteSession(token);
            return null;
        }
        return session;
    }

    deleteSession(token) {
        const sessions = this.getSessions().filter((entry) => entry.token !== token);
        this.safeSetItem(this.sessionsKey, JSON.stringify(sessions));
    }

    getSessions() {
        try {
            const data = localStorage.getItem(this.sessionsKey);
            if (!data) {
                return [];
            }
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn('[database] Corrupt sessions — resetting.', err);
            this.safeSetItem(this.sessionsKey, JSON.stringify([]));
            return [];
        }
    }

    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i += 1) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash &= hash;
        }
        return hash.toString();
    }

    generateToken() {
        return `token_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
    }

    sanitizeStudent(student) {
        const sanitized = { ...student };
        delete sanitized.password;
        return sanitized;
    }

    deepClone(payload) {
        return JSON.parse(JSON.stringify(payload));
    }

    exportData() {
        return {
            students: this.getAllStudents(),
            sessions: this.getSessions(),
            exportDate: new Date().toISOString()
        };
    }

    importData(data) {
        if (data.students) {
            localStorage.setItem(this.storageKey, JSON.stringify(data.students));
        }
        if (data.sessions) {
            localStorage.setItem(this.sessionsKey, JSON.stringify(data.sessions));
        }
        this.ensureDataIntegrity();
    }
}

const db = new Database();

