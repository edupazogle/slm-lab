// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — apps/ui/registry/localmode/conversation/suggestions/suggestions.tsx
// (MIT, Copyright (c) 2025 LocalMode).
// Changes: 'use client' and the registry import alias removed; the horizontally scrolling chip rail with a fade mask
// becomes a wrapping grid of left-aligned form rows (a 390px screen cannot show four insurance prompts in one rail, and
// the identity is form-like, not pill chips); an optional `label` line was added above the suggestion text.
/**
 * @file suggestions.tsx
 * @description A list of selectable prompts. `Suggestions` is the
 * container; each `Suggestion` invokes a callback with its text — wire it
 * to your composer's send/value to seed the input.
 */
import * as React from 'react';
import { cn } from './utils';
import { Button } from './button';

/** Props for {@link Suggestions}. */
export type SuggestionsProps = React.ComponentProps<'div'>;

/**
 * Scrollable row of suggestion chips. A right-edge fade mask signals that the
 * rail scrolls horizontally when chips overflow the container width.
 */
export function Suggestions({ className, ...props }: SuggestionsProps) {
  return (
    <div
      data-slot="suggestions"
      className={cn('grid w-full gap-2 sm:grid-cols-2', className)}
      {...props}
    />
  );
}

/** Props for {@link Suggestion}. */
export interface SuggestionProps
  extends Omit<React.ComponentProps<typeof Button>, 'onClick' | 'onSelect'> {
  /** The suggestion text (also the default label). */
  suggestion: string;
  /** Invoked with the suggestion text on activation. */
  onSelect?: (suggestion: string) => void;
  /** Small label shown above the suggestion text (form-field style). */
  label?: string;
}

/**
 * A single prompt chip.
 *
 * @example
 * ```tsx
 * <Suggestions>
 *   {prompts.map((p) => (
 *     <Suggestion key={p} suggestion={p} onSelect={setInput} />
 *   ))}
 * </Suggestions>
 * ```
 */
export function Suggestion({
  suggestion,
  onSelect,
  label,
  className,
  children,
  ...props
}: SuggestionProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-slot="suggestion"
      onClick={() => onSelect?.(suggestion)}
      className={cn(
        'ff h-auto w-full flex-col items-start justify-start gap-0 whitespace-normal text-left hover:border-primary/60',
        className,
      )}
      {...props}
    >
      {label && <span className="ff-label">{label}</span>}
      <span className="typed text-[0.95rem] font-normal leading-snug">{children ?? suggestion}</span>
    </Button>
  );
}
