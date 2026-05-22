// Semester Model
// Holds all grade components for one semester and defines the official weight table.

window.SemesterModel = {
    /**
     * Official grading weights — must sum to 1.0.
     * Quizzes weight is the combined weight for BOTH quiz1 and quiz2 averaged.
     */
    WEIGHTS: {
        quizAverage:   0.20,
        assignment:    0.20,
        midterm:       0.20,
        participation: 0.10,
        finalExam:     0.30
    },

    WEIGHT_LABELS: {
        quizAverage:   'Quizzes (avg)',
        assignment:    'Assignment / Project',
        midterm:       'Midterm Exam',
        participation: 'Participation',
        finalExam:     'Final Exam'
    },

    /**
     * Creates an empty semester data object.
     * @param {number} semesterNumber - 1 or 2
     */
    create(semesterNumber) {
        return {
            number: semesterNumber,
            quiz1:         null,
            quiz2:         null,
            assignment:    null,
            midterm:       null,
            participation: null,
            finalExam:     null
        };
    },

    /**
     * Returns an ordered array of the component keys used when rendering inputs.
     */
    componentKeys() {
        return ['quiz1', 'quiz2', 'assignment', 'midterm', 'participation', 'finalExam'];
    }
};
