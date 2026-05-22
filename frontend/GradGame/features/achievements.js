// Achievement System
// Defines all badges, checks unlock conditions, and persists earned badges per student.

window.achievementsSystem = (() => {
    const STORAGE_KEY = 'malsy_achievements';

    const DEFINITIONS = [
        {
            id: 'first_login',
            icon: '🌟',
            title: 'Welcome Star',
            description: 'Logged in for the first time.',
            condition: () => true
        },
        {
            id: 'first_lesson',
            icon: '📖',
            title: 'First Step',
            description: 'Completed your very first lesson.',
            condition: (student) => {
                const p = student.progress;
                return (
                    p.english.lessonsCompleted > 0 ||
                    p.science.lessonsCompleted > 0 ||
                    p.socialStudies.lessonsCompleted > 0
                );
            }
        },
        {
            id: 'english_25',
            icon: '📚',
            title: 'Word Explorer',
            description: 'Reached 25% in English.',
            condition: (student) => progressService.getProgressPercent(student, 'english') >= 25
        },
        {
            id: 'english_complete',
            icon: '🏆',
            title: 'English Champion',
            description: 'Completed all English lessons!',
            condition: (student) => progressService.getProgressPercent(student, 'english') >= 100
        },
        {
            id: 'science_25',
            icon: '🔬',
            title: 'Junior Scientist',
            description: 'Reached 25% in Science.',
            condition: (student) => progressService.getProgressPercent(student, 'science') >= 25
        },
        {
            id: 'science_complete',
            icon: '⚗️',
            title: 'Science Master',
            description: 'Completed all Science lessons!',
            condition: (student) => progressService.getProgressPercent(student, 'science') >= 100
        },
        {
            id: 'chemistry_lab',
            icon: '🧪',
            title: 'Lab Explorer',
            description: 'Visited the Chemistry Lab.',
            condition: (student) => student.progress.science.chemistryLabVisited === true
        },
        {
            id: 'social_25',
            icon: '🌍',
            title: 'World Traveler',
            description: 'Reached 25% in Social Studies.',
            condition: (student) => progressService.getProgressPercent(student, 'socialStudies') >= 25
        },
        {
            id: 'social_complete',
            icon: '🗺️',
            title: 'Social Scholar',
            description: 'Completed all Social Studies lessons!',
            condition: (student) => progressService.getProgressPercent(student, 'socialStudies') >= 100
        },
        {
            id: 'all_subjects_started',
            icon: '🎯',
            title: 'All Rounder',
            description: 'Started lessons in all 3 subjects.',
            condition: (student) => {
                const p = student.progress;
                return (
                    p.english.lessonsCompleted > 0 &&
                    p.science.lessonsCompleted > 0 &&
                    p.socialStudies.lessonsCompleted > 0
                );
            }
        },
        {
            id: 'game_player',
            icon: '🎮',
            title: 'Game On!',
            description: 'Played an educational game.',
            condition: (student) =>
                student.games.hangman.gamesPlayed > 0 || student.games.spellingBee.gamesPlayed > 0
        },
        {
            id: 'five_streak',
            icon: '🔥',
            title: '5-Day Streak',
            description: 'Visited 5 different days.',
            condition: (_student, studentId) => {
                const days = getVisitDays(studentId);
                return days.length >= 5;
            }
        }
    ];

    // ── Visit tracking ───────────────────────────────────────────────────────

    function recordVisit(studentId) {
        const all = getRaw();
        if (!all[studentId]) {
            all[studentId] = { earned: [], visitDays: [] };
        }
        const today = todayString();
        if (!all[studentId].visitDays.includes(today)) {
            all[studentId].visitDays.push(today);
        }
        saveRaw(all);
    }

    function getVisitDays(studentId) {
        const all = getRaw();
        return all[studentId]?.visitDays || [];
    }

    function getWeeklyActivity(studentId) {
        const visitDays = getVisitDays(studentId);
        const result = [];
        for (let i = 6; i >= 0; i -= 1) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const str = d.toISOString().slice(0, 10);
            result.push({ date: str, active: visitDays.includes(str) });
        }
        return result;
    }

    // ── Earned badges ────────────────────────────────────────────────────────

    function checkAndUnlock(student) {
        const all = getRaw();
        if (!all[student.id]) {
            all[student.id] = { earned: [], visitDays: [] };
        }

        const earned = all[student.id].earned;
        const newlyUnlocked = [];

        DEFINITIONS.forEach((def) => {
            if (earned.includes(def.id)) {
                return;
            }
            let unlocked = false;
            try {
                unlocked = Boolean(def.condition(student, student.id));
            } catch (err) {
                console.warn('[achievements] condition failed:', def.id, err);
            }
            if (unlocked) {
                earned.push(def.id);
                newlyUnlocked.push(def);
            }
        });

        all[student.id].earned = earned;
        saveRaw(all);
        return newlyUnlocked;
    }

    function getEarned(studentId) {
        const all = getRaw();
        const earnedIds = all[studentId]?.earned || [];
        return DEFINITIONS.filter((def) => earnedIds.includes(def.id));
    }

    function getAll() {
        return DEFINITIONS;
    }

    // ── Storage helpers ──────────────────────────────────────────────────────

    function getRaw() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    }

    function saveRaw(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function todayString() {
        return new Date().toISOString().slice(0, 10);
    }

    return { recordVisit, getWeeklyActivity, checkAndUnlock, getEarned, getAll };
})();
