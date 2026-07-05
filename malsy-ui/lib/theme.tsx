'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; }

const Ctx = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const saved = (localStorage.getItem('malsy_theme') as Theme) || 'light';
    setThemeState(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('malsy_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() { return useContext(Ctx); }
