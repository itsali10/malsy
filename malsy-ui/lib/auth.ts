import type { UserRead } from './api';

const TOKEN_KEY = 'malsy_token';
const USER_KEY = 'malsy_user';

export const auth = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
  },
  getUser(): UserRead | null {
    if (typeof window === 'undefined') return null;
    const s = localStorage.getItem(USER_KEY);
    return s ? (JSON.parse(s) as UserRead) : null;
  },
  setUser(u: UserRead) {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  },
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn(): boolean {
    return Boolean(this.getToken());
  },
};
