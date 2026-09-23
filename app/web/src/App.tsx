import { MessagesProvider } from './utils/messages.context';
import { NavProvider } from './utils/nav.context';
import { Screen } from './utils/types';
import { WllamaProvider } from './utils/wllama.context';
import { ThemeContext, useTheme } from './utils/theme';
import Shell from './components/Shell';

export default function App() {
  const theme = useTheme();
  return (
    <ThemeContext.Provider value={theme}>
      <MessagesProvider>
        <WllamaProvider>
          <NavProvider initialScreen={Screen.CHAT}>
            <Shell />
          </NavProvider>
        </WllamaProvider>
      </MessagesProvider>
    </ThemeContext.Provider>
  );
}
