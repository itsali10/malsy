window.progressService = {
    getProgressPercent(student, subject) {
        if (!student?.progress) {
            return 0;
        }

        if (subject === 'socialStudies') {
            const social = student.progress.socialStudies;
            const totals = social.sectionTotals.history + social.sectionTotals.geography;
            if (totals === 0) {
                return 0;
            }
            return Math.round((social.lessonsCompleted / totals) * 100);
        }

        const subjectProgress = student.progress[subject];
        if (!subjectProgress?.totalLessons) {
            return 0;
        }
        return Math.round((subjectProgress.lessonsCompleted / subjectProgress.totalLessons) * 100);
    },

    isLinearLessonLocked(completedLessons, lessonNumber) {
        if (lessonNumber === 1) {
            return false;
        }
        return !completedLessons.includes(lessonNumber - 1);
    },

    isSocialLessonLocked(sectionLessons, lessonNumber) {
        if (lessonNumber === 1) {
            return false;
        }
        return !sectionLessons.includes(lessonNumber - 1);
    },

    completeLesson(studentId, subject, lessonNumber, section = null) {
        return db.markLessonComplete(studentId, subject, lessonNumber, section);
    }
};
