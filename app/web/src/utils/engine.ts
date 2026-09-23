// One streamed chat completion through wllama, measured. Everything the receipt shows is read here:
//  - tokens in/out from the engine's `usage` (or llama.cpp's `timings` when usage is absent);
//  - decode and prompt speed from llama.cpp's own `timings` (requested with `timings_per_token`), and a wall-clock
//    decode rate from this page's clock when the engine reported none (the receipt then says "wall clock");
//  - time to first token from this page's clock (send -> first streamed piece, thinking included);
//  - network requests made by this page between send and done (PerformanceObserver 'resource', see network-meter.ts).
import type {
  ChatCompletionChunk,
  ChatCompletionChunkDelta,
  ChatCompletionMessage,
  ChatCompletionParams,
  Wllama,
} from '@wllama/wllama';
import { startNetworkMeter } from './network-meter';
import {
  THOUGHT_REGEX_CLOSE,
  THOUGHT_REGEX_OPEN,
  stripThoughtTags,
} from '../lib/anythingllm/thought-tags';

export interface StreamRequest {
  messages: ChatCompletionMessage[];
  maxTokens: number;
  temperature: number;
  responseFormat?: ChatCompletionParams['response_format'];
  chatTemplateKwargs?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface StreamCallbacks {
  /** called at most once per animation frame with the whole text so far */
  onText?(answer: string, reasoning: string): void;
  onPromptProgress?(processed: number, total: number): void;
}

export interface StreamOutcome {
  answer: string;
  reasoning: string;
  /** the answer text exactly as streamed (think tags included), for skills that parse JSON */
  raw: string;
  tokensIn: number | null;
  tokensOut: number | null;
  decodeTokS: number | null;
  prefillTokS: number | null;
  speedSource: 'engine' | 'wall-clock' | null;
  ttftMs: number | null;
  totalMs: number;
  finishReason: string | null;
  stopped: boolean;
  networkRequests: number | null;
  networkHosts: string[];
}

/**
 * Split `<think>…</think>` out of streamed text, for models whose template is not parsed into `reasoning_content`.
 * An opening tag with no closing tag yet means the model is still thinking: everything after it is reasoning.
 */
export function splitThoughts(text: string): { answer: string; reasoning: string } {
  const open = text.match(THOUGHT_REGEX_OPEN);
  if (!open || open.index === undefined) {
    // Some templates put the opening tag in the prompt, so the output starts inside the thought and only the
    // closing tag is ever streamed.
    const close = text.match(THOUGHT_REGEX_CLOSE);
    if (close && close.index !== undefined && /^\s*<\/think/i.test(close[0])) {
      return { reasoning: text.slice(0, close.index).trim(), answer: text.slice(close.index + close[0].length).trimStart() };
    }
    return { answer: text, reasoning: '' };
  }
  const afterOpen = text.slice(open.index + open[0].length);
  const close = afterOpen.match(THOUGHT_REGEX_CLOSE);
  if (!close || close.index === undefined) {
    return { answer: text.slice(0, open.index), reasoning: stripThoughtTags(afterOpen).trim() };
  }
  const reasoning = afterOpen.slice(0, close.index).trim();
  const answer = (text.slice(0, open.index) + afterOpen.slice(close.index + close[0].length)).trimStart();
  return { answer, reasoning };
}

const positive = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;

export async function streamChat(
  wllama: Wllama,
  req: StreamRequest,
  cb: StreamCallbacks = {}
): Promise<StreamOutcome> {
  const meter = startNetworkMeter();
  const t0 = performance.now();
  let tFirst = 0;
  let tLast = 0;
  let pieces = 0;
  let raw = '';
  let reasoningDelta = '';
  let finishReason: string | null = null;
  let usage: ChatCompletionChunk['usage'] = null;
  let timings: ChatCompletionChunk['timings'] | undefined;
  let stopped = false;
  let frame = 0;

  const emit = () => {
    frame = 0;
    if (!cb.onText) return;
    if (reasoningDelta) cb.onText(raw, reasoningDelta);
    else {
      const s = splitThoughts(raw);
      cb.onText(s.answer, s.reasoning);
    }
  };
  const schedule = () => {
    if (frame || !cb.onText) return;
    frame = requestAnimationFrame(emit);
  };

  try {
    const params: ChatCompletionParams & { stream: true } = {
      messages: req.messages,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: true,
      timings_per_token: true,
      return_progress: true,
      abortSignal: req.signal,
    };
    if (req.responseFormat) params.response_format = req.responseFormat;
    if (req.chatTemplateKwargs) params.chat_template_kwargs = req.chatTemplateKwargs;
    const stream = await wllama.createChatCompletion(params);
    for await (const chunk of stream) {
      if (chunk.prompt_progress) {
        cb.onPromptProgress?.(chunk.prompt_progress.processed, chunk.prompt_progress.total);
      }
      const choice = chunk.choices?.[0];
      const delta = choice?.delta as (ChatCompletionChunkDelta & { reasoning_content?: string | null }) | undefined;
      const piece = delta?.content ?? '';
      const thought = delta?.reasoning_content ?? '';
      if (piece || thought) {
        const now = performance.now();
        if (!tFirst) tFirst = now;
        tLast = now;
        pieces++;
        raw += piece;
        reasoningDelta += thought;
        schedule();
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
      if (chunk.timings) timings = chunk.timings;
    }
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'AbortError' || req.signal?.aborted) {
      stopped = true;
    } else {
      meter.stop();
      if (frame) cancelAnimationFrame(frame);
      throw e;
    }
  }
  if (frame) cancelAnimationFrame(frame);
  const tEnd = performance.now();
  const net = meter.stop();

  const split = reasoningDelta ? { answer: raw, reasoning: reasoningDelta } : splitThoughts(raw);
  cb.onText?.(split.answer, split.reasoning.trim());

  // With timings_per_token every chunk carries llama.cpp's running totals, so the last one seen is valid even after Stop.
  const engineDecode = positive(timings?.predicted_per_second);
  // wall clock: tokens after the first one, over the time between the first and the last piece
  const wallDecode = pieces > 1 && tLast > tFirst ? (pieces - 1) / ((tLast - tFirst) / 1000) : null;
  const tokensIn =
    positive(usage?.prompt_tokens) ??
    (timings ? positive((timings.prompt_n ?? 0) + (timings.cache_n ?? 0)) : null);
  const tokensOut = positive(usage?.completion_tokens) ?? positive(timings?.predicted_n) ?? (pieces || null);

  return {
    answer: split.answer,
    reasoning: split.reasoning.trim(),
    raw,
    tokensIn,
    tokensOut,
    decodeTokS: engineDecode ?? wallDecode,
    prefillTokS: positive(timings?.prompt_per_second),
    speedSource: engineDecode ? 'engine' : wallDecode ? 'wall-clock' : null,
    ttftMs: tFirst ? tFirst - t0 : null,
    totalMs: tEnd - t0,
    finishReason: stopped ? 'stopped' : finishReason,
    stopped,
    networkRequests: net.count,
    networkHosts: net.hosts,
  };
}
