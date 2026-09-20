// Reads a flat JSON object that is still being written.
//
// The demo asks the model for grammar-constrained JSON and streams it. To type each value into the
// form while it is generated, the page needs the values of an object whose text stops mid-way
// ({"policy_number":"HAB-22). JSON.parse cannot do that, so this walks the text once and returns
// whatever is complete plus the value currently being written. Flat objects only: string, number,
// true/false/null values. That is all the claim form uses.

export interface PartialObject {
  /** key -> value text as written so far, in the order the model wrote them */
  values: Record<string, string>;
  /** the key whose value is not finished yet, or null when the text ends between values */
  active: string | null;
  /** true when the closing brace has been read */
  closed: boolean;
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '', b: '', f: '', '"': '"', '\\': '\\', '/': '/' };

function readString(text: string, start: number): { value: string; end: number; complete: boolean } {
  // `start` is the index just after the opening quote
  let out = '';
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') return { value: out, end: i + 1, complete: true };
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) break; // escape not finished yet
      if (next === 'u') {
        const hex = text.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        const code = Number.parseInt(hex, 16);
        if (!Number.isNaN(code)) out += String.fromCharCode(code);
        i += 6;
        continue;
      }
      out += ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return { value: out, end: text.length, complete: false };
}

export function readPartialObject(text: string): PartialObject {
  const result: PartialObject = { values: {}, active: null, closed: false };
  let i = text.indexOf('{');
  if (i < 0) return result;
  i += 1;
  const skip = () => {
    while (i < text.length && /[\s,]/.test(text[i])) i += 1;
  };
  while (i < text.length) {
    skip();
    if (i >= text.length) break;
    if (text[i] === '}') {
      result.closed = true;
      break;
    }
    if (text[i] !== '"') break; // not a key: stop rather than guess
    const key = readString(text, i + 1);
    if (!key.complete) break;
    i = key.end;
    skip();
    if (text[i] !== ':') break;
    i += 1;
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (i >= text.length) {
      result.values[key.value] = '';
      result.active = key.value;
      break;
    }
    if (text[i] === '"') {
      const val = readString(text, i + 1);
      result.values[key.value] = val.value;
      i = val.end;
      if (!val.complete) {
        result.active = key.value;
        break;
      }
    } else {
      const m = /^[-+0-9.eEa-z]+/.exec(text.slice(i));
      const raw = m ? m[0] : '';
      result.values[key.value] = raw;
      i += raw.length;
      if (i >= text.length) {
        // a number may still grow (18 -> 1840), so it stays the active field until something follows it
        result.active = key.value;
        break;
      }
      if (!raw) break;
    }
  }
  return result;
}
