import { useCallback, useEffect } from 'react';

let lastId = 0;
/** Increasing numeric ids (Date.now() alone collides when two messages are created in the same millisecond). */
export function newId(): number {
  const now = Date.now();
  lastId = now > lastId ? now : lastId + 1;
  return lastId;
}

type StorageKey = 'params' | 'custom_models' | 'last_model' | 'remote';

/** Small settings only. Conversations live in IndexedDB (see messages.context.tsx). */
export const WllamaStorage = {
  save<T>(key: StorageKey, data: T) {
    try {
      localStorage.setItem(`slmlab.${key}`, JSON.stringify(data));
    } catch {
      /* private mode or quota: settings are simply not remembered */
    }
  },
  load<T>(key: StorageKey, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(`slmlab.${key}`);
      return raw ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  remove(key: StorageKey) {
    try {
      localStorage.removeItem(`slmlab.${key}`);
    } catch {
      /* ignore */
    }
  },
};

type Listener = () => void;

/** The engine's log, shown on the Log screen. llama.cpp's own lines arrive here through wllama's logger. */
export const DebugLogger = {
  content: [] as string[],
  listeners: new Set<Listener>(),
  push(level: string, args: unknown[]) {
    DebugLogger.content.push(`${level} ${DebugLogger.argsToStr(args)}`);
    if (DebugLogger.content.length > 2000) DebugLogger.content.splice(0, 500);
    DebugLogger.listeners.forEach((l) => l());
  },
  debug(...args: unknown[]) {
    DebugLogger.push('debug', args);
  },
  log(...args: unknown[]) {
    DebugLogger.push('info ', args);
  },
  warn(...args: unknown[]) {
    DebugLogger.push('warn ', args);
  },
  error(...args: unknown[]) {
    DebugLogger.push('error', args);
  },
  subscribe(l: Listener) {
    DebugLogger.listeners.add(l);
    return () => {
      DebugLogger.listeners.delete(l);
    };
  },
  argsToStr(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return '';
        }
      })
      .join(' ');
  },
};

export function useDebounce<T extends unknown[]>(
  effect: (...args: T) => void,
  dependencies: unknown[],
  delayMs: number
): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const callback = useCallback(effect, dependencies);
  useEffect(() => {
    const timeout = setTimeout(callback, delayMs);
    return () => clearTimeout(timeout);
  }, [callback, delayMs]);
}

/** Copy text to the clipboard; returns false when the browser refuses (no secure context, no permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** A readable message from anything thrown. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return 'unknown error';
  }
}
