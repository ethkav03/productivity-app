'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'liferpg.theme';

function getPreferredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    // Corrects React's own state to match the real preference. Deliberately
    // does NOT touch the DOM: the anti-FOUC script in app/layout.tsx already
    // set `document.documentElement`'s `dark` class correctly before this
    // ever runs. Every `useTheme()` consumer (e.g. ThemeToggle, which only
    // lives on /settings and /admin, not the persistent Topbar) mounts its
    // own independent instance of this hook starting from `theme: 'light'`
    // - if this effect wrote that stale value to the shared `documentElement`
    // class, it would flash the *entire app* to light mode on every mount,
    // not just its own small icon.
    setThemeState(getPreferredTheme());
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}
