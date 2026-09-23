// Which screen is showing, which conversation is open, and whether the phone drawer is open.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Screen } from './types';

interface NavValue {
  screen: Screen;
  convId: number | null;
  navigate(screen: Screen, convId?: number | null): void;
  drawerOpen: boolean;
  setDrawerOpen(open: boolean): void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ children, initialScreen }: { children: ReactNode; initialScreen: Screen }) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [convId, setConvId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigate = useCallback((next: Screen, id?: number | null) => {
    setScreen(next);
    if (id !== undefined) setConvId(id);
    setDrawerOpen(false);
  }, []);

  return (
    <NavContext.Provider value={{ screen, convId, navigate, drawerOpen, setDrawerOpen }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside NavProvider');
  return ctx;
}
