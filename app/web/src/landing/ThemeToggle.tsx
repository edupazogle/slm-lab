import { useEffect, useState } from 'react';

// 'carbon' is the light form stock, 'carbonpaper' the dark carbon sheet (see design/tokens.css).
// With no stored choice the page follows the system setting, which tokens.css already handles.
type Theme = 'carbon' | 'carbonpaper';
export const THEME_KEY = 'slm-lab-theme';

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'carbon' || v === 'carbonpaper' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'carbonpaper' : 'carbon';
  } catch {
    return 'carbon';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'carbon' || attr === 'carbonpaper') return attr;
    return storedTheme() ?? systemTheme();
  });
  const [explicit, setExplicit] = useState<boolean>(() => document.documentElement.hasAttribute('data-theme'));

  // follow the system while the visitor has not chosen
  useEffect(() => {
    if (explicit) return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => setTheme(mq.matches ? 'carbonpaper' : 'carbon');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [explicit]);

  const choose = (next: Theme) => {
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
    setExplicit(true);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private window: the choice lasts for this visit only */
    }
  };

  return (
    <div className="theme" role="group" aria-label="Colour theme">
      <button type="button" aria-pressed={theme === 'carbon'} onClick={() => choose('carbon')}>
        <span className="tick" data-on={theme === 'carbon' ? '1' : '0'} aria-hidden="true" />
        Light
      </button>
      <button type="button" aria-pressed={theme === 'carbonpaper'} onClick={() => choose('carbonpaper')}>
        <span className="tick" data-on={theme === 'carbonpaper' ? '1' : '0'} aria-hidden="true" />
        Dark
      </button>
    </div>
  );
}
