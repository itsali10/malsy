'use client';



import { FormEvent, useEffect, useState } from 'react';

import Link from 'next/link';

import { useRouter } from 'next/navigation';

import MalsyLogo from '../../../components/MalsyLogo';

import ThemeToggle from '../../../components/ThemeToggle';

import { adminApi } from '../../../lib/admin-api';

import { adminAuth } from '../../../lib/admin-auth';



export default function AdminLoginPage() {

  const router = useRouter();

  const [username, setUsername] = useState('admin');

  const [password, setPassword] = useState('');

  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);



  useEffect(() => {

    if (adminAuth.isLoggedIn()) router.replace('/admin/dashboard');

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('expired')) {

      setError('Your admin session expired. Please sign in again.');

    }

  }, [router]);



  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const trimmedUsername = username.trim();
      const trimmedPassword = password;
      if (!trimmedUsername || !trimmedPassword) {
        setError('Please enter your username and password.');
        setLoading(false);
        return;
      }
      const { access_token } = await adminApi.login(trimmedUsername, trimmedPassword);
      adminAuth.setToken(access_token);
      const me = await adminApi.me();
      adminAuth.setUser(me);
      router.replace('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }



  return (

    <div className="auth-root">

      <div className="auth-theme-toggle">

        <ThemeToggle />

      </div>

      <div className="auth-blob auth-blob-1" />

      <div className="auth-blob auth-blob-2" />



      <div className="auth-center">

        <div className="auth-top">

          <MalsyLogo variant="auth" />

          <div className="auth-sub">Admin Dashboard</div>

        </div>



        <div className="auth-card">

          <form onSubmit={handleSubmit}>

            <label className="field-label">Username</label>

            <input className="field-input" name="username" value={username} onChange={e => setUsername(e.target.value)} style={{ width: '100%', marginBottom: 16 }} autoComplete="username" required />

            <label className="field-label">Password</label>

            <input className="field-input" type="password" name="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 20 }} autoComplete="current-password" required />



            {error && <div className="auth-error">{error}</div>}



            <button type="submit" className="auth-submit" disabled={loading}>

              {loading ? 'Signing in…' : 'Sign in to Admin'}

            </button>

          </form>



          <div className="auth-footer" style={{ marginTop: 16 }}>

            <Link href="/login">← Back to student login</Link>

          </div>

        </div>

      </div>

    </div>

  );

}


