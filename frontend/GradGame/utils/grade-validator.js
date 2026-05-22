// Grade Validator Utility
// All validation rules for grade inputs live here.

window.gradeValidator = {
    MIN: 0,
    MAX: 100,

    /**
     * Returns true when value is a finite number in [0, 100].
     */
    isValidGrade(value) {
        return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
            && Number(value) >= this.MIN && Number(value) <= this.MAX;
    },

    /**
     * Parses and validates a raw input string.
     * @returns {{ ok: boolean, value: number|null, error: string|null }}
     */
    parseInput(raw) {
        if (raw === null || raw === undefined || String(raw).trim() === '') {
            return { ok: true, value: null, error: null };
        }

        const num = Number(raw);

        if (!Number.isFinite(num)) {
            return { ok: false, value: null, error: 'Grade must be a number.' };
        }

        if (num < this.MIN || num > this.MAX) {
            return { ok: false, value: null, error: `Grade must be between ${this.MIN} and ${this.MAX}.` };
        }

        return { ok: true, value: num, error: null };
    },

    /**
     * Validates an entire semester object.
     * Returns an array of error messages (empty array means all valid).
     */
    validateSemester(semester) {
        const errors = [];
        const keys = SemesterModel.componentKeys();

        keys.forEach((key) => {
            const raw = semester[key];
            const result = this.parseInput(raw);
            if (!result.ok) {
                const label = GradeModel.LABELS[key] || key;
                errors.push(`${label}: ${result.error}`);
            }
        });

        return errors;
    }
};
