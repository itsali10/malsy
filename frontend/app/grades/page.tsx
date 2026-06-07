'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getOrCreate, saveSemesterGrades } from '@/lib/grade-database';
import { yearGrade } from '@/lib/grade-calculator';
import { generateFullReport, semesterRows } from '@/lib/grade-report';
import { SUBJECTS, SUBJECT_LABELS } from '@/models/AcademicRecord';
import { semesterComponentKeys, SemesterData } from '@/models/Semester';
import { GradeLabels } from '@/models/Grade';
import { parseGradeInput } from '@/utils/grade-validator';
import { display as displayGrade, letterGrade, passFail, gradeClass } from '@/utils/grade-helpers';
import { isLoggedInToBackend, apiGetEvaluations, type ApiEvaluation } from '@/lib/api';
import type { AuthContext } from '@/lib/auth';
import type { Student } from '@/lib/database';
import styles from './grades.module.css';

const YEAR = new Date().getFullYear();

const COMPONENT_WEIGHTS: Record<string, string> = {
  quiz1: '10%', quiz2: '10%', assignment: '20%', midterm: '20%', participation: '10%', finalExam: '30%',
};

function GradesContent({ ctx }: { ctx: AuthContext }) {
  const router = useRouter();
  const student = ctx.student as Student;
  const [activeSubject, setActiveSubject] = useState('english');
  const [toast, setToast] = useState('');
  const [, forceUpdate] = useState(0);

  const report = generateFullReport(student, YEAR);
  const record = getOrCreate(student.id, activeSubject, YEAR);
  const result = yearGrade(record);
  const rows1 = semesterRows(result.sem1);
  const rows2 = semesterRows(result.sem2);

  // FastAPI evaluations (shown alongside localStorage grades)
  const [evaluations, setEvaluations] = useState<ApiEvaluation[] | null>(null);

  useEffect(() => {
    if (!isLoggedInToBackend()) return;
    apiGetEvaluations().then((data) => setEvaluations(data)).catch(() => {});
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  function handleSave(semNum: 1 | 2, formEl: HTMLFormElement) {
    const semData: Partial<SemesterData> = { number: semNum };
    let hasErrors = false;

    semesterComponentKeys().forEach((key) => {
      const input = formEl.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
      const raw = input?.value.trim() || '';
      const result = parseGradeInput(raw);
      if (!result.ok) {
        input?.classList.add(styles.inputError);
        showToast(`Semester ${semNum} — ${GradeLabels[key]}: ${result.error}`);
        hasErrors = true;
      } else {
        input?.classList.remove(styles.inputError);
        (semData as Record<string, unknown>)[key] = result.value;
      }
    });

    if (hasErrors) return;
    saveSemesterGrades(student.id, activeSubject, YEAR, semNum, semData);
    showToast(`Semester ${semNum} grades saved.`);
    forceUpdate((n) => n + 1);
  }

  function buildSemesterForm(semNum: 1 | 2) {
    const sem = record[`semester${semNum}`];
    return (
      <section className={styles.semPanel}>
        <h2>Semester {semNum} — Grade Entry</h2>
        <form
          className={styles.gradeForm}
          noValidate
          onSubmit={(e) => { e.preventDefault(); handleSave(semNum, e.currentTarget); }}
        >
          {semesterComponentKeys().map((key) => {
            const val = sem[key];
            const displayVal = val !== null && val !== undefined ? String(val) : '';
            return (
              <div key={key} className={styles.gradeRow}>
                <label>
                  {GradeLabels[key]}
                  <span className={styles.weightBadge}>({COMPONENT_WEIGHTS[key]})</span>
                </label>
                <input
                  className={styles.gradeInput}
                  type="number"
                  min="0" max="100" step="0.5"
                  placeholder="0–100"
                  defaultValue={displayVal}
                  data-key={key}
                />
              </div>
            );
          })}
          <button type="submit" className={styles.saveBtn}>Save Semester {semNum} Grades</button>
        </form>
      </section>
    );
  }

  function buildYearCard(title: string, grade: number | null, highlight = false) {
    const dv = displayGrade(grade);
    const lg = letterGrade(grade);
    const st = passFail(grade);
    const statusCls = st === 'Pass' ? styles.statusPass : st === 'Fail' ? styles.statusFail : styles.statusNone;
    const clr = gradeClass(grade);
    return (
      <div className={styles.yearCard} style={highlight ? { border: '2px solid #667eea' } : {}}>
        <p className={styles.yearCardLabel}>{title}</p>
        <p className={`${styles.yearCardValue} ${clr}`}>{dv}</p>
        <p className={`${styles.yearCardLetter} ${clr}`}>{lg}</p>
        <span className={`${styles.yearCardStatus} ${statusCls}`}>{st}</span>
      </div>
    );
  }

  function buildBreakdownTable(rows: ReturnType<typeof semesterRows>, caption: string) {
    if (!rows.length) return <div><p className={styles.noData}>No data entered for this semester yet.</p></div>;
    const totalContrib = rows.filter((r) => typeof r.contribution === 'number').reduce((s, r) => s + (r.contribution as number), 0);
    return (
      <div>
        <table className={styles.breakdownTable}>
          <caption>{caption}</caption>
          <thead>
            <tr><th>Component</th><th>Weight</th><th>Score</th><th>Contribution</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{row.weight}</td>
                <td>{typeof row.value === 'number' ? row.value.toFixed(2) : row.value}</td>
                <td>{typeof row.contribution === 'number' ? row.contribution.toFixed(2) : row.contribution}</td>
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td colSpan={3}>Semester Total</td>
              <td>{totalContrib.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const initial = encodeURIComponent((student.name.charAt(0) || 'S').toUpperCase());
  const fallbackPic = `https://via.placeholder.com/72/667eea/ffffff?text=${initial}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>← Back</button>
        <h1>📊 Grade Report</h1>
        <button className={styles.printBtn} onClick={() => window.print()}>🖨️ Print</button>
      </header>

      {/* Banner */}
      <div className={styles.banner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={student.picture || fallbackPic} alt={student.name} className={styles.bannerPic} />
        <div className={styles.bannerInfo}>
          <h2>{student.name}</h2>
          <p>ID: {student.id}</p>
          <p>Academic Year {YEAR}</p>
        </div>
        <div className={styles.overallBadge}>
          <span className={`${styles.overallNum} ${gradeClass(report.overallAverage)}`}>
            {report.overallAverage !== null ? displayGrade(report.overallAverage) : '—'}
          </span>
          <span className={`${styles.overallLetter} ${gradeClass(report.overallAverage)}`}>{report.overallLetter}</span>
          <span className={`${styles.overallStatus} ${report.overallStatus === 'Pass' ? styles.statusPass : report.overallStatus === 'Fail' ? styles.statusFail : styles.statusNone}`}>
            {report.overallStatus}
          </span>
        </div>
      </div>

      {/* Subject tabs */}
      <div className={styles.tabs}>
        {SUBJECTS.map((s) => (
          <button
            key={s}
            className={`${styles.tabBtn} ${activeSubject === s ? styles.tabActive : ''}`}
            onClick={() => setActiveSubject(s)}
          >
            {SUBJECT_LABELS[s]}
          </button>
        ))}
      </div>

      <main className={styles.content}>
        {buildSemesterForm(1)}
        {buildSemesterForm(2)}

        <section className={styles.resultsPanel}>
          <h2>{SUBJECT_LABELS[activeSubject]} — Grade Breakdown</h2>
          <div className={styles.yearSummary}>
            {buildYearCard('Semester 1', result.sem1.grade)}
            {buildYearCard('Semester 2', result.sem2.grade)}
            {buildYearCard('Year Grade', result.yearGrade, true)}
          </div>
          <div className={styles.breakdownGrid}>
            {buildBreakdownTable(rows1, 'Semester 1 Breakdown')}
            {buildBreakdownTable(rows2, 'Semester 2 Breakdown')}
          </div>
        </section>

        {/* FastAPI lesson evaluations panel */}
        {evaluations && evaluations.length > 0 && (
          <section className={styles.resultsPanel} style={{ marginTop: '1.5rem' }}>
            <h2>📡 Lesson Evaluations (from backend)</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.breakdownTable}>
                <thead>
                  <tr>
                    <th>Lesson</th>
                    <th>Subject</th>
                    <th>Overall</th>
                    <th>Grammar</th>
                    <th>Comprehension</th>
                    <th>Pronunciation</th>
                    <th>Completed</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((ev) => (
                    <tr key={ev.evaluation_id}>
                      <td>{ev.content_id}</td>
                      <td>{ev.subject_id}</td>
                      <td>{ev.overall_score !== null && ev.overall_score !== undefined ? `${ev.overall_score}%` : '—'}</td>
                      <td>{ev.grammar_score !== null && ev.grammar_score !== undefined ? `${ev.grammar_score}%` : '—'}</td>
                      <td>{ev.comprehension_score !== null && ev.comprehension_score !== undefined ? `${ev.comprehension_score}%` : '—'}</td>
                      <td>{ev.pronunciation_score !== null && ev.pronunciation_score !== undefined ? `${ev.pronunciation_score}%` : '—'}</td>
                      <td>{ev.lesson_completed ? '✅' : '—'}</td>
                      <td style={{ fontSize: '.8rem', opacity: .8 }}>{ev.completion_date ? new Date(ev.completion_date).toLocaleDateString() : ev.created_at ? new Date(ev.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

export default function GradesPage() {
  return <AuthGuard>{(ctx) => <GradesContent ctx={ctx} />}</AuthGuard>;
}
