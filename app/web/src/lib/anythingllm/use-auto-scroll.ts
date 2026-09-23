// Lifted from Mintplex-Labs/anything-llm @ da66855 — frontend/src/hooks/useAutoScroll.js (MIT, Copyright (c) Mintplex Labs Inc.).
// Changes: typed for TypeScript; the `Appearance.get("disableAutoScroll")` setting was removed (auto-scroll is always
// on here, and it still never fights a reader who scrolled up); `history` is typed as the minimal shape the hook reads
// ({ pending?, animate? }). The follow/unfollow logic itself is unchanged.
import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  type Ref,
  type WheelEvent,
  type TouchEvent,
} from 'react';

export interface AutoScrollItem {
  pending?: boolean;
  animate?: boolean;
}

export interface AutoScrollHandle {
  scrollToTop(): void;
  scrollToBottom(): void;
}

/**
 * Owns all auto-scroll behavior for the chat history container.
 *
 * Follow model: while `followRef` is true the container is pinned to the
 * bottom every animation frame. The user disengages by scrolling up
 * (wheel/touch) and re-engages by scrolling back down to the bottom,
 * sending a new prompt, or clicking the scroll-to-bottom button.
 *
 * @param history - The chat history (drives follow re-engage on send)
 * @param imperativeRef - Forwarded ref exposing scrollToTop/scrollToBottom
 */
export default function useAutoScroll(
  history: ReadonlyArray<AutoScrollItem>,
  imperativeRef?: Ref<AutoScrollHandle>
) {
  const chatHistoryRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback((smooth = false) => {
    if (!chatHistoryRef.current) return;
    chatHistoryRef.current.scrollTo({
      top: chatHistoryRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Pin to the bottom for a window of frames. A single scroll on load is not
  // enough — markdown, citations, and images below the fold keep resizing
  // the content after our scroll, leaving the view stranded mid-message.
  // Stops early if the user scrolls up (followRef flips false).
  const pinFramesRef = useRef(0);
  const pinToBottom = useCallback((frames = 30) => {
    const alreadyPinning = pinFramesRef.current > 0;
    pinFramesRef.current = frames;
    if (alreadyPinning) return;
    const tick = () => {
      const el = chatHistoryRef.current;
      if (!el || !followRef.current || pinFramesRef.current-- <= 0) {
        pinFramesRef.current = 0;
        return;
      }
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  // On the first render with content (page load / chat switch), always land
  // at the latest message. After that: re-engage follow on send and pin
  // before paint so the new message never appears above the fold.
  const loadedRef = useRef(false);
  useLayoutEffect(() => {
    if (history.length === 0) {
      loadedRef.current = false;
      return;
    }
    if (!loadedRef.current) {
      loadedRef.current = true;
      scrollToBottom(false);
      pinToBottom();
      return;
    }
    const lastMsg = history[history.length - 1];
    if (lastMsg?.pending) followRef.current = true;
    if (followRef.current) scrollToBottom(false);
  }, [history, scrollToBottom, pinToBottom]);

  // While following a stream, pin to the bottom every frame. Content below
  // the fold resizes asynchronously during streaming (markdown re-renders,
  // components swapping, the prompt input growing/clearing) — an effect-based
  // scroll races those shifts and loses; a rAF loop always runs after layout.
  // Only runs while the last message is streaming so idle chats (even very
  // long ones) pay nothing — reading scrollHeight each frame on a huge DOM
  // can force reflows if layout is dirty.
  const lastMsg = history[history.length - 1];
  const isStreaming = !!(lastMsg?.animate || lastMsg?.pending);
  useEffect(() => {
    if (!isStreaming) return;
    let frame = 0;
    const tick = () => {
      const el = chatHistoryRef.current;
      if (el && followRef.current) el.scrollTop = el.scrollHeight;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isStreaming]);

  const handleScroll = useCallback(() => {
    if (!chatHistoryRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatHistoryRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    const scrolledDown = scrollTop > lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;
    setIsAtBottom(atBottom);
    // Only re-engage follow when scrolling DOWN into the bottom zone. Merely
    // being near the bottom must not re-engage, or an upward scroll that
    // starts inside the zone gets snapped back down (sticky bottom). This
    // also re-engages at the end of any smooth scrollToBottom() animation.
    if (atBottom && scrolledDown) followRef.current = true;
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.deltaY < 0) followRef.current = false;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const startY = touchStartYRef.current;
    if (startY != null && e.touches[0].clientY > startY) {
      followRef.current = false;
    }
  }, []);

  useImperativeHandle(
    imperativeRef,
    () => ({
      scrollToTop() {
        followRef.current = false;
        if (chatHistoryRef.current) {
          chatHistoryRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      },
      scrollToBottom() {
        scrollToBottom(true);
      },
    }),
    [scrollToBottom]
  );

  return {
    chatHistoryRef,
    isAtBottom,
    scrollToBottom,
    scrollHandlers: {
      onScroll: handleScroll,
      onWheel: handleWheel,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
    },
  };
}
