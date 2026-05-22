// Grades Page Controller
// Orchestrates grade entry, live calculation, and report display.

const ACADEMIC_YEAR = new Date().getFullYear();

const gradesPageState = {
    studentId:      null,
    student:        null,
    activeSubject:  'english'
};

document.addEventListener('DOMContentLoaded', () => {
    const authContext = authService.requireActiveStudent();
    if (!authContext) {
        return;
    }

    gradesPageState.studentId = authContext.student.id;
    gradesPageState.student   = authContext.student;

    renderStudentBanner(authContext.student);
    bindHeaderEvents(authContext.sessionToken);
    bindTabEvents();
    renderActiveSubject();
    instructorAvatar.init({ context: 'grades', student: authContext.student });
});

// ── Banner ───────────────────────────────────────────────────────────────────

function renderStudentBanner(student) {
    const fallback = `https://via.placeholder.com/72/667eea/ffffff?text=${encodeURIComponent(student.name.charAt(0).toUpperCase())}`;
    document.getElementById('bannerPicture').src   = student.picture || fallback;
    document.getElementById('bannerName').textContent = student.name;
    document.getElementById('bannerId').textContent   = student.id;
    document.getElementById('yearLabel').textContent  = `Academic Year ${ACADEMIC_YEAR}`;
    updateOverallBanner();
}

function updateOverallBanner() {
    const report = gradeReport.generateFullReport(gradesPageState.student, ACADEMIC_YEAR);
    const valueEl  = document.getElementById('overallValue');
    const letterEl = document.getElementById('overallLetter');
    const statusEl = document.getElementById('overallStatus');

    valueEl.textContent  = report.overallAverage !== null ? gradeHelpers.display(report.overallAverage) : '—';
    letterEl.textContent = report.overallLetter;
    statusEl.textContent = report.overallStatus;

    valueEl.className  = `overall-number ${gradeHelpers.gradeClass(report.overallAverage)}`;
    statusEl.className = `overall-label ${report.overallStatus === 'Pass' ? 'status-pass' : report.overallStatus === 'Fail' ? 'status-fail' : 'status-none'}`;
}

// ── Navigation ───────────────────────────────────────────────────────────────

function bindHeaderEvents() {
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });
    document.getElementById('printBtn').addEventListener('click', () => {
        window.print();
    });
}

function bindTabEvents() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            gradesPageState.activeSubject = btn.dataset.subject;
            renderActiveSubject();
        });
    });
}

// ── Subject panel rendering ───────────────────────────────────────────────────

function renderActiveSubject() {
    const { studentId, activeSubject } = gradesPageState;
    const record = gradeDatabase.getOrCreate(studentId, activeSubject, ACADEMIC_YEAR);
    const result = gradeCalculator.yearGrade(record);

    const container = document.getElementById('gradesMain');
    container.innerHTML = `
        ${buildSemesterInputPanel(record, 1)}
        ${buildSemesterInputPanel(record, 2)}
        ${buildResultsPanel(result, activeSubject)}
    `;

    bindSaveEvents(record, 1);
    bindSaveEvents(record, 2);
}

// ── Input panels ──────────────────────────────────────────────────────────────

function buildSemesterInputPanel(record, semNum) {
    const sem  = record[`semester${semNum}`];
    const rows = buildInputRows(sem);
    return `
        <section class="semester-panel">
            <h2>Semester ${semNum} — Grade Entry</h2>
            <form class="grade-form" id="semForm${semNum}" novalidate>
                ${rows}
                <button type="submit" class="save-btn">Save Semester ${semNum} Grades</button>
            </form>
        </section>
    `;
}

function buildInputRows(semester) {
    const componentLabels = {
        quiz1:         'Quiz 1',
        quiz2:         'Quiz 2',
        assignment:    'Assignment / Project',
        midterm:       'Midterm Exam',
        participation: 'Participation',
        finalExam:     'Final Exam'
    };
    const componentWeights = {
        quiz1:         '10%',
        quiz2:         '10%',
        assignment:    '20%',
        midterm:       '20%',
        participation: '10%',
        finalExam:     '30%'
    };

    return SemesterModel.componentKeys().map((key) => {
        const value = gradeValidator.isValidGrade(semester[key]) ? semester[key] : '';
        return `
            <div class="grade-row">
                <label for="input_${key}_${semester.number}">
                    ${componentLabels[key]}
                    <span class="weight-badge">(${componentWeights[key]})</span>
                </label>
                <input
                    class="grade-input"
                    id="input_${key}_${semester.number}"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="0–100"
                    value="${value}"
                    data-key="${key}"
                >
            </div>
        `;
    }).join('');
}

function bindSaveEvents(record, semNum) {
    const form = document.getElementById(`semForm${semNum}`);
    if (!form) {
        return;
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const { studentId, activeSubject } = gradesPageState;
        const semData = { number: semNum };
        let hasErrors = false;

        SemesterModel.componentKeys().forEach((key) => {
            const input = form.querySelector(`[data-key="${key}"]`);
            const raw   = input ? input.value.trim() : '';
            const result = gradeValidator.parseInput(raw);

            if (!result.ok) {
                input.classList.add('error');
                hasErrors = true;
                showToast(`Semester ${semNum} — ${GradeModel.LABELS[key]}: ${result.error}`);
            } else {
                input.classList.remove('error');
                semData[key] = result.value;
            }
        });

        if (hasErrors) {
            return;
        }

        gradeDatabase.saveSemesterGrades(studentId, activeSubject, ACADEMIC_YEAR, semNum, semData);
        showToast(`Semester ${semNum} grades saved.`);
        renderActiveSubject();
        updateOverallBanner();
    });
}

// ── Results panel ─────────────────────────────────────────────────────────────

function buildResultsPanel(result, subject) {
    const label  = AcademicRecordModel.SUBJECT_LABELS[subject];
    const rows1  = gradeReport.semesterRows(result.sem1);
    const rows2  = gradeReport.semesterRows(result.sem2);

    return `
        <section class="results-panel">
            <h2>${label} — Grade Breakdown</h2>

            <div class="year-summary">
                ${buildYearCard('Semester 1', result.sem1.grade)}
                ${buildYearCard('Semester 2', result.sem2.grade)}
                ${buildYearCard('Year Grade', result.yearGrade, true)}
            </div>

            <div class="breakdown-grid">
                ${buildBreakdownTable(rows1, 'Semester 1 Breakdown')}
                ${buildBreakdownTable(rows2, 'Semester 2 Breakdown')}
            </div>
        </section>
    `;
}

function buildYearCard(title, grade, highlight = false) {
    const displayValue  = gradeHelpers.display(grade);
    const letter        = gradeHelpers.letterGrade(grade);
    const status        = gradeHelpers.passFail(grade);
    const statusClass   = status === 'Pass' ? 'status-pass' : status === 'Fail' ? 'status-fail' : 'status-none';
    const colorClass    = gradeHelpers.gradeClass(grade);

    return `
        <div class="year-card" style="${highlight ? 'border: 2px solid #667eea;' : ''}">
            <p class="year-card-label">${title}</p>
            <p class="year-card-value ${colorClass}">${displayValue}</p>
            <p class="year-card-letter ${colorClass}">${letter}</p>
            <span class="year-card-status ${statusClass}">${status}</span>
        </div>
    `;
}

function buildBreakdownTable(rows, caption) {
    if (!rows || rows.length === 0) {
        return `<div><p style="color:#aaa; font-size:.9rem;">No data entered for this semester yet.</p></div>`;
    }

    const rowsHtml = rows.map((row) => `
        <tr>
            <td>${row.label}</td>
            <td>${row.weight}</td>
            <td>${typeof row.value === 'number' ? row.value.toFixed(2) : row.value}</td>
            <td>${typeof row.contribution === 'number' ? row.contribution.toFixed(2) : row.contribution}</td>
        </tr>
    `).join('');

    const totalContrib = rows
        .filter((r) => typeof r.contribution === 'number')
        .reduce((sum, r) => sum + r.contribution, 0);

    return `
        <div>
            <table class="breakdown-table">
                <caption>${caption}</caption>
                <thead>
                    <tr>
                        <th>Component</th>
                        <th>Weight</th>
                        <th>Score</th>
                        <th>Contribution</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr class="total-row">
                        <td colspan="3">Semester Total</td>
                        <td>${totalContrib.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// ── Toast notification ───────────────────────────────────────────────────────

function showToast(message) {
    let toast = document.getElementById('gradeToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id        = 'gradeToast';
        toast.className = 'grade-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}
