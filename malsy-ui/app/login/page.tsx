'use client';

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { auth } from '../../lib/auth';

type Tab = 'login' | 'register';

interface LoginForm { email: string; password: string; }
interface RegisterForm {
  first_name: string; last_name: string;
  email: string; password: string;
  grade_level: string; parent_email: string;
  showOptional: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [lf, setLf] = useState<LoginForm>({ email: '', password: '' });
  const [rf, setRf] = useState<RegisterForm>({
    first_name: '', last_name: '', email: '', password: '',
    grade_level: '', parent_email: '', showOptional: false,
  });

  function switchTab(t: Tab) { setTab(t); setError(''); setSuccess(''); }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { access_token } = await api.auth.login(lf.email, lf.password);
      auth.setToken(access_token);
      const user = await api.auth.me();
      auth.setUser(user);
      router.replace('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your credentials.');
    } finally { setLoading(false); }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.auth.register({
        first_name: rf.first_name.trim(), last_name: rf.last_name.trim(),
        email: rf.email.trim(), password: rf.password,
        grade_level: rf.grade_level ? parseInt(rf.grade_level, 10) : undefined,
        parent_email: rf.parent_email.trim() || undefined,
      });
      setSuccess('Account created! Sign in below.');
      setLf(p => ({ ...p, email: rf.email }));
      switchTab('login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Try again.');
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-root">
      {/* Decorative background blobs */}
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />

      <div className="auth-center">
        {/* Logo above the card */}
        <div className="auth-top">
          <div className="auth-logo-img">
            <Image src="/logos/1.png" alt="MALSY" width={64} height={64} style={{ objectFit: 'contain' }} unoptimized />
          </div>
          <div className="auth-wordmark">MAL<span>SY</span></div>
          <div className="auth-sub">Your AI-powered learning companion</div>
        </div>

        {/* Card */}
        <div className="auth-card">
          {/* Tabs */}
          <div className="auth-tabs">
            <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => switchTab('login')}>
              Sign In
            </button>
            <button className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => switchTab('register')}>
              Create Account
            </button>
          </div>

          {error   && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {/* ── LOGIN ── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} autoComplete="on">
              <div className="field-group">
                <label className="field-label">Email address</label>
                <input className="field-input" type="email" placeholder="your@email.com" required autoComplete="email"
                  value={lf.email} onChange={e => setLf(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="field-group">
                <label className="field-label">Password</label>
                <input className="field-input" type="password" placeholder="••••••••" required autoComplete="current-password"
                  value={lf.password} onChange={e => setLf(p => ({ ...p, password: e.target.value }))} />
              </div>
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In →'}
              </button>
              <div className="auth-footer">
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => switchTab('register')}>Create one</button>
              </div>
            </form>
          )}

          {/* ── REGISTER ── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} autoComplete="on">
              <div className="field-group">
                <div className="field-row">
                  <div>
                    <label className="field-label">First name</label>
                    <input className="field-input" type="text" placeholder="Sara" required
                      value={rf.first_name} onChange={e => setRf(p => ({ ...p, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="field-label">Last name</label>
                    <input className="field-input" type="text" placeholder="Ahmed" required
                      value={rf.last_name} onChange={e => setRf(p => ({ ...p, last_name: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Email address</label>
                <input className="field-input" type="email" placeholder="your@email.com" required autoComplete="email"
                  value={rf.email} onChange={e => setRf(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="field-group">
                <label className="field-label">Password</label>
                <input className="field-input" type="password" placeholder="Min. 8 characters" required minLength={8} autoComplete="new-password"
                  value={rf.password} onChange={e => setRf(p => ({ ...p, password: e.target.value }))} />
              </div>

              <div className="auth-section-toggle" onClick={() => setRf(p => ({ ...p, showOptional: !p.showOptional }))}>
                <span>{rf.showOptional ? '▾' : '▸'}</span> Optional details
              </div>

              {rf.showOptional && (
                <div className="field-group">
                  <div className="field-row">
                    <div>
                      <label className="field-label">Grade level</label>
                      <input className="field-input" type="number" placeholder="9" min={1} max={12}
                        value={rf.grade_level} onChange={e => setRf(p => ({ ...p, grade_level: e.target.value }))} />
                    </div>
                    <div>
                      <label className="field-label">Parent email</label>
                      <input className="field-input" type="email" placeholder="parent@email.com"
                        value={rf.parent_email} onChange={e => setRf(p => ({ ...p, parent_email: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Creating account…' : 'Create Account →'}
              </button>
              <div className="auth-footer">
                Already have an account?{' '}
                <button type="button" onClick={() => switchTab('login')}>Sign in</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
