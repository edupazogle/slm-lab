// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — apps/ui/registry/localmode/conversation/reasoning/reasoning.tsx
// (MIT, Copyright (c) 2025 LocalMode).
// Changes: 'use client' and the registry import alias removed; the radix Collapsible primitive (not a dependency here) is
// replaced by a button with aria-expanded/aria-controls and a conditionally rendered region; shadcn tokens remapped to
// the carbon identity (a ruled margin note instead of a rounded card); the brain icon and its pulse animation are
// dropped (the identity allows one decorative motion, the stamp); the unused `ThinkingBar` sub-part was not taken.

/**
 * @file reasoning.tsx
 * @description The model's own thinking tokens (DeepSeek-R1 style), in a
 * collapsible region. `Reasoning` auto-expands while thinking tokens stream and
 * auto-collapses when the final answer arrives, showing an elapsed timer.
 */
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './utils';

/** Reasoning open/streaming context shared with its sub-parts. */
interface ReasoningContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  streaming: boolean;
  elapsedMs: number;
  contentId: string;
}
const ReasoningContext = React.createContext<ReasoningContextValue | null>(null);
function useReasoning() {
  const ctx = React.useContext(ReasoningContext);
  if (!ctx)
    throw new Error('Reasoning sub-parts must be used within <Reasoning>');
  return ctx;
}

/** Format a millisecond duration as a short "X s" / "X min Y s" label. */
function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Props for {@link Reasoning}. */
export interface ReasoningProps extends React.ComponentProps<'div'> {
  /** Whether reasoning tokens are still streaming. Drives auto-expand/collapse. */
  streaming?: boolean;
  /** Controlled open state (optional). */
  open?: boolean;
  /** Reports open changes. */
  onOpenChange?: (open: boolean) => void;
  /** Provide a fixed elapsed time (ms) instead of the internal timer. */
  durationMs?: number;
}

/**
 * Collapsible reasoning block.
 *
 * @example
 * ```tsx
 * <Reasoning streaming={isThinking}>
 *   <ReasoningTrigger />
 *   <ReasoningContent>{thinkTokens}</ReasoningContent>
 * </Reasoning>
 * ```
 */
export function Reasoning({
  streaming = false,
  open: openProp,
  onOpenChange,
  durationMs,
  className,
  children,
  ...props
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = React.useState(streaming);
  const [elapsedMs, setElapsedMs] = React.useState(durationMs ?? 0);
  const startRef = React.useRef<number | null>(null);
  const contentId = React.useId();

  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp == null) setInternalOpen(next);
  };

  // Auto-expand while streaming; auto-collapse once it stops (unless controlled).
  React.useEffect(() => {
    if (openProp != null) return;
    if (streaming) setInternalOpen(true);
    else setInternalOpen(false);
  }, [streaming, openProp]);

  // Elapsed timer while streaming.
  React.useEffect(() => {
    if (durationMs != null) {
      setElapsedMs(durationMs);
      return;
    }
    if (!streaming) return;
    startRef.current = performance.now();
    const id = window.setInterval(() => {
      if (startRef.current != null) {
        setElapsedMs(performance.now() - startRef.current);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [streaming, durationMs]);

  const ctx: ReasoningContextValue = { open, setOpen, streaming, elapsedMs, contentId };

  return (
    <ReasoningContext.Provider value={ctx}>
      <div
        data-slot="reasoning"
        data-state={open ? 'open' : 'closed'}
        data-streaming={streaming || undefined}
        className={cn('reasoning text-sm', className)}
        {...props}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  );
}

/** Props for {@link ReasoningTrigger}. */
export interface ReasoningTriggerProps extends React.ComponentProps<'button'> {
  /** Label override. Defaults to "Thinking" while streaming, else "Reasoning". */
  label?: string;
}

/** The collapsible header showing a thinking indicator + elapsed time. */
export function ReasoningTrigger({
  label,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { open, setOpen, streaming, elapsedMs, contentId } = useReasoning();
  return (
    <button
      type="button"
      data-slot="reasoning-trigger"
      aria-expanded={open}
      aria-controls={contentId}
      onClick={() => setOpen(!open)}
      className={cn(
        'flex w-full items-center gap-2 py-1 text-left text-base-content/70',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate font-medium">
        {label ?? (streaming ? 'Thinking' : 'Reasoning the model wrote before answering')}
      </span>
      {elapsedMs > 0 && (
        <span className="typed shrink-0 text-xs">{formatElapsed(elapsedMs)}</span>
      )}
      <ChevronDown
        aria-hidden="true"
        className={cn('ml-auto size-4 shrink-0', open && 'rotate-180')}
      />
    </button>
  );
}

/** Props for {@link ReasoningContent}. */
export type ReasoningContentProps = React.ComponentProps<'div'>;

/** The reasoning token body. */
export function ReasoningContent({
  className,
  children,
  ...props
}: ReasoningContentProps) {
  const { open, contentId } = useReasoning();
  if (!open) return null;
  return (
    <div
      id={contentId}
      data-slot="reasoning-content"
      className={cn(
        'typed whitespace-pre-wrap break-words pb-2 text-[0.9rem] leading-snug text-base-content/70 [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
