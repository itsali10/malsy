// Grade Database Service
// Handles persistence of academic records in localStorage.
// Completely separate from the student-profile storage in database.js.

window.gradeDatabase = {
    STORAGE_KEY: 'malsy_grades',

    getRaw() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    },

    saveRaw(data) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    },

    /**
     * Retrieves an academic record or returns null if not found.
     */
    getRecord(studentId, subject, year) {
        const all = this.getRaw();
        const key = AcademicRecordModel.buildKey(studentId, subject, year);
        return all[key] || null;
    },

    /**
     * Saves (creates or overwrites) an academic record.
     */
    saveRecord(record) {
        const all = this.getRaw();
        const key = AcademicRecordModel.buildKey(record.studentId, record.subject, record.academicYear);
        all[key] = record;
        this.saveRaw(all);
        return record;
    },

    /**
     * Returns all records for a given student across all subjects and years.
     */
    getStudentRecords(studentId) {
        const all = this.getRaw();
        return Object.values(all).filter((record) => record.studentId === studentId);
    },

    /**
     * Returns or creates a blank record for (studentId, subject, year).
     */
    getOrCreate(studentId, subject, year) {
        return this.getRecord(studentId, subject, year)
            || AcademicRecordModel.create(studentId, subject, year);
    },

    /**
     * Saves a single semester's grade components into the matching record.
     *
     * @param {string} studentId
     * @param {string} subject
     * @param {number} year
     * @param {number} semesterNumber - 1 or 2
     * @param {object} semesterData   - Partial or full semester grade object
     * @returns {object} The updated record
     */
    saveSemesterGrades(studentId, subject, year, semesterNumber, semesterData) {
        const record = this.getOrCreate(studentId, subject, year);
        const semKey = `semester${semesterNumber}`;
        record[semKey] = { ...record[semKey], ...semesterData, number: semesterNumber };
        return this.saveRecord(record);
    },

    /**
     * Clears all grade data (useful for testing / reset).
     */
    clearAll() {
        localStorage.removeItem(this.STORAGE_KEY);
    }
};
