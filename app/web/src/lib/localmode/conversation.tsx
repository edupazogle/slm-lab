// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — apps/ui/registry/localmode/conversation/conversation/conversation.tsx
// (MIT, Copyright (c) 2025 LocalMode).
// Changes: 'use client' and the registry import alias removed; shadcn colour tokens remapped to the daisyUI carbon
// themes; the scroll button is square (form identity) and carries a text label; the viewport gets tabIndex so keyboard
// users can scroll it; the hand-rolled scrollTop pinning was replaced by anything-llm's useAutoScroll (lifted in
// src/lib/anythingllm/use-auto-scroll.ts), which disengages on the reader's own wheel/touch input instead of on a
// scroll event that a streaming re-render can race; `history` replaces `streaming` as the prop that drives it.
/**
 * @file conversation.tsx
 * @description The scrollable message-display surface for a chat. `Conversation`
 * is a scroll container with first-class scroll-anchoring: it auto-pins to the
 * newest content while tokens stream, releases the pin when the user scrolls up,
 * surfaces a scroll-to-bottom control while released, and re-pins when the user
 * returns to the bottom. It is presentational — it renders the children/messages
 * passed in and owns no message state (that lives in `useChat`).
 *
 * Driven by `@localmode/react`'s `useChat().messages`.
 */
import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from './utils';
import { Button } from './button';
import useAutoScroll, { type AutoScrollItem } from '../anythingllm/use-auto-scroll';

/** Context shared between `Conversation` and its scroll-button/anchor. */
interface ConversationContextValue {
  /** Ref to the scroll viewport. */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the view is currently pinned to the bottom. */
  isPinned: boolean;
  /** Scroll to (and re-pin) the bottom. */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const ConversationContext =
  React.createContext<ConversationContextValue | null>(null);

/** Access the conversation scroll state (within a `Conversation`). */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider; a hot edit here reloads the page
export function useConversation() {
  const ctx = React.useContext(ConversationContext);
  if (!ctx) {
    throw new Error('useConversation must be used within <Conversation>');
  }
  return ctx;
}

/** Props for {@link Conversation}. */
export interface ConversationProps extends React.ComponentProps<'div'> {
  /**
   * The messages on screen. While the last one is `pending`, the view follows
   * new content to the bottom — unless the reader has scrolled up.
   */
  history: ReadonlyArray<AutoScrollItem>;
}

/**
 * Scrollable conversation container with auto-stick-to-bottom anchoring.
 *
 * @example
 * ```tsx
 * <Conversation streaming={isStreaming}>
 *   <ConversationContent>
 *     {messages.length === 0 && <ConversationEmptyState />}
 *     {messages.map((m) => <Message key={m.id} {...m} />)}
 *     <ConversationScrollAnchor />
 *   </ConversationContent>
 *   <ConversationScrollButton />
 * </Conversation>
 * ```
 */
export function Conversation({
  history,
  className,
  children,
  ...props
}: ConversationProps) {
  const { chatHistoryRef, isAtBottom, scrollToBottom, scrollHandlers } =
    useAutoScroll(history);
  const last = history[history.length - 1];
  const streaming = !!(last?.pending || last?.animate);

  const ctx = React.useMemo<ConversationContextValue>(
    () => ({
      viewportRef: chatHistoryRef,
      isPinned: isAtBottom,
      scrollToBottom: (behavior: ScrollBehavior = 'smooth') =>
        scrollToBottom(behavior === 'smooth'),
    }),
    [chatHistoryRef, isAtBottom, scrollToBottom],
  );

  return (
    <ConversationContext.Provider value={ctx}>
      <div
        className={cn('relative flex min-h-0 flex-1 flex-col', className)}
        data-streaming={streaming || undefined}
        {...props}
      >
        <div
          ref={chatHistoryRef}
          {...scrollHandlers}
          data-pinned={isAtBottom || undefined}
          className="conversation-viewport flex-1 overflow-y-auto overscroll-contain"
          tabIndex={0}
          role="log"
          aria-label="Conversation"
        >
          {children}
        </div>
      </div>
    </ConversationContext.Provider>
  );
}

/** Props for {@link ConversationContent}. */
export type ConversationContentProps = React.ComponentProps<'div'>;

/** Inner padded column holding the message list. */
export function ConversationContent({
  className,
  ...props
}: ConversationContentProps) {
  return (
    <div
      data-slot="conversation-content"
      className={cn('mx-auto flex w-full max-w-3xl flex-col gap-4 p-4', className)}
      {...props}
    />
  );
}

/**
 * A zero-height anchor element placed at the end of the message list. Marks the
 * bottom of the conversation. The actual stick-to-bottom scrolling is done by
 * `Conversation` itself via the viewport's own `scrollTop` (container-scoped) —
 * this anchor must NOT call `scrollIntoView`, which would scroll the whole page
 * (the nearest scrollable ancestor *and* the window) and jump the viewport.
 */
export function ConversationScrollAnchor({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="conversation-scroll-anchor"
      className={cn('h-px w-full shrink-0', className)}
      {...props}
    />
  );
}

/** Props for {@link ConversationScrollButton}. */
export type ConversationScrollButtonProps = React.ComponentProps<typeof Button>;

/**
 * Floating scroll-to-bottom button. Appears only when the pin is released
 * (the user has scrolled up).
 */
export function ConversationScrollButton({
  className,
  ...props
}: ConversationScrollButtonProps) {
  const { isPinned, scrollToBottom } = useConversation();
  if (isPinned) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      onClick={() => scrollToBottom()}
      className={cn(
        'absolute bottom-3 left-1/2 z-10 -translate-x-1/2 shadow-md',
        className,
      )}
      {...props}
    >
      <ArrowDown className="size-4" aria-hidden="true" />
      Latest
    </Button>
  );
}

/** Props for {@link ConversationEmptyState}. */
export interface ConversationEmptyStateProps
  extends React.ComponentProps<'div'> {
  /** Optional heading text. */
  title?: string;
  /** Optional supporting description. */
  description?: string;
  /** Optional leading icon node. */
  icon?: React.ReactNode;
}

/**
 * Empty-state slot rendered when there are no messages. Pass children to fully
 * customize, or use the `title`/`description`/`icon` props for the default.
 */
export function ConversationEmptyState({
  title = 'Start the conversation',
  description = 'Send a message to begin. Everything runs locally in your browser.',
  icon,
  className,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      data-slot="conversation-empty-state"
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon && <div className="mb-2 text-base-content/60">{icon}</div>}
          <p className="text-base font-medium text-base-content">{title}</p>
          <p className="max-w-sm text-sm text-base-content/70">
            {description}
          </p>
        </>
      )}
    </div>
  );
}
