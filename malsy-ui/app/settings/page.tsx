'use client';

import { useState } from 'react';
import Toggle from '../../components/ui/Toggle';

const tabs = [
  { icon: '🎨', label: 'Appearance' },
  { icon: '🔔', label: 'Notifications' },
  { icon: '🔊', label: 'Audio & Voice' },
  { icon: '🌐', label: 'Language' },
  { icon: '🔒', label: 'Privacy' },
  { icon: '♿', label: 'Accessibility' },
  { icon: 'ℹ️', label: 'About MALSY' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [vol, setVol] = useState(80);

  return (
    <div className="page-enter">
      <div className="settings-layout">
        {/* Left nav */}
        <div className="settings-nav">
          {tabs.map((t, i) => (
            <div
              key={t.label}
              className={`settings-nav-item${activeTab === i ? ' active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              <span className="sni">{t.icon}</span>
              {t.label}
            </div>
          ))}
        </div>

        {/* Right body */}
        <div className="settings-body">
          {/* Appearance */}
          <div className="setting-group">
            <div className="sg-title">Theme</div>
            <div className="setting-row">
              <span className="sr-icon">🌙</span>
              <div className="sr-body">
                <div className="sr-name">Dark Mode</div>
                <div className="sr-desc">Easier on the eyes during night study sessions</div>
              </div>
              <Toggle defaultOn />
            </div>
            <div className="setting-row">
              <span className="sr-icon">🎨</span>
              <div className="sr-body">
                <div className="sr-name">Accent Color</div>
                <div className="sr-desc">Choose your platform highlight color</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['var(--v)','var(--mint)','var(--coral)','var(--sky)'].map((c, i) => (
                  <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: i === 0 ? '2px solid white' : undefined, cursor: 'pointer' }} />
                ))}
              </div>
            </div>
            <div className="setting-row">
              <span className="sr-icon">✨</span>
              <div className="sr-body">
                <div className="sr-name">Space Theme</div>
                <div className="sr-desc">Apply cosmic animations to the background</div>
              </div>
              <Toggle defaultOn />
            </div>
          </div>

          {/* Notifications */}
          <div className="setting-group">
            <div className="sg-title">Notifications</div>
            <div className="setting-row">
              <span className="sr-icon">📫</span>
              <div className="sr-body">
                <div className="sr-name">Lesson Reminders</div>
                <div className="sr-desc">Get notified 15 min before a scheduled lesson</div>
              </div>
              <Toggle defaultOn />
            </div>
            <div className="setting-row">
              <span className="sr-icon">⚡</span>
              <div className="sr-body">
                <div className="sr-name">Challenge Alerts</div>
                <div className="sr-desc">Notify when new daily challenges are available</div>
              </div>
              <Toggle defaultOn />
            </div>
            <div className="setting-row">
              <span className="sr-icon">📊</span>
              <div className="sr-body">
                <div className="sr-name">Leaderboard Updates</div>
                <div className="sr-desc">Alert when your rank changes</div>
              </div>
              <Toggle />
            </div>
          </div>

          {/* Audio */}
          <div className="setting-group">
            <div className="sg-title">Audio &amp; AI Voice</div>
            <div className="setting-row">
              <span className="sr-icon">🔊</span>
              <div className="sr-body"><div className="sr-name">Master Volume</div></div>
              <div className="slider-wrap">
                <input
                  type="range" className="range-slider" min={0} max={100} value={vol}
                  onChange={e => setVol(Number(e.target.value))}
                />
                <div className="range-val">{vol}</div>
              </div>
            </div>
            <div className="setting-row">
              <span className="sr-icon">🗣️</span>
              <div className="sr-body">
                <div className="sr-name">AI Tutor Voice</div>
                <div className="sr-desc">Choose the voice for your MALSY AI tutor</div>
              </div>
              <select className="select-box">
                <option>Aria (Female)</option>
                <option>Zaid (Male)</option>
                <option>Nova (Neutral)</option>
              </select>
            </div>
            <div className="setting-row">
              <span className="sr-icon">🎵</span>
              <div className="sr-body">
                <div className="sr-name">Background Music</div>
                <div className="sr-desc">Ambient music during study sessions</div>
              </div>
              <Toggle />
            </div>
          </div>

          {/* Danger zone */}
          <div className="setting-group">
            <div className="sg-title">Danger Zone</div>
            <div className="setting-row" style={{ border: '1px solid rgba(255,107,107,.2)', background: 'rgba(255,107,107,.04)' }}>
              <span className="sr-icon">🚫</span>
              <div className="sr-body">
                <div className="sr-name" style={{ color: 'var(--coral)' }}>Reset All Progress</div>
                <div className="sr-desc">This will permanently delete your learning history</div>
              </div>
              <button className="btn btn-sm" style={{ background: 'rgba(255,107,107,.15)', color: 'var(--coral)', border: '1px solid rgba(255,107,107,.3)', borderRadius: 999, padding: '7px 14px', fontFamily: 'var(--fd)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
