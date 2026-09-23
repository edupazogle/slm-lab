// Theme: data-theme="carbon" (light) or "carbonpaper" (dark) on <html>. Follows the system until the person chooses,
// then remembers the choice. The key and values are the landing page's own (src/landing/ThemeToggle.tsx), so a choice
// made on one page holds on the other. chat.html applies it before first paint (no flash).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'carbon' | 'carbonpaper';
export type ResolvedTheme = 'carbon' | 'carbonpaper';

const THEME_KEY = 'slm-lab-theme';

const systemTheme = (): ResolvedTheme => {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'carbonpaper' : 'carbon';
  } catch {
    return 'carbon';
  }
};

function storedChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'carbon' || v === 'carbonpaper' ? v : 'system';
  } catch {
    return 'system';
  }
}

export const resolveTheme = (choice: ThemeChoice): ResolvedTheme =>
  choice === 'system' ? systemTheme() : choice;

function apply(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'carbon' ? '#1B2A6B' : '#0C1233');
}

export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(storedChoice);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(choice));

  useEffect(() => {
    const next = resolveTheme(choice);
    setResolved(next);
    apply(next);
    if (choice !== 'system') return;
    let mq: MediaQueryList;
    try {
      mq = matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => {
      const t = systemTheme();
      setResolved(t);
      apply(t);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      if (c === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, c);
    } catch {
      /* private window: the choice lasts for this visit only */
    }
  }, []);

  const toggle = useCallback(() => {
    setChoice(resolved === 'carbon' ? 'carbonpaper' : 'carbon');
  }, [resolved, setChoice]);

  return { choice, resolved, setChoice, toggle };
}

export type ThemeState = ReturnType<typeof useTheme>;

/** One theme state for the whole app (the header toggle and the Settings screen must agree). */
export const ThemeContext = createContext<ThemeState | null>(null);

export function useThemeState(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeState must be used inside ThemeContext');
  return ctx;
}
