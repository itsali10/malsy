// AcademicRecord Model
// Represents a full academic year record for one student in one subject.

window.AcademicRecordModel = {
    SUBJECTS: ['english', 'science', 'socialStudies'],

    SUBJECT_LABELS: {
        english:       'English',
        science:       'Science',
        socialStudies: 'Social Studies'
    },

    /**
     * Creates an empty academic record for a student in a subject.
     * @param {string} studentId
     * @param {string} subject      - One of AcademicRecordModel.SUBJECTS
     * @param {number} academicYear - e.g. 2025
     */
    create(studentId, subject, academicYear) {
        return {
            studentId,
            subject,
            academicYear,
            semester1: SemesterModel.create(1),
            semester2: SemesterModel.create(2)
        };
    },

    /**
     * Builds a storage key used to look up / save a record in the database.
     */
    buildKey(studentId, subject, academicYear) {
        return `${studentId}__${subject}__${academicYear}`;
    }
};
