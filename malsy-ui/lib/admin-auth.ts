const ADMIN_TOKEN_KEY = 'malsy_admin_token';
const ADMIN_USER_KEY = 'malsy_admin_user';

export interface AdminUser {
  username: string;
  role: string;
  display_name: string;
}

export const adminAuth = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  setToken(token: string) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },

  clear() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
  },

  getUser(): AdminUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AdminUser; } catch { return null; }
  },

  setUser(user: AdminUser) {
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
  },

  isLoggedIn(): boolean {
    return Boolean(this.getToken());
  },
};
