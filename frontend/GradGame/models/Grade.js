// Grade Model
// Represents a single grade entry with its type, raw value, and display label.

window.GradeModel = {
    TYPES: {
        QUIZ_1:        'quiz1',
        QUIZ_2:        'quiz2',
        ASSIGNMENT:    'assignment',
        MIDTERM:       'midterm',
        PARTICIPATION: 'participation',
        FINAL_EXAM:    'finalExam'
    },

    LABELS: {
        quiz1:         'Quiz 1',
        quiz2:         'Quiz 2',
        assignment:    'Assignment / Project',
        midterm:       'Midterm Exam',
        participation: 'Participation',
        finalExam:     'Final Exam'
    },

    /**
     * Creates a grade entry object.
     * @param {string} type  - One of GradeModel.TYPES
     * @param {number|null} value - 0–100 or null if not entered
     */
    create(type, value = null) {
        return {
            type,
            label: this.LABELS[type] || type,
            value
        };
    }
};
