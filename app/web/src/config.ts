// See: https://vitejs.dev/guide/assets#explicit-url-imports
import wllamaWasm from '@wllama/wllama/src/wasm/wllama.wasm?url';
import wllamaPackageJson from '@wllama/wllama/package.json';
import compatConfig from 'virtual:wllama-compat';
import { InferenceParams } from './utils/types';

export const WLLAMA_VERSION = wllamaPackageJson.version;

export const WLLAMA_CONFIG_PATHS = {
  default: wllamaWasm,
};

// Either a local { wasm, worker } object (when compat package is built) or 'default' (CDN fallback)
export const WLLAMA_COMPAT_CONFIG = compatConfig;

export const MAX_GGUF_SIZE = 2 * 1000 * 1000 * 1000; // 2 GB: above this, a wasm32 build may not fit the file

// wasm32 has a 4 GiB heap that holds the weights, the KV cache and the compute buffers together. A larger context
// would be accepted by the settings form and then fail at load, so the form stops here.
export const MAX_CONTEXT = 8192;

export type ModelTier = 'phone' | 'laptop' | 'desktop';

export const TIERS: { id: ModelTier; title: string; blurb: string }[] = [
  {
    id: 'phone',
    title: 'Phone (under 500 MB)',
    blurb:
      'Small enough to download on mobile data and to fit beside the other apps on a phone.',
  },
  {
    id: 'laptop',
    title: 'Laptop (500 MB to 1.2 GB)',
    blurb:
      'Noticeably better answers. Expect a slower first word, and download them on Wi-Fi.',
  },
  {
    id: 'desktop',
    title: 'Desktop (over 1.2 GB)',
    blurb:
      'The largest that a browser tab can hold. They need several gigabytes of free memory and may fail to load.',
  },
];

export const tierOf = (sizeBytes: number): ModelTier =>
  sizeBytes < 500e6 ? 'phone' : sizeBytes <= 1.2e9 ? 'laptop' : 'desktop';

export interface ListedModel {
  url: string;
  mmprojUrl?: string;
  size: number;
  modalities?: ('image' | 'audio')[];
  /** Name a person recognises. */
  name: string;
  /** Who made the original model. */
  maker: string;
  /** What it is good for, in plain language. Qualitative only: no number appears here that was not measured. */
  note: string;
  /** Languages listed on the Hugging Face model card (ISO codes, as written there). null = the card lists none. */
  languages: string[] | null;
  /**
   * Licence exactly as the Hugging Face model card states it, read through the HF API on 2026-09-21.
   * `from` says which card: the GGUF repo's own, or the base model's when the GGUF repo states none.
   */
  licence: { id: string | null; from: 'gguf repo' | 'base model' | 'hosting repo only'; note?: string };
  /** Writes its reasoning before the answer (the chat shows it in a separate, collapsible block). */
  thinks?: boolean;
  /** Understands Qwen3's /no_think switch (used by Skills so the JSON is not preceded by pages of thinking). */
  noThinkSwitch?: boolean;
}

// The entries (URL, size) are the vendored wllama list: curated by wllama's author and known to load.
// The notes, languages and licences were added here; languages and licences come from the model cards, never from memory.
export const LIST_MODELS: ListedModel[] = [
  {
    url: 'https://huggingface.co/ngxson/SmolLM2-360M-Instruct-Q8_0-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf',
    size: 386404992,
    name: 'SmolLM2 360M Instruct',
    maker: 'Hugging Face',
    note: 'The smallest model here and the one to try first. Fine for rewording, short summaries and filling a form from a short text. Weak at facts and reasoning.',
    languages: ['en'],
    licence: { id: 'apache-2.0', from: 'gguf repo' },
  },
  {
    url: 'https://huggingface.co/LiquidAI/LFM2-700M-GGUF/resolve/main/LFM2-700M-Q4_K_M.gguf',
    size: 468624320,
    name: 'LFM2 700M',
    maker: 'Liquid AI',
    note: 'A multilingual model that still fits a phone. A reasonable pick for French, German or Spanish claim notes.',
    languages: ['en', 'ar', 'zh', 'fr', 'de', 'ja', 'ko', 'es'],
    licence: {
      id: 'lfm1.0',
      from: 'gguf repo',
      note: "Liquid AI's own licence, not an open-source one. Read it before any commercial use.",
    },
  },
  {
    url: 'https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/resolve/main/LFM2.5-VL-450M-Q4_0.gguf',
    mmprojUrl:
      'https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/resolve/main/mmproj-LFM2.5-VL-450m-Q8_0.gguf',
    size: 566231040,
    modalities: ['image'],
    name: 'LFM2.5 VL 450M',
    maker: 'Liquid AI',
    note: 'Reads a picture as well as text: attach a photo and ask what it shows. The only image model in this list.',
    languages: ['en', 'ja', 'ko', 'fr', 'es', 'de', 'ar', 'zh'],
    licence: {
      id: 'lfm1.0',
      from: 'gguf repo',
      note: "Liquid AI's own licence, not an open-source one. Read it before any commercial use.",
    },
  },
  {
    url: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    size: 639447744,
    name: 'Qwen3 0.6B',
    maker: 'Alibaba (Qwen)',
    note: 'Writes out its reasoning before it answers, so the first word of the answer arrives later. Skills switch the reasoning off.',
    languages: ['en'],
    licence: { id: 'apache-2.0', from: 'gguf repo' },
    thinks: true,
    noThinkSwitch: true,
  },
  {
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q8_0.gguf',
    size: 675710816,
    name: 'Qwen2.5 0.5B Instruct',
    maker: 'Alibaba (Qwen)',
    note: 'A plain instruction model with no visible reasoning step. Worth comparing with SmolLM2 on the same text.',
    languages: ['en'],
    licence: { id: 'apache-2.0', from: 'gguf repo' },
  },
  {
    url: 'https://huggingface.co/LiquidAI/LFM2-1.2B-GGUF/resolve/main/LFM2-1.2B-Q4_K_M.gguf',
    size: 730893248,
    name: 'LFM2 1.2B',
    maker: 'Liquid AI',
    note: 'The larger multilingual LFM2. A sensible laptop default for mixed-language claim files.',
    languages: ['en', 'ar', 'zh', 'fr', 'de', 'ja', 'ko', 'es'],
    licence: {
      id: 'lfm1.0',
      from: 'gguf repo',
      note: "Liquid AI's own licence, not an open-source one. Read it before any commercial use.",
    },
  },
  {
    url: 'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q4_K_M-GGUF/resolve/main/llama-3.2-1b-instruct-q4_k_m.gguf',
    size: 807690656,
    name: 'Llama 3.2 1B Instruct',
    maker: 'Meta',
    note: 'General chat and rewriting in the European languages on its card.',
    languages: ['en', 'de', 'fr', 'it', 'pt', 'hi', 'es', 'th'],
    licence: {
      id: 'llama3.2',
      from: 'base model',
      note: "Meta's Llama 3.2 community licence, with an acceptable-use policy. The GGUF repo itself states no licence.",
    },
  },
  {
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q3_K_M.gguf',
    size: 924456032,
    name: 'DeepSeek R1 Distill Qwen 1.5B',
    maker: 'DeepSeek',
    note: 'A reasoning model: it thinks at length before answering, which is slow in a browser. Use it to see what a reasoning trace looks like, not for quick answers.',
    languages: null,
    licence: {
      id: 'mit',
      from: 'base model',
      note: 'The GGUF repo itself states no licence.',
    },
    thinks: true,
  },
  {
    url: 'https://huggingface.co/ngxson/wllama-split-models/resolve/main/qwen2-1_5b-instruct-q4_k_m-00001-of-00004.gguf',
    size: 986046272,
    name: 'Qwen2 1.5B Instruct',
    maker: 'Alibaba (Qwen)',
    note: 'An older general model, shipped in four parts so an interrupted download loses less.',
    languages: null,
    licence: {
      id: 'mit',
      from: 'hosting repo only',
      note: "That is the licence of the repository that hosts the split files. The model's own licence was not checked.",
    },
  },
  {
    url: 'https://huggingface.co/ngxson/SmolLM2-1.7B-Instruct-Q4_K_M-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf',
    size: 1055609536,
    name: 'SmolLM2 1.7B Instruct',
    maker: 'Hugging Face',
    note: 'The bigger sibling of the first model in this list, at about three times the download. Larger models of one family usually answer better; compare them on your own text.',
    languages: ['en'],
    licence: { id: 'apache-2.0', from: 'gguf repo' },
  },
  {
    url: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
    size: 1107409472,
    name: 'Qwen3 1.7B',
    maker: 'Alibaba (Qwen)',
    note: 'The larger Qwen3. It reasons before answering; Skills switch that off.',
    languages: ['en'],
    licence: { id: 'apache-2.0', from: 'gguf repo' },
    thinks: true,
    noThinkSwitch: true,
  },
  {
    url: 'https://huggingface.co/ngxson/wllama-split-models/resolve/main/neuralreyna-mini-1.8b-v0.3.q4_k_m-00001-of-00005.gguf',
    size: 1217753472,
    name: 'NeuralReyna mini 1.8B',
    maker: 'community fine-tune',
    note: 'A community fine-tune kept from the engine author’s test list. No reason to prefer it for insurance work.',
    languages: null,
    licence: {
      id: 'mit',
      from: 'hosting repo only',
      note: "That is the licence of the repository that hosts the split files. The model's own licence was not checked.",
    },
  },
  {
    url: 'https://huggingface.co/ngxson/wllama-split-models/resolve/main/gemma-2-2b-it-abliterated-Q4_K_M-00001-of-00004.gguf',
    size: 1708583264,
    name: 'Gemma 2 2B (abliterated)',
    maker: 'Google, modified by a third party',
    note: 'A third party removed this model’s refusal behaviour. Kept from the engine author’s test list; not for work use.',
    languages: null,
    licence: {
      id: 'mit',
      from: 'hosting repo only',
      note: "That is the licence of the repository that hosts the split files. The model's own licence (Google's Gemma terms) was not checked.",
    },
  },
  {
    url: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf',
    size: 1915305312,
    name: 'SmolLM3 3B',
    maker: 'Hugging Face',
    note: 'The largest openly licensed (Apache-2.0) model in this list, with eight languages on its card. A 1.9 GB download that needs a desktop with memory to spare.',
    languages: ['en', 'fr', 'es', 'it', 'pt', 'zh', 'ar', 'ru'],
    licence: { id: 'apache-2.0', from: 'gguf repo' },
  },
  {
    url: 'https://huggingface.co/ngxson/wllama-split-models/resolve/main/Phi-3.1-mini-128k-instruct-Q3_K_M-00001-of-00008.gguf',
    size: 1955478176,
    name: 'Phi-3.1 mini 128k Instruct',
    maker: 'Microsoft',
    note: 'A 3.8B model squeezed hard (Q3) to fit a tab. The squeeze costs quality.',
    languages: null,
    licence: {
      id: 'mit',
      from: 'hosting repo only',
      note: "That is the licence of the repository that hosts the split files. The model's own licence was not checked.",
    },
  },
  {
    url: 'https://huggingface.co/ngxson/wllama-split-models/resolve/main/Meta-Llama-3.1-8B-Instruct-Q2_K-00001-of-00014.gguf',
    size: 3179138048,
    name: 'Llama 3.1 8B Instruct (Q2)',
    maker: 'Meta',
    note: 'An 8B model at the most aggressive compression (Q2). A 3.2 GB download that is slow on a processor and may not load at all.',
    languages: null,
    licence: {
      id: 'mit',
      from: 'hosting repo only',
      note: "That is the licence of the repository that hosts the split files. The model's own licence (Meta's Llama 3.1 community licence) was not checked.",
    },
  },
  {
    url: 'https://huggingface.co/ngxson/wllama-split-models/resolve/main/meta-llama-3.1-8b-instruct-abliterated.Q2_K-00001-of-00014.gguf',
    size: 3179133600,
    name: 'Llama 3.1 8B (abliterated, Q2)',
    maker: 'Meta, modified by a third party',
    note: 'A third party removed this model’s refusal behaviour. Kept from the engine author’s test list; not for work use.',
    languages: null,
    licence: {
      id: 'mit',
      from: 'hosting repo only',
      note: "That is the licence of the repository that hosts the split files. The model's own licence was not checked.",
    },
  },
];

export const LICENCES_CHECKED_ON = '2026-09-21';

/**
 * True when the model's OWN card states Apache-2.0 or MIT. These lead each group, because a person who picks the first
 * model in a list should not land on one they may not use at work. A licence known only from the repository that hosts
 * the split files is not the model's own licence, so it never leads. No model under a non-commercial licence
 * (cc-by-nc) is listed here at all.
 */
export const isOpenLicence = (m?: ListedModel): boolean =>
  !!m && (m.licence.id === 'apache-2.0' || m.licence.id === 'mit') && m.licence.from !== 'hosting repo only';

export const DEFAULT_SYSTEM_PROMPT =
  'You are a concise assistant for an insurance team. Use plain language. If you are not sure, say so.';

export const DEFAULT_INFERENCE_PARAMS: InferenceParams = {
  nThreads: -1, // auto
  nContext: 4096,
  nPredict: 512,
  nBatch: 128,
  temperature: 0.2,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  useGpu: true,
};
