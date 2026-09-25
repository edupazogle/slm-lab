export enum Screen {
  CHAT,
  MODEL,
  SETTINGS,
  LOG,
}

export enum ModelState {
  NOT_DOWNLOADED,
  DOWNLOADING,
  READY,
  LOADING,
  LOADED,
}

export interface RuntimeInfo {
  isMultithread: boolean;
  threads: number;
  /** layers requested on the GPU (0 = processor only) */
  gpuLayers: number;
  /** "offloaded N/M layers to GPU" as llama.cpp printed it while loading; null when it printed nothing */
  gpuOffloadLog: string | null;
  /** Set when the GPU was tried first and the model then loaded on the processor. */
  gpuFallbackReason?: string;
  hasChatTemplate: boolean;
  supportsImage: boolean;
  supportsAudio: boolean;
  nCtx: number;
  loadMs: number;
}

export interface InferenceParams {
  nThreads: number;
  nContext: number;
  nBatch: number;
  temperature: number;
  nPredict: number;
  systemPrompt: string;
  useGpu: boolean;
}

export interface MediaData {
  type: 'image';
  data: ArrayBuffer;
  mimeType: string;
  name?: string;
}

/** Everything the receipt under an answer shows. Every field is measured, never estimated. */
export interface GenerationStats {
  modelName: string;
  /** "this device" for the in-browser engine; a host name only if the text was sent to a remote endpoint. */
  ranOn: string;
  tokensIn: number | null;
  tokensOut: number | null;
  /** decode speed, tokens per second */
  decodeTokS: number | null;
  /** prompt-processing speed, tokens per second */
  prefillTokS: number | null;
  /** where decodeTokS came from: llama.cpp's own timings, or this page's clock */
  speedSource: 'engine' | 'wall-clock' | null;
  ttftMs: number | null;
  totalMs: number;
  /** http(s) requests this page made between send and done; null when the browser cannot count them */
  networkRequests: number | null;
  networkHosts: string[];
  threads: number;
  gpu: boolean;
  stopped: boolean;
  finishReason: string | null;
  /** older turns left out so the prompt fits the context window */
  droppedTurns?: number;
  /** remote answers only: bytes of request body that left the device */
  bytesSent?: number;
}

export interface SkillRunRecord {
  skillId: string;
  status: 'running' | 'done' | 'failed';
  /** the parsed JSON (partial while streaming) */
  object?: unknown;
  rawText: string;
  /** 'grammar' = the engine constrained decoding to the schema; 'fallback' = prompt, extract, repair and retry */
  path: 'grammar' | 'fallback' | null;
  attempts: number;
  valid: boolean | null;
  /** exactly what failed, one line per problem */
  issues: string[];
  /** why the grammar path was abandoned, if it was */
  grammarError?: string;
  /** the app dropped data that must live in memory only before this record was written to storage */
  memoryOnlyDropped?: boolean;
}

export interface Message {
  id: number;
  content: string;
  role: 'user' | 'assistant';
  mediaData?: MediaData;
  /** thinking tokens, when the stream carried them */
  reasoning?: string;
  /** the answer is still streaming */
  pending?: boolean;
  receipt?: GenerationStats;
  skillRun?: SkillRunRecord;
  /** which skill this user message was sent through */
  skillId?: string;
  /** skill-specific input captured with the user message (e.g. how many synthetic claims) */
  skillInput?: Record<string, unknown>;
  /** the text was not saved (it went to a skill that handles personal data): `content` is a placeholder since a reload */
  textNotSaved?: boolean;
  error?: string;
}

export interface Conversation {
  id: number;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
