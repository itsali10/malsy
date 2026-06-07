'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { setChemistryLabVisited } from '@/lib/database';
import {
  isLoggedInToBackend,
  apiGetLabExperiments,
  apiPostLabSession,
  apiPutLabSession,
  type ApiLabExperiment,
} from '@/lib/api';
import type { AuthContext } from '@/lib/auth';
import styles from './lab.module.css';

// ── Data ──────────────────────────────────────────────────────────────────────

const EQUIPMENT = {
  glassware: [
    { id: 'beaker', name: 'Beaker', icon: '🥛', description: 'Used for mixing, heating, and storing liquids' },
    { id: 'flask', name: 'Erlenmeyer Flask', icon: '🧪', description: 'Conical flask for mixing and heating' },
    { id: 'test_tube', name: 'Test Tube', icon: '🧬', description: 'Small tube for reactions' },
    { id: 'graduated', name: 'Graduated Cylinder', icon: '📏', description: 'Precise volume measurement' },
    { id: 'burette', name: 'Burette', icon: '💧', description: 'Precise liquid dispensing' },
    { id: 'pipette', name: 'Pipette', icon: '🔬', description: 'Precise liquid transfer' },
    { id: 'funnel', name: 'Funnel', icon: '🔻', description: 'Liquid transfer and filtration' },
    { id: 'crucible', name: 'Crucible', icon: '🔥', description: 'High temperature reactions' },
  ],
  safety: [
    { id: 'goggles', name: 'Safety Goggles', icon: '🥽', description: 'Eye protection — always wear!' },
    { id: 'lab_coat', name: 'Lab Coat', icon: '👔', description: 'Body protection from spills' },
    { id: 'gloves', name: 'Gloves', icon: '🧤', description: 'Hand protection from chemicals' },
    { id: 'fume_hood', name: 'Fume Hood', icon: '💨', description: 'Ventilation for dangerous fumes' },
    { id: 'fire_ext', name: 'Fire Extinguisher', icon: '🧯', description: 'Fire safety equipment' },
    { id: 'first_aid', name: 'First Aid Kit', icon: '🏥', description: 'Medical supplies' },
    { id: 'eyewash', name: 'Eye Wash Station', icon: '👁️', description: 'Emergency eye care' },
  ],
  advanced: [
    { id: 'centrifuge', name: 'Centrifuge', icon: '🌀', description: 'Separation by centrifugation' },
    { id: 'spectro', name: 'Spectrophotometer', icon: '📊', description: 'Light absorption analysis' },
    { id: 'stirrer', name: 'Magnetic Stirrer', icon: '🔄', description: 'Automated mixing' },
    { id: 'vacuum', name: 'Vacuum Pump', icon: '💨', description: 'Pressure reduction' },
  ],
};

const CHEMICALS = [
  { id: 'water', name: 'Water', symbol: 'H₂O', icon: '💧', color: '#4FC3F7', safety: 'safe', pH: 7 },
  { id: 'hcl', name: 'Hydrochloric Acid', symbol: 'HCl', icon: '⚠️', color: '#FF6B6B', safety: 'danger', pH: 1 },
  { id: 'naoh', name: 'Sodium Hydroxide', symbol: 'NaOH', icon: '⚗️', color: '#FFD93D', safety: 'danger', pH: 14 },
  { id: 'nacl', name: 'Sodium Chloride', symbol: 'NaCl', icon: '🧂', color: '#FFFFFF', safety: 'safe', pH: 7 },
  { id: 'cuso4', name: 'Copper Sulfate', symbol: 'CuSO₄', icon: '💎', color: '#2196F3', safety: 'warning', pH: 4 },
  { id: 'h2o2', name: 'Hydrogen Peroxide', symbol: 'H₂O₂', icon: '💨', color: '#E1F5FE', safety: 'warning', pH: 6 },
  { id: 'nahco3', name: 'Sodium Bicarbonate', symbol: 'NaHCO₃', icon: '🍞', color: '#FFF9C4', safety: 'safe', pH: 8 },
  { id: 'vinegar', name: 'Acetic Acid', symbol: 'CH₃COOH', icon: '🍶', color: '#F5F5F5', safety: 'safe', pH: 3 },
  { id: 'ammonia', name: 'Ammonia', symbol: 'NH₃', icon: '☁️', color: '#E3F2FD', safety: 'warning', pH: 11 },
  { id: 'kmno4', name: 'Potassium Permanganate', symbol: 'KMnO₄', icon: '💜', color: '#9C27B0', safety: 'warning', pH: 7 },
];

const REACTIONS: Record<string, { equation: string; name: string; description: string; type: string; productColor: string }> = {
  'hcl+naoh': { equation: 'HCl + NaOH → NaCl + H₂O', name: 'Neutralization', description: 'Acid and base form salt and water. Exothermic!', type: 'neutralization', productColor: '#E3F2FD' },
  'hcl+nahco3': { equation: 'HCl + NaHCO₃ → NaCl + H₂O + CO₂↑', name: 'Acid-Base Reaction', description: 'Produces carbon dioxide gas — watch the bubbles!', type: 'gas_evolution', productColor: '#E8F5E9' },
  'vinegar+nahco3': { equation: 'CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + CO₂↑', name: 'Baking Soda & Vinegar', description: 'Classic safe reaction with lots of bubbles!', type: 'gas_evolution', productColor: '#F5F5F5' },
  'cuso4+naoh': { equation: 'CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄', name: 'Precipitation', description: 'Blue copper hydroxide precipitate forms!', type: 'precipitation', productColor: '#1565C0' },
  'h2o2+kmno4': { equation: '2KMnO₄ + 3H₂O₂ → MnO₂ + 2KOH + 3O₂↑', name: 'Oxidation Reaction', description: 'Vigorous bubbling — oxygen gas released!', type: 'oxidation', productColor: '#4A148C' },
  'ammonia+hcl': { equation: 'NH₃ + HCl → NH₄Cl', name: 'Ammonium Chloride Formation', description: 'White smoke/clouds appear! Use fume hood!', type: 'smoke', productColor: '#F5F5F5' },
};

function getReactionKey(a: string, b: string) {
  const sorted = [a, b].sort().join('+');
  return REACTIONS[sorted] ? sorted : [b, a].join('+');
}

const SAFETY_QUIZ = [
  { q: 'What should you ALWAYS wear in the lab?', opts: ['Goggles and gloves', 'Sunglasses', 'Nothing', 'Hat'], answer: 0 },
  { q: 'What do you do if a chemical splashes in your eyes?', opts: ['Rub your eyes', 'Use the eyewash station immediately', 'Ignore it', 'Blink fast'], answer: 1 },
  { q: 'How should you smell a chemical?', opts: ['Directly inhale', 'Use wafting technique', 'Ignore the smell', 'Put your face close'], answer: 1 },
  { q: 'What do you do with chemical waste?', opts: ['Pour down the sink', 'Dispose as directed by teacher', 'Leave on the bench', 'Throw in trash'], answer: 1 },
  { q: 'Before starting an experiment, you should:', opts: ['Jump right in', 'Read all instructions and safety rules', 'Guess the procedure', 'Ask a friend'], answer: 1 },
];

type Tab = 'equipment' | 'mixer' | 'ph' | 'quiz';

function LabContent({ ctx }: { ctx: AuthContext }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('equipment');
  const [equipCat, setEquipCat] = useState<keyof typeof EQUIPMENT>('glassware');
  const [selectedEquip, setSelectedEquip] = useState<(typeof EQUIPMENT.glassware)[0] | null>(null);
  const [chem1, setChem1] = useState<(typeof CHEMICALS)[0] | null>(null);
  const [chem2, setChem2] = useState<(typeof CHEMICALS)[0] | null>(null);
  const [reacting, setReacting] = useState(false);
  const [reactionResult, setReactionResult] = useState<typeof REACTIONS[string] | null>(null);
  const [phChem, setPhChem] = useState<(typeof CHEMICALS)[0] | null>(null);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);

  // FastAPI lab integration
  const [backendExperiments, setBackendExperiments] = useState<ApiLabExperiment[] | null>(null);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>('');
  const labSessionIdRef = useRef<string | null>(null);

  // Mark lab visited and fetch experiments on mount
  useEffect(() => {
    setChemistryLabVisited(ctx.student.id);
    if (isLoggedInToBackend()) {
      apiGetLabExperiments().then((exps) => {
        setBackendExperiments(exps);
        if (exps && exps.length > 0) setSelectedExperimentId(exps[0].experiment_id);
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doReaction() {
    if (!chem1 || !chem2) return;
    setReacting(true);

    // Start a backend lab session (silent if offline)
    if (isLoggedInToBackend() && selectedExperimentId) {
      apiPostLabSession(selectedExperimentId).then((session) => {
        if (session) labSessionIdRef.current = session.session_id;
      }).catch(() => {});
    }

    setTimeout(async () => {
      const key = getReactionKey(chem1.id, chem2.id);
      const result = REACTIONS[key] || null;
      setReactionResult(result);
      setReacting(false);

      // Complete the backend session
      if (isLoggedInToBackend() && labSessionIdRef.current) {
        apiPutLabSession(labSessionIdRef.current, {
          session_status: 'Completed',
          expected_result_achieved: !!result,
          number_of_attempts: 1,
        }).catch(() => {});
      }
    }, 1200);
  }

  function handleQuizAnswer(idx: number) {
    setQuizAnswer(idx);
    const isCorrect = idx === SAFETY_QUIZ[quizIdx].answer;
    if (isCorrect) setQuizScore((s) => s + 1);
    const nextScore = quizScore + (isCorrect ? 1 : 0);

    setTimeout(() => {
      setQuizAnswer(null);
      if (quizIdx < SAFETY_QUIZ.length - 1) {
        setQuizIdx((i) => i + 1);
      } else {
        setQuizDone(true);
        const finalScore = Math.round((nextScore / SAFETY_QUIZ.length) * 100);

        // Start a safety quiz session and record the score
        if (isLoggedInToBackend() && selectedExperimentId) {
          apiPostLabSession(selectedExperimentId).then((session) => {
            if (session) {
              return apiPutLabSession(session.session_id, {
                session_status: 'Completed',
                final_score: finalScore,
                safety_compliance: finalScore >= 60,
              });
            }
          }).catch(() => {});
        }
      }
    }, 1200);
  }

  function getPhColor(pH: number) {
    if (pH <= 2) return '#FF1744'; if (pH <= 4) return '#FF5722';
    if (pH <= 6) return '#FFC107'; if (pH === 7) return '#4CAF50';
    if (pH <= 9) return '#2196F3'; if (pH <= 11) return '#1565C0';
    return '#7B1FA2';
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/subject/science')}>← Science</button>
        <h1>⚗️ Chemistry Lab</h1>
        <span className={styles.badge}>Virtual Laboratory</span>
      </header>

      <div className={styles.tabs}>
        {(['equipment', 'mixer', 'ph', 'quiz'] as Tab[]).map((t) => (
          <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
            {t === 'equipment' ? '🔬 Equipment' : t === 'mixer' ? '⚗️ Mixer' : t === 'ph' ? '💧 pH Tester' : '🛡️ Safety Quiz'}
          </button>
        ))}
      </div>

      <main className={styles.content}>
        {/* ── Equipment Tab ── */}
        {tab === 'equipment' && (
          <div className={styles.equipmentSection}>
            <div className={styles.catTabs}>
              {(Object.keys(EQUIPMENT) as (keyof typeof EQUIPMENT)[]).map((cat) => (
                <button key={cat} className={`${styles.catBtn} ${equipCat === cat ? styles.catActive : ''}`} onClick={() => setEquipCat(cat)}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
            <div className={styles.equipGrid}>
              {EQUIPMENT[equipCat].map((item) => (
                <div key={item.id} className={`${styles.equipCard} ${selectedEquip?.id === item.id ? styles.equipSelected : ''}`} onClick={() => setSelectedEquip(item)}>
                  <span className={styles.equipIcon}>{item.icon}</span>
                  <span className={styles.equipName}>{item.name}</span>
                </div>
              ))}
            </div>
            {selectedEquip && (
              <div className={styles.equipDetail}>
                <span className={styles.equipDetailIcon}>{selectedEquip.icon}</span>
                <div>
                  <h3>{selectedEquip.name}</h3>
                  <p>{selectedEquip.description}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Mixer Tab ── */}
        {tab === 'mixer' && (
          <div className={styles.mixerSection}>
            <h2>Chemical Mixer</h2>
            <p className={styles.mixerHint}>Select two chemicals and observe the reaction!</p>

            {/* Backend experiment selector */}
            {backendExperiments && backendExperiments.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '.75rem 1rem', background: 'rgba(99,102,241,.1)', borderRadius: '.75rem', border: '1px solid rgba(99,102,241,.3)' }}>
                <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'block', marginBottom: '.4rem' }}>
                  🧪 Tracking Experiment (backend):
                </label>
                <select
                  value={selectedExperimentId}
                  onChange={(e) => setSelectedExperimentId(e.target.value)}
                  style={{ width: '100%', padding: '.4rem .6rem', borderRadius: '.4rem', border: '1px solid rgba(99,102,241,.4)', background: 'rgba(15,15,30,.8)', color: 'inherit', fontSize: '.9rem' }}
                >
                  {backendExperiments.map((exp) => (
                    <option key={exp.experiment_id} value={exp.experiment_id}>{exp.experiment_name}</option>
                  ))}
                </select>
                <p style={{ fontSize: '.78rem', opacity: .65, margin: '.3rem 0 0' }}>Your session will be recorded in the backend for the selected experiment.</p>
              </div>
            )}
            <div className={styles.chemRow}>
              <div>
                <h3>Chemical A</h3>
                <div className={styles.chemGrid}>
                  {CHEMICALS.map((c) => (
                    <div key={c.id} className={`${styles.chemCard} ${chem1?.id === c.id ? styles.chemSelected : ''}`} onClick={() => setChem1(c)} style={{ borderColor: c.color }}>
                      <span>{c.icon}</span>
                      <span className={styles.chemName}>{c.symbol}</span>
                      <span className={`${styles.safetyStar} ${styles[c.safety]}`}>{c.safety === 'safe' ? '✅' : c.safety === 'warning' ? '⚠️' : '❌'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.plusSign}>+</div>
              <div>
                <h3>Chemical B</h3>
                <div className={styles.chemGrid}>
                  {CHEMICALS.map((c) => (
                    <div key={c.id} className={`${styles.chemCard} ${chem2?.id === c.id ? styles.chemSelected : ''}`} onClick={() => setChem2(c)} style={{ borderColor: c.color }}>
                      <span>{c.icon}</span>
                      <span className={styles.chemName}>{c.symbol}</span>
                      <span className={`${styles.safetyStar} ${styles[c.safety]}`}>{c.safety === 'safe' ? '✅' : c.safety === 'warning' ? '⚠️' : '❌'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              className={styles.reactBtn}
              disabled={!chem1 || !chem2 || reacting}
              onClick={doReaction}
            >
              {reacting ? '🔄 Reacting…' : '⚗️ Mix & React!'}
            </button>
            {reactionResult && (
              <div className={styles.reactionResult} style={{ borderColor: reactionResult.productColor }}>
                <div className={styles.flask} style={{ background: reactionResult.productColor }}>
                  {reactionResult.type === 'gas_evolution' || reactionResult.type === 'oxidation' ? '💨' : reactionResult.type === 'precipitation' ? '❄️' : '✨'}
                </div>
                <div className={styles.reactionInfo}>
                  <h3>{reactionResult.name}</h3>
                  <p className={styles.equation}>{reactionResult.equation}</p>
                  <p className={styles.reactionDesc}>{reactionResult.description}</p>
                </div>
              </div>
            )}
            {chem1 && chem2 && !reactionResult && !reacting && (
              <p className={styles.noReaction}>Select chemicals and click Mix & React to see the reaction. If no known reaction exists, you&apos;ll get a warning.</p>
            )}
          </div>
        )}

        {/* ── pH Tester ── */}
        {tab === 'ph' && (
          <div className={styles.phSection}>
            <h2>💧 pH Tester</h2>
            <p>Select a chemical to measure its pH value.</p>
            <div className={styles.phChemGrid}>
              {CHEMICALS.map((c) => (
                <div key={c.id} className={`${styles.chemCard} ${phChem?.id === c.id ? styles.chemSelected : ''}`} onClick={() => setPhChem(c)}>
                  <span>{c.icon}</span>
                  <span className={styles.chemName}>{c.symbol}</span>
                </div>
              ))}
            </div>
            {phChem && (
              <div className={styles.phResult}>
                <div className={styles.phMeter} style={{ background: getPhColor(phChem.pH) }}>
                  <span className={styles.phValue}>{phChem.pH}</span>
                  <span className={styles.phLabel}>{phChem.pH < 7 ? 'Acidic' : phChem.pH === 7 ? 'Neutral' : 'Basic'}</span>
                </div>
                <div className={styles.phScale}>
                  {Array.from({ length: 15 }, (_, i) => (
                    <div key={i} className={styles.phCell} style={{ background: getPhColor(i), opacity: i === phChem.pH ? 1 : 0.4 }}>
                      {i}
                    </div>
                  ))}
                </div>
                <p className={styles.phInfo}><strong>{phChem.name}</strong> ({phChem.symbol}) — pH {phChem.pH}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Safety Quiz ── */}
        {tab === 'quiz' && (
          <div className={styles.quizSection}>
            <h2>🛡️ Lab Safety Quiz</h2>
            {quizDone ? (
              <div className={styles.quizDone}>
                <p className={styles.quizScore}>{quizScore} / {SAFETY_QUIZ.length}</p>
                <p>{quizScore >= 4 ? '🏆 Excellent! You know your lab safety.' : quizScore >= 3 ? '👍 Good job! Review the missed questions.' : '📚 Keep studying lab safety rules.'}</p>
                <button className={styles.restartBtn} onClick={() => { setQuizIdx(0); setQuizScore(0); setQuizDone(false); }}>Try Again</button>
              </div>
            ) : (
              <div className={styles.quizCard}>
                <p className={styles.quizCounter}>Question {quizIdx + 1} of {SAFETY_QUIZ.length}</p>
                <h3 className={styles.quizQuestion}>{SAFETY_QUIZ[quizIdx].q}</h3>
                <div className={styles.quizOptions}>
                  {SAFETY_QUIZ[quizIdx].opts.map((opt, i) => (
                    <button
                      key={i}
                      className={`${styles.quizOpt} ${quizAnswer !== null ? (i === SAFETY_QUIZ[quizIdx].answer ? styles.optCorrect : quizAnswer === i ? styles.optWrong : '') : ''}`}
                      onClick={() => quizAnswer === null && handleQuizAnswer(i)}
                      disabled={quizAnswer !== null}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function LabPage() {
  return <AuthGuard>{(ctx) => <LabContent ctx={ctx} />}</AuthGuard>;
}
