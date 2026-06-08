'use client';

import { useState } from 'react';

const messages = [
  { id: 1, initials: 'AI', bg: 'var(--v)',              name: 'MALSY AI Tutor',   time: 'Now',       preview: 'Your Photosynthesis quiz result is ready…',  unread: true  },
  { id: 2, initials: 'AS', bg: '#00B87E',               name: 'Mr. Ahmed Samy',   time: '9:14 AM',   preview: 'Great work on Chapter 3! Please review the…', unread: true  },
  { id: 3, initials: 'RF', bg: 'var(--amber)',           name: 'Dr. Rania Farouk', time: 'Yesterday', preview: 'Chemistry lab session tomorrow at 11 AM…',     unread: true, textColor: 'var(--navy)' },
  { id: 4, initials: 'HK', bg: '#3BBFFF',               name: 'Ms. Hana Khalil',  time: 'Mon',       preview: "Unit 5 starts Wednesday. Make sure you've…",  unread: false },
  { id: 5, initials: 'NA', bg: '#FF6B6B',               name: 'Nada Amin',        time: 'Mon',       preview: 'Did you finish the Hangman challenge? I got…',  unread: false },
];

export default function InboxPage() {
  const [active, setActive] = useState(1);

  return (
    <div className="page-enter" style={{ height: 'calc(100vh - 116px)' }}>
      <div className="inbox-layout">
        {/* Left: message list */}
        <div className="inbox-list">
          <input className="inbox-search" placeholder="🔍 Search messages…" />

          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--g5)', padding: '4px 8px', marginBottom: 8 }}>
            Unread (3)
          </div>

          {messages.filter(m => m.unread).map(m => (
            <div key={m.id} className={`msg-item unread${active === m.id ? ' active' : ''}`} onClick={() => setActive(m.id)}>
              <div className="msg-header">
                <div className="msg-av" style={{ background: m.bg, color: m.textColor }}>{m.initials}</div>
                <div className="msg-sender">{m.name}</div>
                <div className="msg-time">{m.time}</div>
              </div>
              <div className="msg-preview">{m.preview}</div>
            </div>
          ))}

          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--g5)', padding: '4px 8px', margin: '10px 0 8px' }}>
            All Messages
          </div>

          {messages.filter(m => !m.unread).map(m => (
            <div key={m.id} className={`msg-item${active === m.id ? ' active' : ''}`} onClick={() => setActive(m.id)}>
              <div className="msg-header">
                <div className="msg-av" style={{ background: m.bg }}>{m.initials}</div>
                <div className="msg-sender">{m.name}</div>
                <div className="msg-time">{m.time}</div>
              </div>
              <div className="msg-preview">{m.preview}</div>
            </div>
          ))}
        </div>

        {/* Right: thread view */}
        <div className="inbox-thread">
          <div className="thread-header">
            <div className="thread-subject">Your Photosynthesis Quiz Results 🎉</div>
            <div className="thread-meta">From MALSY AI Tutor · Just now</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            <div>
              <div className="bubble-name">MALSY AI</div>
              <div className="bubble them">
                Hi Sara! You just completed the Photosynthesis Quiz. Here&apos;s your breakdown:
              </div>
            </div>

            <div className="bubble them" style={{ borderRadius: '4px 16px 16px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center', marginBottom: 8 }}>
                {[['91%','Grammar','var(--mint)'],['88%','Comprehension','var(--sky)'],['94%','Pronunciation','var(--vl)']].map(([v,l,c]) => (
                  <div key={l}>
                    <div style={{ fontFamily: 'var(--fd)', fontSize: 22, fontWeight: 800, color: c as string }}>{v}</div>
                    <div style={{ fontSize: 10, color: 'var(--g3)' }}>{l}</div>
                  </div>
                ))}
              </div>
              You missed Question 7 about the Calvin Cycle. Want me to re-explain it?
            </div>

            <div style={{ alignSelf: 'flex-end' }}>
              <div className="bubble me">Yes please, I wasn&apos;t sure about that part!</div>
            </div>

            <div>
              <div className="bubble-name">MALSY AI</div>
              <div className="bubble them">
                The Calvin Cycle is the second stage of photosynthesis. It takes place in the stroma of the chloroplast and uses the ATP and NADPH produced in the light reactions to convert CO₂ into glucose. Think of it as the &quot;building&quot; phase…
              </div>
            </div>
          </div>

          <div className="inbox-compose">
            <textarea className="compose-input" placeholder="Type a message…" rows={2} />
            <button className="btn btn-v btn-sm">Send →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
