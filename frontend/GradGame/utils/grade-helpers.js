// Grade Helper Utility
// Pure formatting and conversion functions used across the grading system.

window.gradeHelpers = {
    PASS_THRESHOLD: 50,

    /**
     * Rounds a number to 2 decimal places.
     */
    round(value) {
        return Math.round(value * 100) / 100;
    },

    /**
     * Converts a decimal weight (e.g. 0.20) to a readable percent string ("20%").
     */
    toPercent(weight) {
        return `${Math.round(weight * 100)}%`;
    },

    /**
     * Returns the letter-grade equivalent of a numeric score.
     * Returns '—' when value is null or invalid.
     */
    letterGrade(value) {
        if (!gradeValidator.isValidGrade(value)) {
            return '—';
        }
        if (value >= 90) return 'A+';
        if (value >= 85) return 'A';
        if (value >= 80) return 'A-';
        if (value >= 75) return 'B+';
        if (value >= 70) return 'B';
        if (value >= 65) return 'B-';
        if (value >= 60) return 'C+';
        if (value >= 55) return 'C';
        if (value >= 50) return 'C-';
        if (value >= 45) return 'D';
        return 'F';
    },

    /**
     * Returns 'Pass' or 'Fail' based on the pass threshold.
     */
    passFail(value) {
        if (!gradeValidator.isValidGrade(value)) {
            return '—';
        }
        return value >= this.PASS_THRESHOLD ? 'Pass' : 'Fail';
    },

    /**
     * Returns a CSS class name tied to the letter/score band.
     */
    gradeClass(value) {
        if (!gradeValidator.isValidGrade(value)) {
            return 'grade-neutral';
        }
        if (value >= 80) return 'grade-excellent';
        if (value >= 60) return 'grade-good';
        if (value >= 50) return 'grade-average';
        return 'grade-fail';
    },

    /**
     * Formats a number for display, returning '—' when null/invalid.
     */
    display(value) {
        if (!gradeValidator.isValidGrade(value)) {
            return '—';
        }
        return this.round(value).toFixed(2);
    },

    /**
     * Returns a motivational remark based on the score.
     */
    remark(value) {
        if (!gradeValidator.isValidGrade(value)) {
            return 'No grade yet';
        }
        if (value >= 90) return 'Outstanding';
        if (value >= 80) return 'Excellent';
        if (value >= 70) return 'Very Good';
        if (value >= 60) return 'Good';
        if (value >= 50) return 'Satisfactory';
        if (value >= 45) return 'Needs Improvement';
        return 'Failing';
    }
};
