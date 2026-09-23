// Lifted from Mintplex-Labs/anything-llm @ da66855 — frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/ThoughtContainer/index.jsx
// lines 65-87 (MIT, Copyright (c) Mintplex Labs Inc.). Changes: only the tag regexes and `stripThoughtTags` were taken
// (the React expansion context and the phosphor-icon UI were not); typed for TypeScript.

const THOUGHT_KEYWORDS = ['thought', 'thinking', 'think', 'thought_chain'];
const CLOSING_TAGS = [...THOUGHT_KEYWORDS, 'response', 'answer'];
export const THOUGHT_REGEX_OPEN = new RegExp(
  THOUGHT_KEYWORDS.map((keyword) => `<${keyword}\\s*(?:[^>]*?)?\\s*>`).join('|')
);
export const THOUGHT_REGEX_CLOSE = new RegExp(
  CLOSING_TAGS.map((keyword) => `</${keyword}\\s*(?:[^>]*?)?>`).join('|')
);
export const THOUGHT_REGEX_COMPLETE = new RegExp(
  THOUGHT_KEYWORDS.map(
    (keyword) =>
      `<${keyword}\\s*(?:[^>]*?)?\\s*>[\\s\\S]*?<\\/${keyword}\\s*(?:[^>]*?)?>`
  ).join('|')
);

/**
 * Removes the wrapping think tags from a thought segment.
 */
export function stripThoughtTags(content = ''): string {
  return content
    .replace(THOUGHT_REGEX_OPEN, '')
    .replace(THOUGHT_REGEX_CLOSE, '');
}
