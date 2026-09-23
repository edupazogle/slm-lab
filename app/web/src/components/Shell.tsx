// The frame: a header, a sidebar that becomes a drawer on a phone, and one screen at a time. The whole app is
// 100dvh tall with its own scroll areas, so the composer stays reachable above an on-screen keyboard.
import { useEffect } from 'react';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { Button } from '../lib/localmode/button';
import { useNav } from '../utils/nav.context';
import { Screen } from '../utils/types';
import { useThemeState } from '../utils/theme';
import { useWllama } from '../utils/wllama.context';
import { useMessages } from '../utils/messages.context';
import Sidebar from './Sidebar';
import ChatScreen from './ChatScreen';
import ModelScreen from './ModelScreen';
import SettingsScreen from './SettingsScreen';
import LogScreen from './LogScreen';

export default function Shell() {
  const { screen, drawerOpen, setDrawerOpen } = useNav();
  const { resolved, toggle } = useThemeState();
  const { notice, setNotice } = useWllama();
  const { storageError } = useMessages();

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, setDrawerOpen]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="drawer-btn lg:hidden"
          aria-label={drawerOpen ? 'Close the conversation list' : 'Open the conversation list'}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          {drawerOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
        <a className="brand" href="./index.html">
          <span className="brand-name">SLM Lab</span>
          <span className="brand-sub">on this device</span>
        </a>
        <div className="header-right">
          <a className="header-link" href="./index.html">
            About the lab
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={resolved === 'carbon' ? 'Switch to the dark theme' : 'Switch to the light theme'}
            onClick={toggle}
          >
            {resolved === 'carbon' ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
          </Button>
        </div>
      </header>

      <div className="app-body">
        <div
          className={`drawer-scrim lg:hidden${drawerOpen ? ' is-open' : ''}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
        <div className={`app-sidebar${drawerOpen ? ' is-open' : ''}`}>
          <Sidebar />
        </div>

        <main className="app-main" id="main">
          {(notice || storageError) && (
            <div className="notice notice-warn app-notice" role="status">
              <span>{notice ?? storageError}</span>
              {notice && (
                <Button type="button" size="xs" variant="ghost" onClick={() => setNotice(null)} aria-label="Dismiss">
                  <X className="size-3" aria-hidden="true" />
                </Button>
              )}
            </div>
          )}
          {screen === Screen.CHAT && <ChatScreen />}
          {screen === Screen.MODEL && <ModelScreen />}
          {screen === Screen.SETTINGS && <SettingsScreen />}
          {screen === Screen.LOG && <LogScreen />}
        </main>
      </div>
    </div>
  );
}
