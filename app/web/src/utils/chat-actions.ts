// Send, regenerate, edit-and-resend — the three things a chat does, for ordinary turns and for skill runs.
// Nothing here talks to the network: every call goes to the engine provider, which runs the model in this tab.
import { useCallback } from 'react';
import type { ChatCompletionMessage } from '@wllama/wllama';
import { useWllama } from './wllama.context';
import { useMessages } from './messages.context';
import { useNav } from './nav.context';
import { GenerationStats, MediaData, Message, Screen, SkillRunRecord } from './types';
import { errorText, newId } from './utils';
import type { StreamOutcome } from './engine';
import { getSkill } from '../skills';
import { runSkill } from '../skills/run';
import { neutralTitle } from '../skills/storage';
import type { Skill, SkillInput } from '../skills/types';

/** The one moment of ceremony: the stamp lands on the first answer that finishes in this session. */
export const stampState: { firstReceiptId: number | null } = { firstReceiptId: null };

export interface SendArgs {
  text: string;
  media?: MediaData;
  skillId?: string;
  skillInput?: SkillInput;
}

function titleFor(text: string, skill?: Skill): string {
  // a text that went to a skill handling personal data is kept in memory only; a title quoting it would be saved
  if (skill?.personalData) return neutralTitle(skill.personalData.title, Date.now());
  const t = text.trim().replace(/\s+/g, ' ');
  const head = t.length > 52 ? `${t.slice(0, 52)}…` : t;
  if (skill) return head ? `${skill.name}: ${head}` : skill.name;
  return head || 'New conversation';
}

/**
 * Build the prompt from the turns before this one. There is no tokenizer in wllama v3, so the budget is counted in
 * characters (about three per token for European text, deliberately pessimistic) and whole turns are dropped from the
 * oldest end. The receipt says how many were left out, so nobody has to guess why the model forgot something.
 */
function buildMessages(
  history: Message[],
  systemPrompt: string,
  budgetChars: number
): { messages: ChatCompletionMessage[]; dropped: number } {
  const turns = history.filter((m) => !m.skillId && !m.skillRun && !m.error && (m.content.trim() || m.mediaData));
  const kept: Message[] = [];
  let used = systemPrompt.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = turns[i].content.length + (turns[i].mediaData ? 1200 : 0);
    if (kept.length > 0 && used + cost > budgetChars) break;
    used += cost;
    kept.unshift(turns[i]);
  }
  const messages: ChatCompletionMessage[] = [];
  if (systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt.trim() });
  for (const m of kept) {
    if (m.role === 'user' && m.mediaData) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', data: m.mediaData.data },
          { type: 'text', text: m.content },
        ],
      });
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  }
  return { messages, dropped: turns.length - kept.length };
}

export function useChatActions() {
  const engine = useWllama();
  const msgs = useMessages();
  const nav = useNav();
  const { loadedModel, runtime, params, generate, setNotice } = engine;

  const receiptFrom = useCallback(
    (o: StreamOutcome, dropped: number): GenerationStats => ({
      modelName: loadedModel?.name ?? 'unknown model',
      ranOn: 'this device',
      tokensIn: o.tokensIn,
      tokensOut: o.tokensOut,
      decodeTokS: o.decodeTokS,
      prefillTokS: o.prefillTokS,
      speedSource: o.speedSource,
      ttftMs: o.ttftMs,
      totalMs: o.totalMs,
      networkRequests: o.networkRequests,
      networkHosts: o.networkHosts,
      threads: runtime?.threads ?? 0,
      gpu: (runtime?.gpuLayers ?? 0) > 0,
      stopped: o.stopped,
      finishReason: o.finishReason,
      ...(dropped > 0 ? { droppedTurns: dropped } : {}),
    }),
    [loadedModel, runtime]
  );

  const patch = useCallback(
    (convId: number, msgId: number, fn: (m: Message) => Message, flush = false) => {
      msgs.setMessages(convId, (prev) => prev.map((m) => (m.id === msgId ? fn(m) : m)), { flush });
    },
    [msgs]
  );

  /** Run the model for the assistant message `assistantId`, answering the user message that precedes it. */
  const respond = useCallback(
    async (convId: number, assistantId: number) => {
      const conv = msgs.readConversation(convId);
      if (!conv) return;
      const index = conv.messages.findIndex((m) => m.id === assistantId);
      const userMsg = index > 0 ? conv.messages[index - 1] : undefined;
      if (!userMsg) return;

      const finish = (o: StreamOutcome, dropped: number, extra?: Partial<Message>) => {
        const receipt = receiptFrom(o, dropped);
        if (stampState.firstReceiptId == null && !o.stopped) stampState.firstReceiptId = assistantId;
        patch(convId, assistantId, (m) => ({ ...m, ...extra, pending: false, receipt }), true);
      };

      try {
        const skill = getSkill(userMsg.skillId);
        if (skill) {
          const result = await runSkill(
            generate,
            skill,
            userMsg.content,
            userMsg.skillInput,
            { thinks: loadedModel?.info?.thinks, noThinkSwitch: loadedModel?.info?.noThinkSwitch },
            (run: SkillRunRecord) => patch(convId, assistantId, (m) => ({ ...m, skillRun: run, content: '' })),
          );
          if (result.outcome) finish(result.outcome, 0, { skillRun: result.run });
          else
            patch(
              convId,
              assistantId,
              (m) => ({ ...m, skillRun: result.run, pending: false, error: result.run.issues[0] ?? 'The skill did not run.' }),
              true
            );
          return;
        }

        const budget = Math.max(1000, ((runtime?.nCtx ?? params.nContext) - params.nPredict) * 3);
        const { messages, dropped } = buildMessages(
          conv.messages.slice(0, index),
          params.systemPrompt,
          budget
        );
        const outcome = await generate(
          { messages, maxTokens: params.nPredict, temperature: params.temperature },
          {
            onText(answer, reasoning) {
              patch(convId, assistantId, (m) => ({ ...m, content: answer, reasoning: reasoning || undefined }));
            },
          }
        );
        finish(outcome, dropped, { content: outcome.answer, reasoning: outcome.reasoning || undefined });
      } catch (e) {
        patch(convId, assistantId, (m) => ({ ...m, pending: false, error: errorText(e) }), true);
      }
    },
    [generate, loadedModel, msgs, params, patch, receiptFrom, runtime]
  );

  const send = useCallback(
    async ({ text, media, skillId, skillInput }: SendArgs) => {
      if (!loadedModel) {
        setNotice('Load a model first: open Models and load one.');
        nav.navigate(Screen.MODEL);
        return;
      }
      const skill = getSkill(skillId);
      const userMsg: Message = {
        id: newId(),
        role: 'user',
        content: text,
        mediaData: media,
        ...(skill ? { skillId: skill.id, skillInput } : {}),
      };
      const assistantMsg: Message = { id: newId(), role: 'assistant', content: '', pending: true };

      let convId = nav.convId;
      if (convId == null || !msgs.readConversation(convId)) {
        const conv = msgs.createConversation(titleFor(text, skill), [userMsg, assistantMsg]);
        convId = conv.id;
        nav.navigate(Screen.CHAT, convId);
      } else {
        msgs.setMessages(convId, (prev) => [...prev, userMsg, assistantMsg]);
        nav.navigate(Screen.CHAT, convId);
      }
      await respond(convId, assistantMsg.id);
    },
    [loadedModel, msgs, nav, respond, setNotice]
  );

  /** Throw the answer away and ask again, from the same user message. */
  const regenerate = useCallback(
    async (convId: number, assistantId: number) => {
      if (!loadedModel) return;
      // after a reload, a text that went to a personal-data skill is a placeholder: running the skill on it helps nobody
      const conv = msgs.readConversation(convId);
      const index = conv?.messages.findIndex((m) => m.id === assistantId) ?? -1;
      if (index > 0 && conv?.messages[index - 1].textNotSaved) {
        setNotice('The original text was not saved, so the skill cannot run on it again. Paste it into the box instead.');
        return;
      }
      patch(convId, assistantId, (m) => ({
        ...m,
        content: '',
        reasoning: undefined,
        receipt: undefined,
        skillRun: undefined,
        error: undefined,
        pending: true,
      }));
      await respond(convId, assistantId);
    },
    [loadedModel, msgs, patch, respond, setNotice]
  );

  /** Change the last user message and ask again; everything after it is dropped. */
  const editAndResend = useCallback(
    async (convId: number, userMsgId: number, newText: string) => {
      if (!loadedModel) return;
      const conv = msgs.readConversation(convId);
      if (!conv) return;
      const index = conv.messages.findIndex((m) => m.id === userMsgId);
      if (index < 0) return;
      const assistantMsg: Message = { id: newId(), role: 'assistant', content: '', pending: true };
      msgs.setMessages(convId, (prev) => [
        ...prev.slice(0, index),
        { ...prev[index], content: newText },
        assistantMsg,
      ]);
      await respond(convId, assistantMsg.id);
    },
    [loadedModel, msgs, respond]
  );

  return { send, regenerate, editAndResend, stop: engine.stop };
}
