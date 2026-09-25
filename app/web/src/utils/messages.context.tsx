// Conversations, kept in this browser's IndexedDB (idb-keyval), one record per conversation. Replaces the vendored
// store that JSON-stringified every conversation into localStorage on every streamed token (5 MB quota, synchronous,
// O(history) per token). Writes are debounced while an answer streams and flushed when it ends.
//
// Data that must live in memory only (the text given to Pseudonymise, and its mapping between placeholders and real
// values) is removed by `forStorage` before a record is written, so it never reaches the disk. Records saved before that
// rule held the original text: they are cleaned when they are read, and written back cleaned.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { clear, createStore, del, entries, set, setMany } from 'idb-keyval';
import type { Conversation, Message } from './types';
import { errorText, newId } from './utils';
import { forStorage } from '../skills/storage';

interface MessagesContextValue {
  conversations: Conversation[];
  ready: boolean;
  /** why conversations are not being saved, when they are not */
  storageError: string | null;
  getConversation(id: number | null): Conversation | undefined;
  /** the latest state, readable from async code that outlived a render */
  readConversation(id: number): Conversation | undefined;
  createConversation(title: string, messages: Message[]): Conversation;
  setMessages(convId: number, fn: (prev: Message[]) => Message[], opts?: { flush?: boolean }): void;
  renameConversation(id: number, title: string): void;
  deleteConversation(id: number): void;
  /** Empty the conversation store of this browser. Resolves false when the browser refused. */
  deleteAllConversations(): Promise<boolean>;
}

const MessagesContext = createContext<MessagesContextValue | null>(null);

let store: ReturnType<typeof createStore> | null = null;
function getStore() {
  store ??= createStore('slm-lab-chat', 'conversations');
  return store;
}

type ConvMap = Record<number, Conversation>;

export const MessagesProvider = ({ children }: { children: ReactNode }) => {
  const [convs, setConvs] = useState<ConvMap>({});
  const convsRef = useRef<ConvMap>({});
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // conversations whose last write failed, and why: the notice stays while any is left, and goes when none is
  const failedWrites = useRef(new Map<number, string>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await entries<number, Conversation>(getStore());
        if (cancelled) return;
        const map: ConvMap = {};
        const cleaned: [number, Conversation][] = [];
        for (const [id, conv] of all) {
          if (conv && Array.isArray(conv.messages)) {
            // an answer that was streaming when the page closed is finished as it stands
            const loaded: Conversation = {
              ...conv,
              messages: conv.messages.map((m) =>
                m.pending
                  ? {
                      ...m,
                      pending: false,
                      error: m.error ?? 'Interrupted when the page was closed.',
                      ...(m.skillRun?.status === 'running' ? { skillRun: { ...m.skillRun, status: 'failed' as const, valid: false } } : {}),
                    }
                  : m
              ),
            };
            // a record saved before the storage rules existed may still hold what they strip: clean it now
            const clean = forStorage(loaded);
            map[Number(id)] = clean;
            if (clean !== loaded) cleaned.push([Number(id), clean]);
          }
        }
        convsRef.current = map;
        setConvs(map);
        if (cleaned.length > 0) await setMany(cleaned, getStore());
      } catch (e) {
        setStorageError(`Conversations are not being saved: this browser refused its local database (${errorText(e)}).`);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const writeNow = useCallback(async (id: number) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    const conv = convsRef.current[id];
    try {
      if (conv) await set(id, forStorage(conv), getStore());
      else await del(id, getStore());
      failedWrites.current.delete(id);
    } catch (e) {
      failedWrites.current.set(id, `Conversations are not being saved: ${errorText(e)}.`);
    }
    // this also clears a refusal at startup once a write gets through: the database is taking writes again
    setStorageError([...failedWrites.current.values()].pop() ?? null);
  }, []);

  const schedule = useCallback(
    (id: number, flush: boolean) => {
      if (flush) {
        void writeNow(id);
        return;
      }
      if (timers.current[id]) return;
      timers.current[id] = setTimeout(() => void writeNow(id), 800);
    },
    [writeNow]
  );

  const commit = useCallback((next: ConvMap) => {
    convsRef.current = next;
    setConvs(next);
  }, []);

  const createConversation = useCallback(
    (title: string, messages: Message[]) => {
      const now = Date.now();
      const conv: Conversation = { id: newId(), title, messages, createdAt: now, updatedAt: now };
      commit({ ...convsRef.current, [conv.id]: conv });
      schedule(conv.id, true);
      return conv;
    },
    [commit, schedule]
  );

  const setMessages = useCallback(
    (convId: number, fn: (prev: Message[]) => Message[], opts?: { flush?: boolean }) => {
      const conv = convsRef.current[convId];
      if (!conv) return;
      commit({ ...convsRef.current, [convId]: { ...conv, messages: fn(conv.messages), updatedAt: Date.now() } });
      schedule(convId, !!opts?.flush);
    },
    [commit, schedule]
  );

  const renameConversation = useCallback(
    (id: number, title: string) => {
      const conv = convsRef.current[id];
      if (!conv) return;
      commit({ ...convsRef.current, [id]: { ...conv, title: title.trim() || conv.title } });
      schedule(id, true);
    },
    [commit, schedule]
  );

  const deleteConversation = useCallback(
    (id: number) => {
      const next = { ...convsRef.current };
      delete next[id];
      commit(next);
      schedule(id, true);
    },
    [commit, schedule]
  );

  const deleteAllConversations = useCallback(async () => {
    for (const t of Object.values(timers.current)) clearTimeout(t);
    timers.current = {};
    failedWrites.current.clear();
    commit({});
    try {
      await clear(getStore());
      setStorageError(null);
      return true;
    } catch (e) {
      setStorageError(`The conversations are gone from this page, but the browser refused to delete them from its storage: ${errorText(e)}.`);
      return false;
    }
  }, [commit]);

  const conversations = useMemo(
    () => Object.values(convs).sort((a, b) => b.updatedAt - a.updatedAt),
    [convs]
  );

  const getConversation = useCallback((id: number | null) => (id == null ? undefined : convs[id]), [convs]);
  const readConversation = useCallback((id: number) => convsRef.current[id], []);

  return (
    <MessagesContext.Provider
      value={{
        conversations,
        ready,
        storageError,
        getConversation,
        readConversation,
        createConversation,
        setMessages,
        renameConversation,
        deleteConversation,
        deleteAllConversations,
      }}
    >
      {children}
    </MessagesContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider; a hot edit here reloads the page
export const useMessages = () => {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages must be used inside MessagesProvider');
  return ctx;
};
