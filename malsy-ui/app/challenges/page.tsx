export default function ChallengesPage() {
  const items = [
    {
      rank: 1, rankColor: 'var(--amber)', icon: '⚗️',
      iconBg: 'linear-gradient(135deg,rgba(255,184,48,.2),rgba(255,184,48,.05))',
      name: 'Chemistry Blitz',
      desc: 'Answer 20 chemistry questions — no wrong answers allowed',
      xp: '+250 XP', diff: 'Hard',
      diffStyle: { background: 'rgba(255,107,107,.15)', color: 'var(--coral)' },
      btnClass: 'btn-o',
    },
    {
      rank: 2, rankColor: 'var(--g3)', icon: '🧬',
      iconBg: 'linear-gradient(135deg,rgba(0,229,160,.15),rgba(0,229,160,.05))',
      name: 'Bio Speed Round',
      desc: '60-second rapid-fire biology questions',
      xp: '+120 XP', diff: 'Medium',
      diffStyle: { background: 'rgba(255,184,48,.12)', color: 'var(--amber)' },
      btnClass: 'btn-m',
    },
    {
      rank: 3, rankColor: 'var(--g3)', icon: '🧮',
      iconBg: 'linear-gradient(135deg,rgba(59,191,255,.15),rgba(59,191,255,.05))',
      name: 'Math Warm-Up',
      desc: '10 algebra equations — beat your personal best',
      xp: '+80 XP', diff: 'Easy',
      diffStyle: { background: 'rgba(0,229,160,.1)', color: 'var(--mint)' },
      btnClass: 'btn-o',
    },
    {
      rank: 4, rankColor: 'var(--g3)', icon: '🔬',
      iconBg: 'linear-gradient(135deg,rgba(91,33,245,.15),rgba(91,33,245,.05))',
      name: 'Science Master Series',
      desc: 'Complete 3 science lessons in a row without hints',
      xp: '+400 XP', diff: 'Hard',
      diffStyle: { background: 'rgba(255,107,107,.15)', color: 'var(--coral)' },
      btnClass: 'btn-o',
    },
  ];

  return (
    <div className="page-enter">
      {/* Daily / Weekly cards */}
      <div className="g2" style={{ marginBottom: 24 }}>
        <div className="card" style={{ background: 'linear-gradient(135deg,rgba(255,184,48,.12),rgba(255,184,48,.04))', borderColor: 'rgba(255,184,48,.2)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
          <div className="card-title" style={{ fontSize: 16 }}>Daily Challenge</div>
          <div style={{ fontSize: 13, color: 'var(--g3)', margin: '6px 0 14px' }}>
            Photosynthesis Quiz — 10 questions · Ends in 06:32:14
          </div>
          <button className="btn btn-sm" style={{ background: 'var(--amber)', color: 'var(--navy)', border: 'none', borderRadius: 999, padding: '7px 14px', fontFamily: 'var(--fd)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            Start Challenge
          </button>
        </div>
        <div className="card" style={{ background: 'linear-gradient(135deg,rgba(91,33,245,.15),rgba(91,33,245,.04))', borderColor: 'rgba(91,33,245,.2)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏆</div>
          <div className="card-title" style={{ fontSize: 16 }}>Weekly Tournament</div>
          <div style={{ fontSize: 13, color: 'var(--g3)', margin: '6px 0 14px' }}>
            Science Showdown · 48 students competing · #4 rank
          </div>
          <button className="btn btn-v">View Rankings</button>
        </div>
      </div>

      <div className="card-title" style={{ marginBottom: 16 }}>Active Challenges</div>

      {items.map(item => (
        <div key={item.name} className="challenge-item">
          <div className="ch-rank" style={{ color: item.rankColor }}>{item.rank}</div>
          <div className="ch-icon" style={{ background: item.iconBg }}>{item.icon}</div>
          <div className="ch-body">
            <div className="ch-name">{item.name}</div>
            <div className="ch-desc">{item.desc}</div>
          </div>
          <div className="ch-right">
            <div className="ch-xp">{item.xp}</div>
            <div className="ch-xpl">reward</div>
            <div className="ch-diff" style={item.diffStyle}>{item.diff}</div>
          </div>
          <button className={`btn ${item.btnClass} btn-sm`}>Start</button>
        </div>
      ))}
    </div>
  );
}
