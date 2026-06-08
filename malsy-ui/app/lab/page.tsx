'use client';

import { useEffect, useState } from 'react';
import { api, LabExperiment, LabSession } from '../../lib/api';

// ── Fallback data (used when backend has no experiments) ─────────

const FALLBACK: LabExperiment[] = [
  { experiment_id: 'f1', title: 'Photosynthesis Rate Experiment', subject: 'Biology', difficulty: 'medium', duration_minutes: 30, description: 'Measure how light intensity affects the rate of photosynthesis in aquatic plants.' },
  { experiment_id: 'f2', title: 'Acid-Base Titration',            subject: 'Chemistry', difficulty: 'hard',   duration_minutes: 45, description: 'Determine the concentration of an unknown acid by titrating with a known base.' },
  { experiment_id: 'f3', title: 'Simple Circuit Building',        subject: 'Physics',   difficulty: 'easy',   duration_minutes: 20, description: 'Build and test basic series and parallel electrical circuits.' },
  { experiment_id: 'f4', title: 'Water Density Columns',          subject: 'Science',   difficulty: 'easy',   duration_minutes: 15, description: 'Create colourful density columns using liquids of different densities.' },
  { experiment_id: 'f5', title: 'Cell Division Under Microscope', subject: 'Biology',   difficulty: 'medium', duration_minutes: 40, description: 'Observe and document the stages of mitosis in onion root tip cells.' },
];

// ── Helpers ──────────────────────────────────────────────────────

const SUBJ_META: Record<string, { icon: string; bg: string }> = {
  biology:   { icon: '🌱', bg: 'linear-gradient(135deg,rgba(0,229,160,.12),rgba(59,191,255,.06))' },
  chemistry: { icon: '⚗️', bg: 'linear-gradient(135deg,rgba(91,33,245,.12),rgba(91,33,245,.04))' },
  physics:   { icon: '⚡', bg: 'linear-gradient(135deg,rgba(255,184,48,.1),rgba(255,107,107,.06))' },
  science:   { icon: '🧪', bg: 'linear-gradient(135deg,rgba(59,191,255,.1),rgba(59,191,255,.04))' },
};

function expMeta(subject?: string) {
  const key = (subject ?? '').toLowerCase();
  return SUBJ_META[key] ?? { icon: '🔬', bg: 'rgba(255,255,255,.04)' };
}

const DIFF_STYLE: Record<string, React.CSSProperties> = {
  easy:   { background: 'rgba(0,229,160,.15)',  color: 'var(--mint)' },
  medium: { background: 'rgba(255,184,48,.12)', color: 'var(--amber)' },
  hard:   { background: 'rgba(255,107,107,.15)',color: 'var(--coral)' },
};

// ── Lab session modal ────────────────────────────────────────────

type LabPhase = 'confirm' | 'in_progress' | 'submitting' | 'complete' | 'error';

function LabModal({
  experiment,
  onClose,
  onComplete,
}: {
  experiment: LabExperiment;
  onClose: () => void;
  onComplete: (session: LabSession) => void;
}) {
  const [phase, setPhase] = useState<LabPhase>('confirm');
  const [session, setSession] = useState<LabSession | null>(null);
  const [safety, setSafety] = useState(true);
  const [achieved, setAchieved] = useState(true);
  const [score, setScore] = useState(80);
  const [errorMsg, setErrorMsg] = useState('');
  const isFallback = experiment.experiment_id.startsWith('f');

  async function startSession() {
    if (isFallback) {
      // Fallback mode: simulate session without backend
      setSession({ session_id: 'local', experiment_id: experiment.experiment_id, session_status: 'in_progress', experiment });
      setPhase('in_progress');
      return;
    }
    try {
      const s = await api.labs.startSession(experiment.experiment_id);
      setSession(s);
      setPhase('in_progress');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to start lab session');
      setPhase('error');
    }
  }

  async function completeSession() {
    setPhase('submitting');
    if (!session || isFallback) {
      setPhase('complete');
      onComplete({ ...(session ?? { session_id: 'local', experiment_id: experiment.experiment_id, session_status: 'completed' }), final_score: score, safety_compliance: safety, expected_result_achieved: achieved, session_status: 'completed' });
      return;
    }
    try {
      const updated = await api.labs.updateSession(session.session_id, {
        session_status: 'completed',
        safety_compliance: safety,
        expected_result_achieved: achieved,
        final_score: score,
      });
      setPhase('complete');
      onComplete(updated);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to submit results');
      setPhase('error');
    }
  }

  const meta = expMeta(experiment.subject);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {meta.icon}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: 15 }}>{experiment.title}</div>
              <div style={{ fontSize: 11, color: 'var(--g3)' }}>{experiment.subject} · {experiment.duration_minutes ?? '—'} min</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">

          {/* ── CONFIRM ── */}
          {phase === 'confirm' && (
            <div>
              {experiment.description && (
                <div style={{ fontSize: 13, color: 'var(--g3)', lineHeight: 1.7, marginBottom: 16 }}>
                  {experiment.description}
                </div>
              )}
              {experiment.learning_objectives && experiment.learning_objectives.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="field-label" style={{ marginBottom: 8 }}>Learning Objectives</div>
                  {experiment.learning_objectives.map((obj, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--g3)', marginBottom: 4 }}>• {obj}</div>
                  ))}
                </div>
              )}
              {experiment.equipment && experiment.equipment.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="field-label" style={{ marginBottom: 8 }}>Equipment Needed</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {experiment.equipment.map(eq => (
                      <span key={eq} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 999, padding: '3px 10px', fontSize: 11 }}>{eq}</span>
                    ))}
                  </div>
                </div>
              )}
              <button className="auth-submit" onClick={startSession}>
                Start Lab Session →
              </button>
            </div>
          )}

          {/* ── IN PROGRESS ── */}
          {phase === 'in_progress' && (
            <div>
              <div className="session-teacher-box" style={{ marginBottom: 20 }}>
                <div className="session-teacher-label">Lab in Progress</div>
                <div style={{ fontSize: 13, color: 'var(--g3)', lineHeight: 1.7 }}>
                  Complete the experiment steps, then fill in your results below.
                </div>
              </div>

              {/* Safety compliance */}
              <div className="field-group">
                <div className="field-label">Safety Compliance</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[true, false].map(v => (
                    <label key={String(v)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '8px 14px', borderRadius: 10, background: safety === v ? 'rgba(91,33,245,.15)' : 'rgba(255,255,255,.05)', border: `1px solid ${safety === v ? 'rgba(91,33,245,.3)' : 'rgba(255,255,255,.1)'}`, transition: 'all .15s' }}>
                      <input type="radio" name="safety" checked={safety === v} onChange={() => setSafety(v)} style={{ accentColor: 'var(--v)' }} />
                      {v ? 'Yes — all procedures followed' : 'No — deviation occurred'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Expected result */}
              <div className="field-group">
                <div className="field-label">Expected Result Achieved?</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[true, false].map(v => (
                    <label key={String(v)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '8px 14px', borderRadius: 10, background: achieved === v ? 'rgba(0,229,160,.1)' : 'rgba(255,255,255,.05)', border: `1px solid ${achieved === v ? 'rgba(0,229,160,.3)' : 'rgba(255,255,255,.1)'}`, transition: 'all .15s' }}>
                      <input type="radio" name="achieved" checked={achieved === v} onChange={() => setAchieved(v)} style={{ accentColor: 'var(--mint)' }} />
                      {v ? 'Yes' : 'No'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Self-score */}
              <div className="field-group">
                <div className="field-label">Self-Assessment Score: <span style={{ color: 'var(--vl)' }}>{score}%</span></div>
                <input
                  type="range"
                  className="range-slider"
                  style={{ width: '100%' }}
                  min={0} max={100} step={5}
                  value={score}
                  onChange={e => setScore(Number(e.target.value))}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--g5)', marginTop: 4 }}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>

              <button className="auth-submit" onClick={completeSession}>
                Submit Lab Results →
              </button>
            </div>
          )}

          {/* ── SUBMITTING ── */}
          {phase === 'submitting' && (
            <div className="modal-center">
              <div className="modal-spinner" />
              <div style={{ marginTop: 14, color: 'var(--g3)', fontSize: 13 }}>Saving your results…</div>
            </div>
          )}

          {/* ── COMPLETE ── */}
          {phase === 'complete' && (
            <div className="modal-center">
              <div style={{ fontSize: 48, marginBottom: 12 }}>🧪</div>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Lab Complete!</div>
              <div style={{ fontSize: 13, color: 'var(--g3)', marginBottom: 8 }}>Score: <span style={{ color: 'var(--mint)', fontWeight: 700 }}>{score}%</span></div>
              <div style={{ fontSize: 12, color: 'var(--g5)', marginBottom: 24 }}>Results reported to your teacher.</div>
              <button className="auth-submit" onClick={onClose}>Back to Lab</button>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <div>
              <div className="auth-error" style={{ marginBottom: 16 }}>{errorMsg}</div>
              <button className="auth-submit" onClick={() => setPhase('confirm')}>Go Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────

export default function LabPage() {
  const [experiments, setExperiments] = useState<LabExperiment[]>([]);
  const [sessions, setSessions] = useState<LabSession[]>([]);
  const [active, setActive] = useState<LabExperiment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.labs.experiments().catch(() => []),
      api.labs.mySessions().catch(() => []),
    ]).then(([exps, sess]) => {
      setExperiments(Array.isArray(exps) && exps.length ? exps : FALLBACK);
      setSessions(Array.isArray(sess) ? sess : []);
    }).finally(() => setLoading(false));
  }, []);

  function sessionForExp(expId: string): LabSession | undefined {
    return sessions.find(s => s.experiment_id === expId);
  }

  function statusFor(exp: LabExperiment) {
    const s = sessionForExp(exp.experiment_id);
    if (!s) return { label: 'Pending', style: { background: 'rgba(255,184,48,.12)', color: 'var(--amber)' } as React.CSSProperties };
    if (s.session_status === 'completed') return { label: 'Done ✓', style: { background: 'rgba(0,229,160,.15)', color: 'var(--mint)' } as React.CSSProperties };
    return { label: 'In Lab', style: { background: 'rgba(59,191,255,.15)', color: 'var(--sky)' } as React.CSSProperties };
  }

  const done   = sessions.filter(s => s.session_status === 'completed').length;
  const inProg = sessions.filter(s => s.session_status !== 'completed').length;

  return (
    <div className="page-enter">
      {/* Hero */}
      <div className="lab-hero">
        <div className="lab-icon-big">🔬</div>
        <div>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Virtual Lab</div>
          <div style={{ fontSize: 13, color: 'var(--g3)', marginBottom: 14 }}>
            AI-guided lab experiments that match your school curriculum. Results are reported to your teacher.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <span className="pill pill-m">{done} Completed</span>
            <span className="pill pill-s">{inProg} In Progress</span>
            <span className="pill pill-v">{loading ? '…' : experiments.length - done - inProg} Pending</span>
          </div>
        </div>
      </div>

      {/* Experiments grid */}
      <div className="exp-grid">
        {experiments.map(e => {
          const m = expMeta(e.subject);
          const st = statusFor(e);
          const diff = DIFF_STYLE[(e.difficulty ?? 'medium').toLowerCase()] ?? DIFF_STYLE.medium;
          return (
            <div key={e.experiment_id} className="exp-card">
              <div className="ec-thumb" style={{ background: m.bg }}>{m.icon}</div>
              <div className="ec-body">
                <div className="ec-title">{e.title}</div>
                <div className="ec-meta">
                  <span className="ec-subject">{e.subject}</span>
                  <span className="ec-status" style={st.style}>{st.label}</span>
                </div>
                {e.difficulty && (
                  <div style={{ marginTop: 6 }}>
                    <span style={{ ...diff, borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                      {e.difficulty.charAt(0).toUpperCase() + e.difficulty.slice(1)}
                    </span>
                  </div>
                )}
              </div>
              <button
                className="btn btn-v btn-sm"
                style={{ margin: '12px', flexShrink: 0 }}
                onClick={() => setActive(e)}
                disabled={sessionForExp(e.experiment_id)?.session_status === 'completed'}
              >
                {sessionForExp(e.experiment_id)?.session_status === 'completed' ? 'Done' : 'Start Lab'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {active && (
        <LabModal
          experiment={active}
          onClose={() => setActive(null)}
          onComplete={updated => {
            setSessions(prev => {
              const idx = prev.findIndex(s => s.session_id === updated.session_id);
              return idx >= 0 ? prev.map((s, i) => i === idx ? updated : s) : [...prev, updated];
            });
            setActive(null);
          }}
        />
      )}
    </div>
  );
}
