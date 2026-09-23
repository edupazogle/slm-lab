// Conversations, and the way to the other screens. On a phone this is the drawer.
import { useState } from 'react';
import { Bug, Check, Cpu, MessageSquarePlus, Pencil, Settings2, Trash2, X } from 'lucide-react';
import { useMessages } from '../utils/messages.context';
import { useNav } from '../utils/nav.context';
import { Screen } from '../utils/types';
import { useWllama } from '../utils/wllama.context';
import { Button } from '../lib/localmode/button';
import { WLLAMA_VERSION } from '../config';

export default function Sidebar() {
  const { conversations, renameConversation, deleteConversation } = useMessages();
  const { screen, convId, navigate } = useNav();
  const { loadedModel, runtime } = useWllama();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  return (
    <nav className="sidebar" aria-label="Conversations and screens">
      <div className="sidebar-top">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => navigate(Screen.CHAT, null)}
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" />
          New conversation
        </Button>
      </div>

      <ul className="conv-list">
        {conversations.length === 0 && (
          <li className="conv-empty">No conversations yet.</li>
        )}
        {conversations.map((conv) => {
          const active = conv.id === convId && screen === Screen.CHAT;
          if (editing === conv.id) {
            return (
              <li key={conv.id} className="conv-row">
                <form
                  className="conv-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    renameConversation(conv.id, draft);
                    setEditing(null);
                  }}
                >
                  <input
                    autoFocus
                    className="conv-rename-input typed"
                    aria-label="Conversation name"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                  <Button type="submit" size="icon-xs" variant="ghost" aria-label="Save the name">
                    <Check className="size-3" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="icon-xs" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X className="size-3" aria-hidden="true" />
                  </Button>
                </form>
              </li>
            );
          }
          return (
            <li key={conv.id} className="conv-row">
              <button
                type="button"
                className={`conv-open${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(Screen.CHAT, conv.id)}
              >
                <span className="conv-title">{conv.title}</span>
                <span className="conv-count typed">{conv.messages.filter((m) => m.role === 'user').length}</span>
              </button>
              <span className="conv-actions">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Rename "${conv.title}"`}
                  onClick={() => {
                    setEditing(conv.id);
                    setDraft(conv.title);
                  }}
                >
                  <Pencil className="size-3" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete "${conv.title}"`}
                  onClick={() => setConfirmDelete(conv.id)}
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </Button>
              </span>
              {confirmDelete === conv.id && (
                <div className="conv-confirm">
                  <span>Delete this conversation?</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    onClick={() => {
                      setConfirmDelete(null);
                      if (conv.id === convId) navigate(Screen.CHAT, null);
                      deleteConversation(conv.id);
                    }}
                  >
                    Delete
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmDelete(null)}>
                    Keep
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sidebar-bottom">
        <div className="ff sidebar-model">
          <span className="ff-label">Model in this tab</span>
          <span className="typed">{loadedModel ? loadedModel.name : 'none loaded'}</span>
          {loadedModel && runtime && (
            <span className="text-xs text-base-content/70">
              {runtime.threads} thread{runtime.threads === 1 ? '' : 's'} ·{' '}
              {runtime.gpuLayers > 0 ? 'GPU' : 'processor'} · {runtime.nCtx.toLocaleString('en-GB')} token context
            </span>
          )}
        </div>
        <ul className="nav-list">
          <li>
            <button
              type="button"
              className={`nav-item${screen === Screen.MODEL ? ' is-active' : ''}`}
              onClick={() => navigate(Screen.MODEL)}
            >
              <Cpu className="size-4" aria-hidden="true" /> Models
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`nav-item${screen === Screen.SETTINGS ? ' is-active' : ''}`}
              onClick={() => navigate(Screen.SETTINGS)}
            >
              <Settings2 className="size-4" aria-hidden="true" /> Settings
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`nav-item${screen === Screen.LOG ? ' is-active' : ''}`}
              onClick={() => navigate(Screen.LOG)}
            >
              <Bug className="size-4" aria-hidden="true" /> Engine log
            </button>
          </li>
        </ul>
        <p className="sidebar-foot typed">wllama {WLLAMA_VERSION}</p>
      </div>
    </nav>
  );
}
