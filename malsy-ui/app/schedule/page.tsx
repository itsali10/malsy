import ProgressBar from '../../components/ui/ProgressBar';

const days = [
  { name: 'Sun', num: 1, hasClass: true },
  { name: 'Mon', num: 2, hasClass: true },
  { name: 'Tue', num: 3, hasClass: true, today: true },
  { name: 'Wed', num: 4, hasClass: true },
  { name: 'Thu', num: 5 },
  { name: 'Fri', num: 6 },
  { name: 'Sat', num: 7 },
];

const classes = [
  { time: '08:00', color: 'var(--mint)',  name: 'Biology — Plant Cell Cont.',     teacher: 'Mr. Ahmed Samy · Room 204',  pill: 'pill-m', pillLabel: 'Now' },
  { time: '09:30', color: 'var(--sky)',   name: 'Mathematics — Algebra Unit 5',   teacher: 'Ms. Hana Khalil · Room 110', pill: 'pill-s', pillLabel: 'Up Next' },
  { time: '11:00', color: 'var(--vl)',    name: 'Chemistry — Atomic Structure',    teacher: 'Dr. Rania Farouk · Lab 3',   pill: 'pill-v', pillLabel: 'Lab Session' },
  { time: '12:30', color: 'var(--coral)', name: 'Arabic Language — Monthly Exam', teacher: 'Ms. Nour Adel · Room 302',   pill: 'pill-c', pillLabel: 'Exam!' },
  { time: '14:00', color: 'var(--amber)', name: 'MALSY Arcade Session',           teacher: 'Free study · Vocab games available', pill: 'pill-a', pillLabel: 'Free Time' },
];

const exams = [
  { name: 'Arabic Monthly Exam', when: 'Today · 12:30 PM',    pill: 'pill-c', label: 'Today' },
  { name: 'Biology Weekly Quiz',  when: 'Jun 8 · After Unit 3', pill: 'pill-s', label: '5 Days' },
  { name: 'Math Unit 5 Exam',    when: 'Jun 12 · 09:30 AM',   pill: 'pill-v', label: '9 Days' },
];

export default function SchedulePage() {
  return (
    <div className="page-enter">
      {/* Week bar */}
      <div className="week-bar">
        {days.map(d => (
          <div key={d.num} className={`day-btn${d.today ? ' today' : ''}${d.hasClass ? ' has-class' : ''}`}>
            <div className="day-name">{d.name}</div>
            <div className="day-num">{d.num}</div>
          </div>
        ))}
      </div>

      <div className="g-left">
        {/* Schedule */}
        <div>
          <div className="card-title" style={{ marginBottom: 16 }}>Tuesday, June 3 · Today</div>
          {classes.map(c => (
            <div key={c.time} className="sched-item" style={{ borderLeftColor: c.color }}>
              <div className="si-time">{c.time}</div>
              <div className="si-dot" style={{ background: c.color }} />
              <div className="si-body">
                <div className="si-name">{c.name}</div>
                <div className="si-teacher">{c.teacher}</div>
              </div>
              <div className="si-right">
                <span className={`pill ${c.pill}`}>{c.pillLabel}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Attendance */}
          <div className="card">
            <div className="card-title">Attendance</div>
            <div className="card-sub">This semester</div>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 40, fontWeight: 800, color: 'var(--mint)', lineHeight: 1 }}>92%</div>
            <div style={{ fontSize: 11, color: 'var(--g3)', marginTop: 4, marginBottom: 12 }}>Present 46 / 50 days</div>
            <ProgressBar value={92} color="var(--mint)" />
          </div>

          {/* Upcoming exams */}
          <div className="card">
            <div className="card-title">Upcoming Exams</div>
            <div className="card-sub">Next 2 weeks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {exams.map((e, i) => (
                <div key={e.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < exams.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--g3)' }}>{e.when}</div>
                  </div>
                  <span className={`pill ${e.pill}`}>{e.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
