// Formatting for every number the app shows. Decimal units (1 MB = 1,000,000 bytes) so a model's size here matches
// the size Hugging Face shows for the same file. Numbers always carry their unit.

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = -1;
  do {
    v /= 1000;
    i++;
  } while (v >= 1000 && i < units.length - 1);
  const digits = v >= 100 || units[i] === 'kB' ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
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

/** "SmolLM2-360M-Instruct Q8_0" from a GGUF file name. */
export function modelDisplayName(url: string): string {
  const file = decodeURIComponent(url.split('/').pop() ?? url)
    .replace(/\.gguf$/i, '')
    .replace(/-\d{5}-of-\d{5}$/, '');
  return file;
}
