'use client';

import { useState } from 'react';
import Toggle from '../../components/ui/Toggle';
import { useTheme, type Theme } from '../../lib/theme';

const tabs = [
  { icon: '🎨', label: 'Appearance' },
  { icon: '🔔', label: 'Notifications' },
  { icon: '🔊', label: 'Audio & Voice' },
  { icon: '🌐', label: 'Language' },
  { icon: '🔒', label: 'Privacy' },
  { icon: '♿', label: 'Accessibility' },
  { icon: 'ℹ️', label: 'About MALSY' },
];

const THEMES: { id: Theme; label: string; desc: string; bg: string; dot1: string; dot2: string; dot3: string }[] = [
  {
    id: 'dark',
    label: 'Dark',
    desc: 'Soft navy — easy on the eyes',
    bg: '#1E2235',
    dot1: '#AFA8FF', dot2: '#B8F2D8', dot3: '#2D3348',
  },
  {
    id: 'light',
    label: 'Light',
    desc: 'Pale violet — bright and clean',
    bg: '#F7F8FF',
    dot1: '#8F86F5', dot2: '#3D9B6E', dot3: '#DCD7FF',
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [vol, setVol] = useState(80);
  const { theme, setTheme } = useTheme();

  return (
    <div className="page-enter">
      <div className="settings-layout">
        {/* Left nav */}
        <div className="settings-nav">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              className={`settings-nav-item${activeTab === i ? ' active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              <span className="sni">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Right body */}
        <div className="settings-body">
          {/* Appearance */}
          {activeTab === 0 && (
          <div className="setting-group">
            <div className="sg-title">Theme</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 8 }}>
              {THEMES.map(t => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      borderRadius: 16,
                      outline: active ? `2px solid var(--mint)` : '2px solid transparent',
                      outlineOffset: 3,
                      transition: 'outline .15s',
                    }}
                  >
                    {/* Mini preview card */}
                    <div style={{
                      borderRadius: 14, overflow: 'hidden',
                      border: `1px solid ${active ? 'var(--mint)' : 'rgba(255,255,255,.1)'}`,
                    }}>
                      {/* Preview bg */}
                      <div style={{ background: t.bg, padding: '18px 16px 14px', position: 'relative' }}>
                        {/* Fake sidebar strip */}
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, background: t.dot3, opacity: .9 }} />
                        {/* Fake content dots */}
                        <div style={{ marginLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div style={{ height: 6, width: '70%', borderRadius: 99, background: t.dot1, opacity: .9 }} />
                          <div style={{ height: 4, width: '50%', borderRadius: 99, background: t.dot2, opacity: .7 }} />
                          <div style={{ height: 4, width: '60%', borderRadius: 99, background: t.dot1, opacity: .4 }} />
                        </div>
                        {/* Active check */}
                        {active && (
                          <div style={{
                            position: 'absolute', top: 8, right: 8,
                            width: 18, height: 18, borderRadius: '50%',
                            background: 'var(--mint)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: '#0D0B2E', fontWeight: 800,
                          }}>✓</div>
                        )}
                      </div>
                      {/* Label strip */}
                      <div style={{
                        background: 'rgba(255,255,255,.04)', padding: '8px 12px',
                        textAlign: 'left',
                      }}>
                        <div style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 12, color: 'var(--w)' }}>{t.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--g3)', marginTop: 2 }}>{t.desc}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="setting-row" style={{ marginTop: 8 }}>
              <span className="sr-icon">✨</span>
              <div className="sr-body">
                <div className="sr-name">Space Theme</div>
                <div className="sr-desc">Apply cosmic animations to the background</div>
              </div>
              <Toggle defaultOn />
            </div>
          </div>
          )}

          {/* Notifications */}
          {activeTab === 1 && (
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
          )}

          {/* Audio */}
          {activeTab === 2 && (
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
          )}

          {/* Language */}
          {activeTab === 3 && (
          <div className="setting-group">
            <div className="sg-title">Language</div>
            <div className="setting-row">
              <span className="sr-icon">🌐</span>
              <div className="sr-body">
                <div className="sr-name">App Language</div>
                <div className="sr-desc">Language used across the interface</div>
              </div>
              <select className="select-box">
                <option>English</option>
                <option>العربية</option>
                <option>Français</option>
              </select>
            </div>
            <div className="setting-row">
              <span className="sr-icon">📚</span>
              <div className="sr-body">
                <div className="sr-name">Lesson Language</div>
                <div className="sr-desc">Language for lesson content and the AI tutor</div>
              </div>
              <select className="select-box">
                <option>English</option>
                <option>العربية</option>
              </select>
            </div>
          </div>
          )}

          {/* Privacy */}
          {activeTab === 4 && (
          <div className="setting-group">
            <div className="sg-title">Privacy</div>
            <div className="setting-row">
              <span className="sr-icon">📈</span>
              <div className="sr-body">
                <div className="sr-name">Usage Analytics</div>
                <div className="sr-desc">Help improve MALSY by sharing anonymous usage data</div>
              </div>
              <Toggle defaultOn />
            </div>
            <div className="setting-row">
              <span className="sr-icon">🏆</span>
              <div className="sr-body">
                <div className="sr-name">Show on Leaderboard</div>
                <div className="sr-desc">Display your name and rank to classmates</div>
              </div>
              <Toggle defaultOn />
            </div>
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
          )}

          {/* Accessibility */}
          {activeTab === 5 && (
          <div className="setting-group">
            <div className="sg-title">Accessibility</div>
            <div className="setting-row">
              <span className="sr-icon">🎬</span>
              <div className="sr-body">
                <div className="sr-name">Reduce Motion</div>
                <div className="sr-desc">Minimize animations across the app</div>
              </div>
              <Toggle />
            </div>
            <div className="setting-row">
              <span className="sr-icon">🔆</span>
              <div className="sr-body">
                <div className="sr-name">High Contrast</div>
                <div className="sr-desc">Increase contrast for better readability</div>
              </div>
              <Toggle />
            </div>
            <div className="setting-row">
              <span className="sr-icon">🔠</span>
              <div className="sr-body">
                <div className="sr-name">Larger Text</div>
                <div className="sr-desc">Increase font size throughout the app</div>
              </div>
              <Toggle />
            </div>
          </div>
          )}

          {/* About */}
          {activeTab === 6 && (
          <div className="setting-group">
            <div className="sg-title">About MALSY</div>
            <div className="setting-row">
              <span className="sr-icon">ℹ️</span>
              <div className="sr-body">
                <div className="sr-name">Version</div>
                <div className="sr-desc">MALSY Learning Platform · v1.0.0</div>
              </div>
            </div>
            <div className="setting-row">
              <span className="sr-icon">📄</span>
              <div className="sr-body">
                <div className="sr-name">Terms &amp; Privacy Policy</div>
                <div className="sr-desc">Review how your data is used and stored</div>
              </div>
            </div>
            <div className="setting-row">
              <span className="sr-icon">💬</span>
              <div className="sr-body">
                <div className="sr-name">Support</div>
                <div className="sr-desc">Contact us at support@malsy.app</div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
