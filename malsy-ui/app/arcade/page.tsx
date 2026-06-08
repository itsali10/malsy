const games = [
  {
    thumb: '🎯', thumbBg: 'linear-gradient(135deg,#0d2d1a,#1a4f2e)',
    name: 'Hangman',
    desc: 'Guess the vocabulary word before running out of lives',
    best: '340 pts', btnClass: 'btn-m',
  },
  {
    thumb: '🐝', thumbBg: 'linear-gradient(135deg,#2d1f00,#4a3500)',
    name: 'Spelling Bee',
    desc: 'Type the correct spelling of words you hear',
    best: '520 pts',
    btnCustom: { background: 'var(--amber)', color: 'var(--navy)', borderRadius: 999, padding: '7px 14px', fontFamily: 'var(--fd)', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' } as React.CSSProperties,
    btnLabel: 'Play',
  },
  {
    thumb: '🚀', thumbBg: 'linear-gradient(135deg,#0a1a3d,#0e2a5c)',
    name: 'Space Blaster',
    desc: 'Answer questions to power your ship through space missions',
    best: '780 pts', btnClass: 'btn-v',
  },
  {
    thumb: '⚡', thumbBg: 'linear-gradient(135deg,#2d0d1a,#4a1028)',
    name: 'Flash Cards',
    desc: 'Flip and match terms with definitions against the clock',
    best: '210 pts', btnClass: 'btn-o',
  },
  {
    thumb: '🧩', thumbBg: 'linear-gradient(135deg,#0d2d2a,#0a3d38)',
    name: 'Word Builder',
    desc: 'Arrange jumbled letters to form the correct science terms',
    best: '390 pts', btnClass: 'btn-o',
  },
  {
    thumb: '🗣️', thumbBg: 'rgba(255,255,255,.04)',
    name: 'Debate Arena',
    desc: 'Coming soon — AI-powered debate practice mode',
    best: '500 pts to unlock', btnClass: 'btn-o', locked: true,
  },
];

export default function ArcadePage() {
  return (
    <div className="page-enter">
      {/* Hero */}
      <div className="arcade-hero">
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎮</div>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 24, fontWeight: 800, marginBottom: 6 }}>MALSY Arcade</div>
        <div style={{ fontSize: 13, color: 'var(--g3)' }}>Play vocabulary games, earn XP, and challenge your classmates.</div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 24 }}>
          {[['1,240','Total Game XP','var(--amber)'], ['34','Games Played','var(--mint)'], ['88%','Win Rate','var(--vl)']].map(([v, l, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--fd)', fontSize: 22, fontWeight: 800, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: 'var(--g3)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Games */}
      <div className="game-grid">
        {games.map(g => (
          <div key={g.name} className="game-card" style={g.locked ? { opacity: .55 } : {}}>
            <div className="gc-thumb" style={{ background: g.thumbBg }}>{g.thumb}</div>
            <div className="gc-body">
              <div className="gc-name">{g.name}</div>
              <div className="gc-desc">{g.desc}</div>
              <div className="gc-bottom">
                <div className="gc-hi">Best: <span>{g.best}</span></div>
                {g.btnCustom ? (
                  <button style={g.btnCustom}>{g.btnLabel ?? 'Play'}</button>
                ) : (
                  <button className={`btn ${g.btnClass} btn-sm`} disabled={g.locked}>
                    {g.locked ? 'Soon' : 'Play'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
