// What a conversation looks like on disk. A skill may hold data that must live in memory only (the Anonymise mapping
// between placeholders and real values); this is the one place that strips it, and it runs on every write.
import type { Conversation, Message } from '../utils/types';
import { getSkill } from './index';

export function forStorage(conv: Conversation): Conversation {
  let changed = false;
  const messages: Message[] = conv.messages.map((m, i) => {
    if (!m.skillRun) return m;
    const skill = getSkill(m.skillRun.skillId);
    if (!skill?.forStorage) return m;
    // the text the skill ran on is the user message just before it
    const input = conv.messages[i - 1]?.role === 'user' ? conv.messages[i - 1].content : '';
    const next = skill.forStorage(m.skillRun, input);
    if (next === m.skillRun) return m;
    changed = true;
    return { ...m, skillRun: next };
  });
  return changed ? { ...conv, messages } : conv;
}
