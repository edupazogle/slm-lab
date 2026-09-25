// The chat: the conversation, the skill bar, and the composer.
import { useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '../lib/localmode/conversation';
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '../lib/localmode/prompt-input';
import { Suggestion, Suggestions } from '../lib/localmode/suggestions';
import { Button } from '../lib/localmode/button';
import { useMessages } from '../utils/messages.context';
import { useNav } from '../utils/nav.context';
import { useWllama } from '../utils/wllama.context';
import { useChatActions } from '../utils/chat-actions';
import { MediaData, ModelState, Screen } from '../utils/types';
import { SKILLS, getSkill } from '../skills';
import { AssistantMessage, UserMessage } from './MessageItem';
import { formatBytes } from '../utils/format';
import { isOfferable } from '../utils/displayed-model';
import { STARTER_MODEL_URL } from '../config';

const SUGGESTIONS = [
  {
    label: 'Write to a customer',
    text: 'Draft a short, plain-language email asking a customer for the two photos of the damage we still need.',
  },
  {
    label: 'Explain a decision',
    text: 'Explain in three sentences, without jargon, why a water-damage claim needs a plumber’s report before it is paid.',
  },
  {
    label: 'Prepare a call',
    text: 'List the questions a claims handler should ask the customer after a rear-end collision with no injuries.',
  },
  {
    label: 'Shorten a note',
    text: 'Summarise this claim note in two sentences a handler can read in ten seconds:\n\n',
  },
];

export default function ChatScreen() {
  const { convId } = useNav();
  const { getConversation } = useMessages();
  const { loadedModel, runtime, loadProgress, isGenerating, setNotice } = useWllama();
  const { send, regenerate, editAndResend, stop } = useChatActions();
  const [skillId, setSkillId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [count, setCount] = useState(4);
  const [image, setImage] = useState<MediaData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const conv = getConversation(convId);
  const messages = conv?.messages ?? [];
  const skill = getSkill(skillId);
  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  // A skill takes one text and answers once: the composer is cleared when the person switches to another chip. This was
  // an effect on `skillId`, which also ran after a suggestion was picked with a skill chip active (the suggestion sets
  // the chip back to Chat, then its text) and emptied the box it had just filled.
  const pickSkill = (id: string | null) => {
    if (id !== skillId) setText('');
    setSkillId(id);
  };

  const focusComposer = () => {
    composerRef.current?.querySelector('textarea')?.focus();
  };

  const onSubmit = (value: string) => {
    if (isGenerating) return false;
    // The box is open while a model loads, so a person can type ahead. Sending then used to fall through to `send`,
    // which cleared the text and moved to the Models screen: refuse it here and keep the text (and the image).
    if (!loadedModel) {
      setNotice('Not sent: the model was still loading. Your text is still in the box.');
      return false;
    }
    const media = image ?? undefined;
    setImage(null);
    void send({
      text: value,
      media,
      skillId: skill?.id,
      skillInput: skill?.options ? { count } : undefined,
    });
    setText('');
  };

  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.arrayBuffer().then((data) => setImage({ type: 'image', data, mimeType: file.type, name: file.name }));
  };

  return (
    <div className="chat-screen">
      <ModelStrip />

      <Conversation history={messages} key={convId ?? 'new'}>
        <ConversationContent className="chat-content">
          {messages.length === 0 ? (
            <div className="empty-state">
              <h1>What you type here stays on this device</h1>
              <p>
                The model runs inside this browser tab. Ask it something, or pick one of the skills under the box —
                they fill a form, pseudonymise a text, triage a claim or invent test data.
              </p>
              {!loadedModel && !loadProgress && <StartModel />}
              <Suggestions>
                {SUGGESTIONS.map((s) => (
                  <Suggestion
                    key={s.label}
                    label={s.label}
                    suggestion={s.text}
                    onSelect={(t) => {
                      setSkillId(null);
                      setText(t);
                      focusComposer();
                    }}
                  >
                    {s.text.trim()}
                  </Suggestion>
                ))}
              </Suggestions>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <UserMessage
                  key={m.id}
                  msg={m}
                  canEdit={m.id === lastUserId && !isGenerating && !m.skillId}
                  onEdit={(t) => convId != null && void editAndResend(convId, m.id, t)}
                />
              ) : (
                <AssistantMessage
                  key={m.id}
                  msg={m}
                  inputText={messages[i - 1]?.content ?? ''}
                  modelName={loadedModel?.name ?? 'the model'}
                  canRegenerate={!isGenerating && !!loadedModel && m.id === lastAssistant?.id}
                  regenerateBlocked={
                    messages[i - 1]?.textNotSaved
                      ? 'The original text was not saved, so the skill cannot run on it again. Paste it into the box instead.'
                      : undefined
                  }
                  onRegenerate={() => convId != null && void regenerate(convId, m.id)}
                />
              )
            )
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="composer-area" ref={composerRef}>
        <div className="skill-bar" role="group" aria-label="What the model should do">
          <button
            type="button"
            className={`skill-chip${skill ? '' : ' is-active'}`}
            aria-pressed={!skill}
            onClick={() => pickSkill(null)}
          >
            Chat
          </button>
          {SKILLS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`skill-chip${skill?.id === s.id ? ' is-active' : ''}`}
              aria-pressed={skill?.id === s.id}
              onClick={() => pickSkill(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        {skill && (
          <div className="skill-help">
            <p>{skill.purpose}</p>
            <div className="skill-help-actions">
              {skill.options?.map((o) => (
                <label key={o.key} className="ff skill-option">
                  <span className="ff-label">{o.label}</span>
                  <input
                    className="typed skill-option-input"
                    type="number"
                    min={o.min}
                    max={o.max}
                    value={count}
                    onChange={(e) => setCount(Math.min(o.max, Math.max(o.min, Number(e.target.value) || o.default)))}
                  />
                </label>
              ))}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setText(skill.example);
                  focusComposer();
                }}
              >
                Use an example
              </Button>
            </div>
          </div>
        )}

        {image && (
          <div className="attachment">
            <span className="typed">{image.name ?? 'image'} · {formatBytes(image.data.byteLength)}</span>
            <Button type="button" size="icon-xs" variant="ghost" aria-label="Remove the image" onClick={() => setImage(null)}>
              <X className="size-3" aria-hidden="true" />
            </Button>
          </div>
        )}

        <PromptInput
          onSubmit={onSubmit}
          value={text}
          onValueChange={setText}
          streaming={isGenerating}
          onStop={stop}
          allowEmpty={!!skill && !skill.requiresText}
          label={skill ? skill.inputLabel : 'Message'}
          disabled={!loadedModel && !loadProgress}
        >
          <PromptInputTextarea
            placeholder={skill ? skill.placeholder : 'Ask the model something.'}
            aria-label={skill ? skill.inputLabel : 'Message'}
          />
          <PromptInputTools>
            <span className="composer-tools">
              {runtime?.supportsImage && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onPickImage} />
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => fileRef.current?.click()}
                    disabled={isGenerating}
                  >
                    <ImagePlus className="size-3" aria-hidden="true" /> Attach an image
                  </Button>
                </>
              )}
            </span>
            <PromptInputSubmit submitLabel={skill ? 'Run the skill' : 'Send'} />
          </PromptInputTools>
        </PromptInput>

        <p className="composer-foot">
          {loadedModel
            ? `Answers come from ${loadedModel.name}, running in this tab. A model this small gets facts wrong: check anything that matters.`
            : 'No model is loaded yet.'}
        </p>
      </div>
    </div>
  );
}

function ModelStrip() {
  const { navigate } = useNav();
  const { loadedModel, runtime, models, loadModel, lastModelUrl, loadProgress } = useWllama();
  if (loadProgress) {
    const pct = loadProgress.total > 0 ? Math.round((loadProgress.loaded / loadProgress.total) * 100) : null;
    return (
      <div className="model-strip" role="status">
        <span className="typed">
          {loadProgress.phase === 'downloading'
            ? `Downloading the model… ${formatBytes(loadProgress.loaded)}${pct != null ? ` of ${formatBytes(loadProgress.total)} (${pct}%)` : ''}`
            : 'Starting the model in this tab…'}
        </span>
      </div>
    );
  }
  if (loadedModel) {
    return (
      <div className="model-strip">
        <span className="typed">{loadedModel.name}</span>
        <span className="model-strip-meta">
          {runtime?.threads ?? 0} thread{runtime?.threads === 1 ? '' : 's'} ·{' '}
          {runtime && runtime.gpuLayers > 0 ? 'GPU' : 'processor'}
        </span>
        <Button type="button" size="xs" variant="ghost" onClick={() => navigate(Screen.MODEL)}>
          Change model
        </Button>
      </div>
    );
  }
  const last = models.find((m) => m.url === lastModelUrl && m.state === ModelState.READY && isOfferable(m));
  return (
    <div className="model-strip model-strip-empty">
      <span>No model is loaded in this tab.</span>
      {last ? (
        <Button type="button" size="xs" onClick={() => void loadModel(last)}>
          Load {last.name}
        </Button>
      ) : (
        <Button type="button" size="xs" onClick={() => navigate(Screen.MODEL)}>
          Choose a model
        </Button>
      )}
    </div>
  );
}

/**
 * The first run in one click: the smallest model in the list, downloaded (once) and started in this tab. The download
 * goes through `downloadModel`, which asks the browser to keep the file and can be cancelled; it reports whether the
 * file arrived, and only then is the model loaded. A model kept for engine tests (lab only) is never offered here.
 */
function StartModel() {
  const { models, secureContext, downloadModel, cancelDownload, loadModel } = useWllama();
  const { navigate } = useNav();
  const [starting, setStarting] = useState(false);
  const starter = models.find((m) => m.url === STARTER_MODEL_URL);
  if (!secureContext || !starter || !isOfferable(starter)) return null;

  const onDevice = starter.state === ModelState.READY;
  const downloading = starter.state === ModelState.DOWNLOADING && starter.downloadLoaded >= 0;
  const start = async () => {
    setStarting(true);
    try {
      if (onDevice || (await downloadModel(starter))) await loadModel(starter);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="start-model">
      {downloading ? (
        <p role="status">
          Downloading {starter.name}: {formatBytes(starter.downloadLoaded)} of{' '}
          {formatBytes(starter.downloadTotal || starter.size)} ({Math.round(starter.downloadPercent * 100)}%). It starts in
          this tab when the download ends.
        </p>
      ) : (
        <p>
          {onDevice
            ? `${starter.name} is already on this device. One click starts it in this tab.`
            : `To start, one click downloads ${starter.name}, the smallest model in the list (${formatBytes(starter.size)}, once, from huggingface.co), keeps it in this browser's storage and starts it in this tab.`}
        </p>
      )}
      <div className="start-model-actions">
        {downloading ? (
          <Button type="button" size="sm" variant="outline" onClick={() => cancelDownload(starter.url)}>
            Cancel the download
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={starting} onClick={() => void start()}>
            Start with {starter.name}
            {onDevice ? '' : ` (${formatBytes(starter.size)})`}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => navigate(Screen.MODEL)}>
          Choose another model
        </Button>
      </div>
    </div>
  );
}
