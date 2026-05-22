// Grade Calculator Service
// Pure calculation logic — no DOM, no storage.  All functions are stateless.

window.gradeCalculator = {
    /**
     * Averages quiz1 and quiz2.
     * If one quiz is missing, uses only the available one.
     * Returns null when both are missing.
     */
    quizAverage(quiz1, quiz2) {
        const valid = [quiz1, quiz2].filter((v) => gradeValidator.isValidGrade(v));
        if (valid.length === 0) {
            return null;
        }
        return valid.reduce((sum, v) => sum + v, 0) / valid.length;
    },

    /**
     * Calculates the weighted semester grade.
     * Components that are null are skipped and their weight is redistributed
     * proportionally across the components that do have a value.
     *
     * @param {object} semester - A SemesterModel data object
     * @returns {{ grade: number|null, breakdown: object, hasPartialData: boolean }}
     */
    semesterGrade(semester) {
        const weights = SemesterModel.WEIGHTS;
        const quizAvg = this.quizAverage(semester.quiz1, semester.quiz2);

        const components = [
            { key: 'quizAverage',   value: quizAvg,              weight: weights.quizAverage },
            { key: 'assignment',    value: semester.assignment,   weight: weights.assignment },
            { key: 'midterm',       value: semester.midterm,      weight: weights.midterm },
            { key: 'participation', value: semester.participation, weight: weights.participation },
            { key: 'finalExam',     value: semester.finalExam,    weight: weights.finalExam }
        ];

        const present = components.filter((c) => gradeValidator.isValidGrade(c.value));
        const missing = components.filter((c) => !gradeValidator.isValidGrade(c.value));

        if (present.length === 0) {
            return { grade: null, breakdown: {}, hasPartialData: false };
        }

        const presentWeightTotal = present.reduce((sum, c) => sum + c.weight, 0);

        const breakdown = {};
        let weightedTotal = 0;

        present.forEach((c) => {
            // Normalise weight so all present weights sum to 1
            const normalisedWeight = c.weight / presentWeightTotal;
            const contribution = c.value * normalisedWeight;
            breakdown[c.key] = {
                value:        gradeHelpers.round(c.value),
                weight:       gradeHelpers.toPercent(c.weight),
                contribution: gradeHelpers.round(contribution)
            };
            weightedTotal += contribution;
        });

        missing.forEach((c) => {
            breakdown[c.key] = { value: null, weight: gradeHelpers.toPercent(c.weight), contribution: null };
        });

        return {
            grade:          gradeHelpers.round(weightedTotal),
            breakdown,
            hasPartialData: missing.length > 0
        };
    },

    /**
     * Averages the two semester grades into a year grade.
     * If only one semester has data, returns that semester's grade.
     *
     * @param {object} record - An AcademicRecordModel data object
     * @returns {{ yearGrade: number|null, sem1: object, sem2: object }}
     */
    yearGrade(record) {
        const sem1Result = this.semesterGrade(record.semester1);
        const sem2Result = this.semesterGrade(record.semester2);

        const grades = [sem1Result.grade, sem2Result.grade].filter(
            (g) => gradeValidator.isValidGrade(g)
        );

        const yearGrade = grades.length > 0
            ? gradeHelpers.round(grades.reduce((sum, g) => sum + g, 0) / grades.length)
            : null;

        return { yearGrade, sem1: sem1Result, sem2: sem2Result };
    }
};
