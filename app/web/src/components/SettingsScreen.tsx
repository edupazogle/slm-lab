// Settings. Everything here is a real engine parameter; the notes say when a change takes effect and what it costs.
import { useState } from 'react';
import { Button } from '../lib/localmode/button';
import { DEFAULT_INFERENCE_PARAMS, MAX_CONTEXT } from '../config';
import { useWllama } from '../utils/wllama.context';
import { useThemeState } from '../utils/theme';
import type { ThemeChoice } from '../utils/theme';

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'Follow the system' },
  { id: 'carbon', label: 'Light' },
  { id: 'carbonpaper', label: 'Dark' },
];

export default function SettingsScreen() {
  const { params, setParams, loadedModel, runtime } = useWllama();
  const { choice, setChoice } = useThemeState();
  const [prompt, setPrompt] = useState(params.systemPrompt);

  const num = (key: 'temperature' | 'nPredict' | 'nContext', value: string, min: number, max: number) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    setParams({ ...params, [key]: Math.min(max, Math.max(min, v)) });
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="screen-title">Settings</h1>
        <p className="screen-lede">These apply to the model running in this browser. Nothing here is sent anywhere.</p>

        <section className="tier">
          <h2 className="tier-title">Answers</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="ff">
              <span className="ff-label">Temperature (0 = the same answer every time)</span>
              <input
                className="typed field-input"
                type="number"
                min={0}
                max={2}
                step={0.05}
                value={params.temperature}
                onChange={(e) => num('temperature', e.target.value, 0, 2)}
              />
            </label>
            <label className="ff">
              <span className="ff-label">Longest answer, in tokens (about ¾ of a word each)</span>
              <input
                className="typed field-input"
                type="number"
                min={16}
                max={4096}
                step={16}
                value={params.nPredict}
                onChange={(e) => num('nPredict', e.target.value, 16, 4096)}
              />
            </label>
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
            <label className="ff">
              <span className="ff-label">Context window, in tokens (prompt and answer together)</span>
              <input
                className="typed field-input"
                type="number"
                min={256}
                max={MAX_CONTEXT}
                step={256}
                value={params.nContext}
                onChange={(e) => num('nContext', e.target.value, 256, MAX_CONTEXT)}
              />
            </label>
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
