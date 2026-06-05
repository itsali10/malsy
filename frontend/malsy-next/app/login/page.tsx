'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { initDB, createStudent, authenticateStudent, createSession, sanitizeStudent, getStudentById } from '@/lib/database';
import { getSession } from '@/lib/database';
import { apiRegister, apiLogin } from '@/lib/api';
import styles from './login.module.css';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Login fields
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup fields
  const [signupName, setSignupName] = useState('');
  const [signupId, setSignupId] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [signupPicture, setSignupPicture] = useState('');

  useEffect(() => {
    initDB();
    const token = localStorage.getItem('currentSession');
    if (token && getSession(token)) {
      router.replace('/dashboard');
    }
  }, [router]);

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type });
    if (type === 'success') {
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!loginId || !loginPassword) {
      showMessage('Please fill in all fields', 'error');
      return;
    }
    const result = authenticateStudent(loginId, loginPassword);
    if (result.success && result.student) {
      const session = createSession(loginId);
      localStorage.setItem('currentSession', session.token);
      localStorage.setItem('currentStudent', JSON.stringify(result.student));

      // Also authenticate with FastAPI backend (silent if offline)
      const student = getStudentById(loginId);
      if (student?.email) {
        apiLogin(student.email, loginPassword).catch(() => {});
      }

      showMessage('Login successful! Redirecting…', 'success');
      setTimeout(() => router.push('/dashboard'), 1000);
    } else {
      showMessage(result.error || 'Login failed', 'error');
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!signupName || !signupId || !signupEmail || !signupPassword || !signupConfirm) {
      showMessage('Please fill in all required fields', 'error');
      return;
    }
    if (signupPassword.length < 6) {
      showMessage('Password must be at least 6 characters', 'error');
      return;
    }
    if (signupPassword !== signupConfirm) {
      showMessage('Passwords do not match', 'error');
      return;
    }
    if (signupId.length < 3) {
      showMessage('Student ID must be at least 3 characters', 'error');
      return;
    }
    try {
      const student = createStudent({ id: signupId, name: signupName, email: signupEmail, password: signupPassword, picture: signupPicture || '' });
      const session = createSession(signupId);
      localStorage.setItem('currentSession', session.token);
      localStorage.setItem('currentStudent', JSON.stringify(sanitizeStudent(student)));

      // Also register + login with FastAPI backend (silent if offline)
      const nameParts = signupName.trim().split(' ');
      const firstName = nameParts[0] || signupName;
      const lastName  = nameParts.slice(1).join(' ') || '-';
      apiRegister({ first_name: firstName, last_name: lastName, email: signupEmail, password: signupPassword })
        .then(() => apiLogin(signupEmail, signupPassword))
        .catch(() => {});

      showMessage('Account created! Redirecting…', 'success');
      setTimeout(() => router.push('/dashboard'), 1000);
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Registration failed', 'error');
    }
  }

  return (
    <div className={styles.body}>
      <div className={styles.loginContainer}>
        <div className={styles.loginBox}>
          <div className={styles.logoSection}>
            <h1>🎓 Malsy</h1>
            <p>Your AI-powered virtual school</p>
          </div>

          {message && (
            <div className={`${styles.message} ${styles[message.type]}`}>
              {message.text}
            </div>
          )}

          {mode === 'login' ? (
            <div className={styles.formContainer}>
              <h2>Welcome back!</h2>
              <form onSubmit={handleLogin} noValidate>
                <div className={styles.formGroup}>
                  <label htmlFor="loginId">Student ID</label>
                  <input id="loginId" type="text" placeholder="Your student ID" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="loginPassword">Password</label>
                  <input id="loginPassword" type="password" placeholder="Your password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                </div>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>Login</button>
              </form>
              <div className={styles.switchForm}>
                Don&apos;t have an account?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); setMessage(null); }}>Sign up</a>
              </div>
            </div>
          ) : (
            <div className={styles.formContainer}>
              <h2>Create Account</h2>
              <form onSubmit={handleSignup} noValidate>
                <div className={styles.formGroup}>
                  <label htmlFor="signupName">Full Name <span style={{ color: '#dc2626' }}>*</span></label>
                  <input id="signupName" type="text" placeholder="Your full name" value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="signupId">Student ID <span style={{ color: '#dc2626' }}>*</span></label>
                  <input id="signupId" type="text" placeholder="Choose a unique ID" value={signupId} onChange={(e) => setSignupId(e.target.value)} />
                  <small>Minimum 3 characters, no spaces</small>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="signupEmail">Email <span style={{ color: '#dc2626' }}>*</span></label>
                  <input id="signupEmail" type="email" placeholder="your@email.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="signupPassword">Password <span style={{ color: '#dc2626' }}>*</span></label>
                  <input id="signupPassword" type="password" placeholder="At least 6 characters" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="signupConfirm">Confirm Password <span style={{ color: '#dc2626' }}>*</span></label>
                  <input id="signupConfirm" type="password" placeholder="Repeat your password" value={signupConfirm} onChange={(e) => setSignupConfirm(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="signupPicture">Profile Picture URL <span style={{ color: '#888', fontWeight: 400 }}>(optional)</span></label>
                  <input id="signupPicture" type="url" placeholder="https://…" value={signupPicture} onChange={(e) => setSignupPicture(e.target.value)} />
                </div>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>Create Account</button>
              </form>
              <div className={styles.switchForm}>
                Already have an account?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setMessage(null); }}>Login</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
