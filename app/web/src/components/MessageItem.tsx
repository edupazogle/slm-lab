// One turn. A user message is a form field with what was typed in it; an answer is the model's text (or a skill's
// rendered result), its thinking if it wrote any, and the receipt.
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, Pencil, RefreshCw } from 'lucide-react';
import type { Message, SkillRunRecord } from '../utils/types';
import { Button } from '../lib/localmode/button';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../lib/localmode/reasoning';
import { MarkdownMessage } from './MarkdownMessage';
import { Receipt } from './Receipt';
import { getSkill } from '../skills';
import { copyText } from '../utils/utils';
import { stampState } from '../utils/chat-actions';

function useObjectUrl(data?: ArrayBuffer, mimeType?: string) {
  const url = useMemo(() => (data ? URL.createObjectURL(new Blob([data], { type: mimeType })) : null), [data, mimeType]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export function UserMessage({
  msg,
  canEdit,
  onEdit,
}: {
  msg: Message;
  canEdit: boolean;
  onEdit(text: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const imgUrl = useObjectUrl(msg.mediaData?.data, msg.mediaData?.mimeType);
  const skill = getSkill(msg.skillId);

  return (
    <article className="msg msg-user">
      <header className="msg-head">
        <span className="msg-who">You</span>
        {skill && <span className="msg-skill typed">{skill.name}</span>}
      </header>
      {imgUrl && <img className="msg-image" src={imgUrl} alt={msg.mediaData?.name ?? 'The image you attached'} />}
      {editing ? (
        <form
          className="msg-edit"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            onEdit(draft);
          }}
        >
          <label className="ff">
            <span className="ff-label">Edit and send again</span>
            <textarea
              autoFocus
              className="msg-edit-input typed"
              rows={Math.min(10, draft.split('\n').length + 1)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <div className="msg-actions">
            <Button type="submit" size="sm">
              Send again
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="msg-body typed">{msg.content}</div>
          {canEdit && (
            <div className="msg-actions">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setDraft(msg.content);
                  setEditing(true);
                }}
              >
                <Pencil className="size-3" aria-hidden="true" /> Edit and send again
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export function AssistantMessage({
  msg,
  inputText,
  modelName,
  canRegenerate,
  onRegenerate,
}: {
  msg: Message;
  inputText: string;
  modelName: string;
  canRegenerate: boolean;
  onRegenerate(): void;
}) {
  const [copied, setCopied] = useState(false);
  const skill = getSkill(msg.skillRun?.skillId);
  const run = msg.skillRun;
  const who = msg.receipt?.modelName ?? modelName;

  const copyBody = run ? JSON.stringify(run.object ?? {}, null, 2) : msg.content;

  return (
    <article className="msg msg-assistant">
      <header className="msg-head">
        <span className="msg-who typed">{who}</span>
        {run && <span className="msg-skill typed">{skill?.name ?? run.skillId}</span>}
      </header>

      {msg.reasoning && (
        <Reasoning streaming={!!msg.pending && !msg.content}>
          <ReasoningTrigger />
          <ReasoningContent>{msg.reasoning}</ReasoningContent>
        </Reasoning>
      )}

      {run && skill ? (
        <>
          <SkillRenderBoundary run={run}>
            <skill.Render object={run.object as never} streaming={run.status === 'running'} input={inputText} skillInput={msg.skillInput} run={run} />
          </SkillRenderBoundary>
          {run.status !== 'running' && <ValidationBadge run={run} />}
        </>
      ) : msg.content ? (
        <MarkdownMessage content={msg.content} />
      ) : msg.pending ? (
        <p className="msg-waiting">Reading the prompt…</p>
      ) : null}

      {msg.error && <p className="notice notice-error">{msg.error}</p>}

      {msg.receipt && <Receipt stats={msg.receipt} stamp={stampState.firstReceiptId === msg.id} />}

      {!msg.pending && (
        <div className="msg-actions">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={async () => {
              const ok = await copyText(copyBody);
              setCopied(ok);
              if (ok) setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {canRegenerate && (
            <Button type="button" size="xs" variant="ghost" onClick={onRegenerate}>
              <RefreshCw className="size-3" aria-hidden="true" /> Ask again
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * A renderer is written for the shape its schema describes, but the fallback path can hand it any JSON (a string where a
 * list goes, an object where a word goes). If it throws, this answer shows the raw text instead of the chat going blank.
 */
class SkillRenderBoundary extends Component<{ run: SkillRunRecord; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { run: SkillRunRecord }) {
    // the next partial object while it streams, or the final one, gets a fresh try
    const { run } = this.props;
    if (this.state.failed && (prev.run.object !== run.object || prev.run.status !== run.status)) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { run } = this.props;
    return (
      <div className="skill-result">
        <p className="text-sm">The answer did not match the shape this skill shows, so here it is as the model wrote it.</p>
        <pre className="typed whitespace-pre-wrap break-words">{run.rawText || (JSON.stringify(run.object, null, 2) ?? '')}</pre>
      </div>
    );
  }
}

function ValidationBadge({ run }: { run: NonNullable<Message['skillRun']> }) {
  const path =
    run.path === 'grammar'
      ? 'The engine was constrained to the schema while it wrote.'
      : `The engine would not take the schema, so the answer was asked for in the prompt and checked afterwards (${run.attempts} attempt${run.attempts === 1 ? '' : 's'}).`;
  return (
    <div className={`validation ${run.valid ? 'is-valid' : 'is-invalid'}`}>
      <p className="validation-head">{run.valid ? 'Valid against the schema' : 'Does not match the schema'}</p>
      {run.issues.length > 0 && (
        <ul className="validation-issues typed">
          {run.issues.map((i, n) => (
            <li key={n}>{i}</li>
          ))}
        </ul>
      )}
      <p className="validation-path">
        {path}
        {run.grammarError ? ` Reason: ${run.grammarError}` : ''}
      </p>
    </div>
  );
}
