// Grade Report Service
// Builds structured report objects used by the UI to display full grade breakdowns.

window.gradeReport = {
    /**
     * Generates a complete grade report for one student across all subjects.
     *
     * @param {object} student   - Student object (id, name)
     * @param {number} year      - Academic year number (e.g. 2025)
     * @returns {object}         - Full report with per-subject year grades and summaries
     */
    generateFullReport(student, year) {
        const subjectReports = AcademicRecordModel.SUBJECTS.map((subject) => {
            const record = gradeDatabase.getRecord(student.id, subject, year)
                || AcademicRecordModel.create(student.id, subject, year);
            const result = gradeCalculator.yearGrade(record);
            return {
                subject,
                label:     AcademicRecordModel.SUBJECT_LABELS[subject],
                yearGrade: result.yearGrade,
                letterGrade: gradeHelpers.letterGrade(result.yearGrade),
                status:    gradeHelpers.passFail(result.yearGrade),
                sem1:      result.sem1,
                sem2:      result.sem2,
                record
            };
        });

        const validYearGrades = subjectReports
            .map((r) => r.yearGrade)
            .filter((g) => gradeValidator.isValidGrade(g));

        const overallAverage = validYearGrades.length > 0
            ? gradeHelpers.round(
                validYearGrades.reduce((sum, g) => sum + g, 0) / validYearGrades.length
              )
            : null;

        return {
            student,
            year,
            overallAverage,
            overallLetter: gradeHelpers.letterGrade(overallAverage),
            overallStatus: gradeHelpers.passFail(overallAverage),
            subjects:      subjectReports
        };
    },

    /**
     * Builds a semester breakdown table suitable for rendering row by row.
     *
     * @param {object} semResult - Result object from gradeCalculator.semesterGrade()
     * @returns {Array}          - Array of row objects { label, weight, value, contribution }
     */
    semesterRows(semResult) {
        if (!semResult || !semResult.breakdown) {
            return [];
        }
        const weightLabels = SemesterModel.WEIGHT_LABELS;
        return Object.entries(semResult.breakdown).map(([key, data]) => ({
            key,
            label:        weightLabels[key] || key,
            weight:       data.weight,
            value:        data.value !== null ? data.value : '—',
            contribution: data.contribution !== null ? data.contribution : '—'
        }));
    }
};
