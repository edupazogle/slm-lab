// Settings. Everything here is a real engine parameter; the notes say when a change takes effect and what it costs.
import { useState } from 'react';
import { Button } from '../lib/localmode/button';
import { DEFAULT_INFERENCE_PARAMS, MAX_CONTEXT } from '../config';
import { useWllama } from '../utils/wllama.context';
import { useMessages } from '../utils/messages.context';
import { useNav } from '../utils/nav.context';
import { Screen } from '../utils/types';
import { useThemeState } from '../utils/theme';
import type { ThemeChoice } from '../utils/theme';

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'Follow the system' },
  { id: 'carbon', label: 'Light' },
  { id: 'carbonpaper', label: 'Dark' },
];

/**
 * A number box that keeps what is typed and clamps when the field is left. Clamping on every keystroke made most values
 * impossible to type: "1024" in the context field became 256 at the "1", then 2560, then 8192, and was saved as 8192.
 */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit(v: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="ff">
      <span className="ff-label">{label}</span>
      <input
        className="typed field-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const v = Number(text);
          if (text.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) onCommit(v);
        }}
        onBlur={(e) => {
          const text = e.target.value;
          const v = Number(text);
          if (text.trim() !== '' && Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, v)));
          setDraft(null);
        }}
      />
    </label>
  );
}

export default function SettingsScreen() {
  const { params, setParams, loadedModel, runtime } = useWllama();
  const { choice, setChoice } = useThemeState();
  const [prompt, setPrompt] = useState(params.systemPrompt);

  const num = (key: 'temperature' | 'nPredict' | 'nContext', v: number) => setParams({ ...params, [key]: v });

  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="screen-title">Settings</h1>
        <p className="screen-lede">These apply to the model running in this browser. Nothing here is sent anywhere.</p>

        <section className="tier">
          <h2 className="tier-title">Answers</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <NumberField
              label="Temperature (0 = the same answer every time)"
              value={params.temperature}
              min={0}
              max={2}
              step={0.05}
              onCommit={(v) => num('temperature', v)}
            />
            <NumberField
              label="Longest answer, in tokens (about ¾ of a word each)"
              value={params.nPredict}
              min={16}
              max={4096}
              step={16}
              onCommit={(v) => num('nPredict', v)}
            />
          </div>

          <label className="ff mt-2 block">
            <span className="ff-label">Instruction the model gets before every chat message</span>
            <textarea
              className="typed field-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={() => setParams({ ...params, systemPrompt: prompt })}
            />
          </label>
          <p className="field-note">
            Skills ignore this and use their own, short instruction. A long instruction is re-read on every turn, and
            reading is the slow part in WebAssembly.
          </p>
        </section>

        <section className="tier">
          <h2 className="tier-title">The engine</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <NumberField
              label="Context window, in tokens (prompt and answer together)"
              value={params.nContext}
              min={256}
              max={MAX_CONTEXT}
              step={256}
              onCommit={(v) => num('nContext', v)}
            />
            <div className="ff">
              <span className="ff-label">Use the graphics card when one is usable</span>
              <label className="gpu-toggle typed">
                <input
                  type="checkbox"
                  checked={params.useGpu}
                  onChange={(e) => setParams({ ...params, useGpu: e.target.checked })}
                />
                {params.useGpu ? 'on' : 'off'}
              </label>
              <span className="text-xs text-base-content/70">
                WebGPU is young. When it is on, every layer is offered to the graphics card and the model falls back to
                the processor if that fails; when it is off, the processor does all of it. On many machines — and in
                every headless browser tested here — there is no usable adapter and this changes nothing.
              </span>
            </div>
          </div>
          <p className="field-note">
            The context window and the graphics setting take effect the next time a model is loaded.
            {loadedModel && runtime
              ? ` Right now: ${loadedModel.name}, ${runtime.nCtx.toLocaleString('en-GB')} tokens, ${runtime.threads} thread${runtime.threads === 1 ? '' : 's'}, ${runtime.gpuLayers > 0 ? `${runtime.gpuLayers} layers offered to the GPU` : 'processor only'}${runtime.gpuOffloadLog ? ` (engine log: ${runtime.gpuOffloadLog})` : ''}.`
              : ''}
          </p>
          <p className="field-note">
            The limit of {MAX_CONTEXT.toLocaleString('en-GB')} tokens is this build's: a 32-bit WebAssembly heap holds
            the weights, the context and the working buffers inside 4 GB.
          </p>
        </section>

        <Conversations />

        <section className="tier">
          <h2 className="tier-title">Appearance</h2>
          <div className="theme-row" role="radiogroup" aria-label="Colour theme">
            {THEMES.map((t) => (
              <label key={t.id} className={`theme-option${choice === t.id ? ' is-active' : ''}`}>
                <input
                  type="radio"
                  name="theme"
                  value={t.id}
                  checked={choice === t.id}
                  onChange={() => setChoice(t.id)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </section>

        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setParams(DEFAULT_INFERENCE_PARAMS);
              setPrompt(DEFAULT_INFERENCE_PARAMS.systemPrompt);
            }}
          >
            Reset to the defaults
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The conversations are kept in this browser only; this is the one place that removes all of them at once. */
function Conversations() {
  const { conversations, deleteAllConversations } = useMessages();
  const { stop } = useWllama();
  const { navigate } = useNav();
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState<number | null>(null);
  const n = conversations.length;

  return (
    <section className="tier">
      <h2 className="tier-title">Conversations</h2>
      <p className="tier-blurb">
        {n === 0
          ? 'No conversation is stored in this browser.'
          : `${n} conversation${n === 1 ? ' is' : 's are'} stored in this browser, on this device, and nowhere else. Deleting ${n === 1 ? 'it' : 'them'} cannot be undone. Downloaded models stay: they are on the Models screen.`}
      </p>
      {confirming ? (
        <div className="settings-confirm" role="group" aria-label="Confirm the deletion">
          <span>
            Delete all {n} conversation{n === 1 ? '' : 's'}?
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={async () => {
              setConfirming(false);
              stop();
              navigate(Screen.SETTINGS, null);
              if (await deleteAllConversations()) setDeleted(n);
            }}
          >
            Delete all
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep them
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={n === 0}
          onClick={() => {
            setDeleted(null);
            setConfirming(true);
          }}
        >
          Delete all conversations
        </Button>
      )}
      {deleted != null && (
        <p className="field-note" role="status">
          {deleted} conversation{deleted === 1 ? ' was' : 's were'} deleted from this browser.
        </p>
      )}
    </section>
  );
}
