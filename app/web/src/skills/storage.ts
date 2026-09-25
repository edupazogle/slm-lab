// What a conversation looks like on disk. A skill may hold data that must live in memory only (the Pseudonymise mapping
// between placeholders and real values, and the text it ran on); this is the one place that strips it. It runs on every
// write, and on every conversation read at startup, so a record saved before a rule existed is cleaned as well.
import type { Conversation, Message } from '../utils/types';
import { withoutRawText } from '../lib/localmode/schema';
import { getSkill } from './index';

/** What a reloaded conversation shows in place of a text that went to a skill handling personal data. */
export const TEXT_NOT_SAVED =
  "Not saved: this text went to a skill that handles personal data, so it was kept in this page's memory only.";

/** The title of a conversation started by such a skill: the kind of result and when, never the text itself. */
export function neutralTitle(title: string, at: number): string {
  const when = new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${title} · ${when}`;
}

/** True when `title` quotes the start of `text`, as a title made from the first message did before the rule above. */
function quotes(title: string, text: string): boolean {
  const head = text.trim().replace(/\s+/g, ' ').slice(0, 24);
  return head.length > 0 && title.includes(head);
}

/** The same list when no line changes, so an unchanged record is recognised as unchanged. */
function cleanLines(lines: string[]): string[] {
  const out = lines.map(withoutRawText);
  return out.every((l, k) => l === lines[k]) ? lines : out;
}

export function forStorage(conv: Conversation): Conversation {
  let title = conv.title;
  const messages: Message[] = conv.messages.map((m, i) => {
    if (m.skillRun) {
      const skill = getSkill(m.skillRun.skillId);
      // the text the skill ran on is the user message just before it (still the original, in memory)
      const prev = conv.messages[i - 1];
      const input = prev?.role === 'user' && !prev.textNotSaved ? prev.content : '';
      let run = skill?.forStorage ? skill.forStorage(m.skillRun, input) : m.skillRun;
      let error = m.error;
      if (skill?.personalData) {
        // the error lines must not quote the model's output: for this skill it lists the personal values
        const issues = cleanLines(run.issues);
        if (issues !== run.issues) run = { ...run, issues };
        if (error) error = withoutRawText(error);
      }
      return run === m.skillRun && error === m.error ? m : { ...m, skillRun: run, error };
    }
    if (m.role === 'user' && !m.textNotSaved) {
      const skill = getSkill(m.skillId);
      if (skill?.personalData) {
        if (quotes(title, m.content)) title = neutralTitle(skill.personalData.title, conv.createdAt);
        return { ...m, content: TEXT_NOT_SAVED, textNotSaved: true, mediaData: undefined };
      }
    }
    return m;
  });
  const changed = title !== conv.title || messages.some((m, i) => m !== conv.messages[i]);
  return changed ? { ...conv, title, messages } : conv;
}
