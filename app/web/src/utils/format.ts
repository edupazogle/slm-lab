// Formatting for every number the app shows. Decimal units (1 MB = 1,000,000 bytes) so a model's size here matches
// the size Hugging Face shows for the same file. Numbers always carry their unit.

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  const digitsFor = (v: number, unit: string) => (v >= 100 || unit === 'kB' ? 0 : v >= 10 ? 1 : 2);
  const rounded = (v: number, unit: string) => Number(v.toFixed(digitsFor(v, unit)));
  // The unit is chosen on the ROUNDED value: 999,999 bytes is 999.999 kB, which printed as "1000 kB".
  let v = bytes / 1000;
  let i = 0;
  while (rounded(v, units[i]) >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  // and so are the decimals: 9.996 MB reads "10.0 MB", not "10.00 MB"
  return `${v.toFixed(digitsFor(rounded(v, units[i]), units[i]))} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return 'not measured';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  // round the whole seconds first: rounding only the remainder turned 119.6 s into "1 min 60 s"
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} min ${total % 60} s`;
}

export function formatRate(tokS: number | null | undefined): string {
  if (tokS == null || !Number.isFinite(tokS) || tokS <= 0) return 'not measured';
  return `${tokS >= 100 ? tokS.toFixed(0) : tokS.toFixed(1)} tokens/s`;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'not reported';
  return n.toLocaleString('en-GB');
}

/** decodeURIComponent, or the text unchanged when it holds a malformed escape: "model-100%.gguf" throws a URIError. */
export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** "SmolLM2-360M-Instruct Q8_0" from a GGUF file name. */
export function modelDisplayName(url: string): string {
  const file = safeDecode(url.split('/').pop() ?? url)
    .replace(/\.gguf$/i, '')
    .replace(/-\d{5}-of-\d{5}$/, '');
  return file;
}
