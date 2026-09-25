// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — apps/ui/registry/localmode/conversation/prompt-input/prompt-input.tsx
// (MIT, Copyright (c) 2025 LocalMode).
// Changes: 'use client' and the registry import alias removed; IME guard added (`isComposing` — Enter must not submit
// while a Japanese/Chinese/Korean composition is open); on coarse-pointer (touch) devices Enter inserts a newline and the
// Send button submits; shadcn tokens and Tailwind-4-only classes remapped to Tailwind 3 + the carbon identity (the form
// is a tinted `.ff` field with its small label inside the box, the text is set in the typed face); the submit/stop
// controls carry text labels instead of being icon-only circles; the dictation mic sub-part was dropped (no local
// speech-to-text ships in this app, and the build spec forbids stubs); `label` and `allowEmpty` props added (a skill
// like "Synthetic claims" runs with no text at all); the textarea ref is typed for React 18's RefObject; `onSubmit` may
// return false to refuse the send, and the text then stays in the box.

/**
 * @file prompt-input.tsx
 * @description The chat composer. `PromptInput` is a form-based, auto-resizing
 * textarea that manages its own input state by default (Enter submits,
 * Shift+Enter inserts a newline) and swaps its submit control for a stop control
 * while streaming. It exposes `onSubmit(text, attachments?)` and optional
 * controlled `value`/`onValueChange`.
 *
 * `PromptInputProvider` exposes the composer state (text + attachments) for
 * external control (clear-after-send, programmatic attach). Presentational —
 * the app owns send/stream state.
 */
import * as React from 'react';
import { Plus } from 'lucide-react';
import { cn } from './utils';
import { Button } from './button';

/** An attachment carried by the composer. */
export interface PromptAttachment {
  /** Stable id for list keys / removal. */
  id: string;
  /** Base64 data (no `data:` prefix). */
  data: string;
  /** MIME type. */
  mimeType: string;
  /** Original filename. */
  name?: string;
  /** Size in bytes. */
  size?: number;
}

/** Shared composer state surfaced by {@link PromptInputProvider}. */
export interface PromptInputContextValue {
  text: string;
  setText: (text: string) => void;
  attachments: PromptAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<PromptAttachment[]>>;
  addAttachments: (items: PromptAttachment[]) => void;
  removeAttachment: (id: string) => void;
  clear: () => void;
}

const PromptInputContext =
  React.createContext<PromptInputContextValue | null>(null);

/** Access composer state. Returns `null` when used outside a provider. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider; a hot edit here reloads the page
export function usePromptInputContext() {
  return React.useContext(PromptInputContext);
}

/** Props for {@link PromptInputProvider}. */
export interface PromptInputProviderProps {
  children: React.ReactNode;
}

/**
 * Optional provider that hoists composer state (text + attachments) so external
 * components (e.g. an attachments dropzone, a clear-after-send effect) can read
 * and mutate it.
 */
export function PromptInputProvider({ children }: PromptInputProviderProps) {
  const [text, setText] = React.useState('');
  const [attachments, setAttachments] = React.useState<PromptAttachment[]>([]);

  const value = React.useMemo<PromptInputContextValue>(
    () => ({
      text,
      setText,
      attachments,
      setAttachments,
      addAttachments: (items) => setAttachments((prev) => [...prev, ...items]),
      removeAttachment: (id) =>
        setAttachments((prev) => prev.filter((a) => a.id !== id)),
      clear: () => {
        setText('');
        setAttachments([]);
      },
    }),
    [text, attachments],
  );

  return (
    <PromptInputContext.Provider value={value}>
      {children}
    </PromptInputContext.Provider>
  );
}

/** Internal form-state context shared by the sub-parts. */
interface PromptFormState {
  text: string;
  setText: (t: string) => void;
  streaming: boolean;
  attachments: PromptAttachment[];
  allowEmpty: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  submit: () => void;
  onStop?: () => void;
}
const PromptFormContext = React.createContext<PromptFormState | null>(null);
function usePromptForm() {
  const ctx = React.useContext(PromptFormContext);
  if (!ctx)
    throw new Error('PromptInput sub-parts must be used within <PromptInput>');
  return ctx;
}

/** True on touch-first devices, where Enter should insert a newline. */
function isCoarsePointer() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

/** Props for {@link PromptInput}. */
export interface PromptInputProps
  extends Omit<React.ComponentProps<'form'>, 'onSubmit'> {
  /** Fired with the trimmed text (and attachments) on submit. Return false to refuse it: the text is kept. */
  onSubmit: (text: string, attachments: PromptAttachment[]) => void | boolean;
  /** Controlled value (optional). */
  value?: string;
  /** Reports edits in controlled mode. */
  onValueChange?: (value: string) => void;
  /** When true, the submit control becomes a stop control. @default false */
  streaming?: boolean;
  /** Fired when the user activates the stop control. */
  onStop?: () => void;
  /** Attachments to include in the next submit (from `PromptInputAttachments`). */
  attachments?: PromptAttachment[];
  /** Disable the whole composer. */
  disabled?: boolean;
  /** Small label set inside the field, top-left (form identity). */
  label?: React.ReactNode;
  /** Allow a submit with no text and no attachment (a skill that needs no input). @default false */
  allowEmpty?: boolean;
}

/**
 * The composer form. Wraps `PromptInputTextarea`, `PromptInputTools`, and
 * `PromptInputSubmit`.
 *
 * @example
 * ```tsx
 * <PromptInput streaming={isStreaming} onStop={cancel} onSubmit={(t) => send(t)}>
 *   <PromptInputTextarea placeholder="Ask anything…" />
 *   <PromptInputTools>
 *     <PromptInputSubmit />
 *   </PromptInputTools>
 * </PromptInput>
 * ```
 */
export function PromptInput({
  onSubmit,
  value,
  onValueChange,
  streaming = false,
  onStop,
  attachments = [],
  disabled,
  label,
  allowEmpty = false,
  className,
  children,
  ...props
}: PromptInputProps) {
  const provider = usePromptInputContext();
  const [internal, setInternal] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Resolve text from controlled prop → provider → internal state.
  const text = value ?? provider?.text ?? internal;
  const setText = React.useCallback(
    (t: string) => {
      onValueChange?.(t);
      provider?.setText(t);
      if (value == null && !provider) setInternal(t);
    },
    [onValueChange, provider, value],
  );

  const resolvedAttachments = provider?.attachments ?? attachments;

  const submit = React.useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && resolvedAttachments.length === 0 && !allowEmpty) || streaming || disabled)
      return;
    if (onSubmit(trimmed, resolvedAttachments) === false) return;
    setText('');
    provider?.setAttachments([]);
  }, [text, resolvedAttachments, allowEmpty, streaming, disabled, onSubmit, setText, provider]);

  const formState = React.useMemo<PromptFormState>(
    () => ({
      text,
      setText,
      streaming,
      attachments: resolvedAttachments,
      allowEmpty,
      textareaRef,
      submit,
      onStop,
    }),
    [text, setText, streaming, resolvedAttachments, allowEmpty, submit, onStop],
  );

  return (
    <PromptFormContext.Provider value={formState}>
      <form
        data-slot="prompt-input"
        data-streaming={streaming || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          'ff composer flex flex-col gap-1',
          disabled && 'pointer-events-none opacity-60',
          className,
        )}
        {...props}
      >
        {label && <span className="ff-label">{label}</span>}
        {children}
      </form>
    </PromptFormContext.Provider>
  );
}

/** Props for {@link PromptInputTextarea}. */
export interface PromptInputTextareaProps
  extends Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'> {
  /** Max pixel height before the textarea scrolls. @default 200 */
  maxHeight?: number;
}

/**
 * Auto-resizing textarea. Enter submits; Shift+Enter inserts a newline. While an
 * IME composition is open, and on touch devices, Enter never submits.
 */
export function PromptInputTextarea({
  maxHeight = 200,
  className,
  onKeyDown,
  placeholder = 'Send a message…',
  'aria-label': ariaLabel,
  ...props
}: PromptInputTextareaProps) {
  const { text, setText, textareaRef, submit, streaming } = usePromptForm();

  // Auto-resize to content up to maxHeight.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [text, maxHeight, textareaRef]);

  return (
    <textarea
      ref={textareaRef}
      data-slot="prompt-input-textarea"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel ?? 'Message'}
      rows={1}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        // IME-safe: Enter confirms a composition, it must not send the message.
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          // Touch keyboards have no Shift+Enter habit: Enter is a newline there.
          if (isCoarsePointer()) return;
          e.preventDefault();
          if (!streaming) submit();
        }
      }}
      className={cn(
        'typed max-h-[40dvh] w-full resize-none bg-transparent py-1 text-base leading-snug text-base-content placeholder:text-base-content/45 focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

/** Props for {@link PromptInputTools}. */
export type PromptInputToolsProps = React.ComponentProps<'div'>;

/** Footer row for composer controls (tools on the left, submit on the right). */
export function PromptInputTools({
  className,
  ...props
}: PromptInputToolsProps) {
  return (
    <div
      data-slot="prompt-input-tools"
      className={cn('flex flex-wrap items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

/** Props for {@link PromptInputSubmit}. */
export interface PromptInputSubmitProps
  extends React.ComponentProps<typeof Button> {
  /** Override the default submit/stop labels. */
  submitLabel?: React.ReactNode;
  stopLabel?: React.ReactNode;
}

/** Submit control that becomes a stop control while streaming. */
export function PromptInputSubmit({
  className,
  submitLabel,
  stopLabel,
  ...props
}: PromptInputSubmitProps) {
  const { streaming, onStop, text, attachments, allowEmpty } = usePromptForm();
  const empty = text.trim().length === 0 && attachments.length === 0 && !allowEmpty;

  if (streaming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onStop}
        data-slot="prompt-input-stop"
        className={className}
        {...props}
      >
        {stopLabel ?? 'Stop'}
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      size="sm"
      disabled={empty}
      data-slot="prompt-input-submit"
      className={className}
      {...props}
    >
      {submitLabel ?? 'Send'}
    </Button>
  );
}

/** Props for {@link PromptInputAddButton}. */
export type PromptInputAddButtonProps = React.ComponentProps<typeof Button>;

/**
 * The "+" trigger for an attachment menu. Compose it with a menu of
 * attachment entries.
 */
export function PromptInputAddButton({
  className,
  children,
  ...props
}: PromptInputAddButtonProps) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label="Add an attachment"
      data-slot="prompt-input-add"
      className={cn('text-base-content/70', className)}
      {...props}
    >
      {children ?? <Plus className="size-4" />}
    </Button>
  );
}
