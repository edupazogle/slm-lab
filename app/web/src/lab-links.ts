// Where the lab's pages link to. The chat, the benchmark and the needle self-test are served under /lab/; the site's
// home is Second Look, at the root. HOME_HREF is the one place that says so: change it here if the pages move again.
export const HOME_HREF = '../';

// The benchmark's default run: what bench.html offers when it is opened with no parameters.
export const BENCH_MODEL = {
  url: 'https://huggingface.co/ngxson/SmolLM2-360M-Instruct-Q8_0-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf',
  label: 'SmolLM2 360M Instruct (Q8_0)',
  /** decimal megabytes, as Hugging Face shows the file (386,404,992 bytes) */
  sizeMB: 386,
};

/** Relative to bench.html's own folder, so it holds wherever the lab's pages are served from. */
export const BENCH_HREF =
  './bench.html?' +
  new URLSearchParams({
    url: BENCH_MODEL.url,
    threads: 'auto',
    gpu: '0',
    n: '64',
    reps: '2',
    tag: 'default',
  }).toString();
