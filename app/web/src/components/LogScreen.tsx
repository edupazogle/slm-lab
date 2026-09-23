// The engine's own log: llama.cpp's loading lines, wllama's warnings, and this app's errors. It is the place to look
// when a model will not load, and the one honest answer to "what did it actually do".
import { useSyncExternalStore } from 'react';
import { Button } from '../lib/localmode/button';
import { DebugLogger, copyText } from '../utils/utils';

export default function LogScreen() {
  const lines = useSyncExternalStore(
    (cb) => DebugLogger.subscribe(cb),
    () => DebugLogger.content.length
  );
  const content = DebugLogger.content;
  void lines;

  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="screen-title">Engine log</h1>
        <p className="screen-lede">
          What llama.cpp and wllama printed in this tab. Nothing here is sent anywhere; it goes when the page closes.
        </p>
        <div className="mb-3 flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void copyText(content.join('\n'))}>
            Copy the log
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              DebugLogger.content.length = 0;
              DebugLogger.listeners.forEach((l) => l());
            }}
          >
            Clear
          </Button>
        </div>
        <pre className="log-box typed" aria-label="Engine log">
          {content.length === 0 ? 'Nothing yet. Load a model and the engine will start writing here.' : content.join('\n')}
        </pre>
      </div>
    </div>
  );
}
