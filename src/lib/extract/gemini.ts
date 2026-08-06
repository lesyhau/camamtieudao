// Minimal Generative Language API client.
//
// Raw fetch rather than an SDK on purpose: this needs exactly one endpoint with one shape, and
// the standalone Docker image ships only the dependencies actually reached. An SDK here would
// be several megabytes and a version treadmill for a 40-line POST.

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** Override for a proxy or a regional endpoint. Defaults to the public API. */
  baseUrl?: string;
}

export interface ImagePart {
  mimeType: string;
  /** base64, without a data: prefix. */
  data: string;
}

export interface GenerateOptions {
  system: string;
  /** Alternating text and images, in the order the model should see them. */
  parts: Array<string | ImagePart>;
  /** 0 for transcription. This is a reading task; sampling invents notes. */
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  /** Called with each incremental text fragment as it arrives. */
  onChunk?: (text: string) => void;
}

export interface GenerateResult {
  text: string;
  usage: { input: number; output: number; total: number };
  finishReason: string;
}

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Node's fetch aborts if response headers take longer than 300s, and a pro model reasoning
 * over a dense sheet spends minutes THINKING before it emits anything - headers included. The
 * failure is `UND_ERR_HEADERS_TIMEOUT`, which names nothing about the model or the sheet.
 *
 * Streaming does NOT rescue this: the delay is before the first byte, not during the body.
 * So both timeouts are disabled and the caller's AbortSignal becomes the only deadline -
 * which is the right place for it, since only the caller knows how long a user will wait.
 *
 * This uses undici's OWN fetch rather than the global one. Node embeds a different undici
 * version internally, and handing the global fetch an Agent from the installed package fails
 * with `invalid onRequestStart method` - the two disagree about the handler protocol. Matching
 * the client to its dispatcher is the only stable combination.
 */
type UndiciModule = typeof import("undici");
let undiciMod: UndiciModule | undefined;
let dispatcher: InstanceType<UndiciModule["Agent"]> | undefined;

async function longRunning(): Promise<{ fetch: UndiciModule["fetch"]; dispatcher: NonNullable<typeof dispatcher> }> {
  if (!undiciMod) undiciMod = await import("undici");
  if (!dispatcher) {
    dispatcher = new undiciMod.Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 30_000 });
  }
  return { fetch: undiciMod.fetch, dispatcher };
}

export class GeminiError extends Error {
  readonly status: number;
  readonly detail: string;
  constructor(status: number, detail: string) {
    super(`Gemini API ${status}: ${detail}`);
    this.name = "GeminiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Always streams, even where the caller only wants the finished text: it costs nothing and it
 * is what lets `onChunk` report progress on a call that runs for minutes. The header timeout
 * is handled by the dispatcher above, not by streaming.
 */
export async function generate(cfg: GeminiConfig, opts: GenerateOptions): Promise<GenerateResult> {
  const base = cfg.baseUrl?.replace(/\/+$/, "") || DEFAULT_BASE;
  const url = `${base}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{
      role: "user",
      parts: opts.parts.map((p) =>
        typeof p === "string" ? { text: p } : { inlineData: { mimeType: p.mimeType, data: p.data } },
      ),
    }],
    generationConfig: {
      temperature: opts.temperature ?? 0,
      maxOutputTokens: opts.maxOutputTokens ?? 65536,
    },
  };

  const http = await longRunning();
  const res = await http.fetch(url, {
    method: "POST",
    // The key goes in a header, not the query string: query strings end up in proxy logs and
    // in the URL of any error this throws.
    headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify(body),
    signal: opts.signal,
    dispatcher: http.dispatcher,
  });

  if (!res.ok || !res.body) {
    const raw = await res.text();
    let detail = raw.slice(0, 500);
    try { detail = JSON.parse(raw).error?.message ?? detail; } catch { /* keep the raw body */ }
    throw new GeminiError(res.status, detail);
  }

  interface Chunk {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  }

  let text = "";
  let finishReason = "";
  let blocked: string | undefined;
  const usage = { input: 0, output: 0, total: 0 };
  let sawCandidate = false;

  for await (const evt of sseEvents(res.body as unknown as ByteStream, opts.signal)) {
    let c: Chunk;
    try { c = JSON.parse(evt) as Chunk; } catch { continue; }
    if (c.promptFeedback?.blockReason) blocked = c.promptFeedback.blockReason;
    const cand = c.candidates?.[0];
    if (cand) {
      sawCandidate = true;
      // Reasoning models emit thought parts with no `text`; taking only text parts is what
      // leaves the answer behind.
      const piece = (cand.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (piece) { text += piece; opts.onChunk?.(piece); }
      if (cand.finishReason) finishReason = cand.finishReason;
    }
    // Usage is cumulative per chunk, so the last one that carries it wins.
    if (c.usageMetadata) {
      usage.input = c.usageMetadata.promptTokenCount ?? usage.input;
      usage.output = c.usageMetadata.candidatesTokenCount ?? usage.output;
      usage.total = c.usageMetadata.totalTokenCount ?? usage.total;
    }
  }

  if (!sawCandidate) {
    throw new GeminiError(200, blocked ? `no candidate, blocked: ${blocked}` : "no candidate in response");
  }
  // A MAX_TOKENS finish is surfaced rather than silently truncated: a half sheet parses
  // perfectly and would otherwise look like a model that skipped the last ten systems.
  return { text, finishReason: finishReason || "UNKNOWN", usage };
}

/**
 * The minimal shape of a byte stream. Declared structurally rather than as a
 * `ReadableStream<Uint8Array>` because undici's stream types and the DOM's disagree on
 * variance, and naming either one drags this file into that argument for no benefit.
 */
interface ByteStream {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
}

/** Yields the payload of each `data:` event in an SSE stream. */
async function* sseEvents(body: ByteStream, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      // The API sends CRLF, so the event separator on the wire is \r\n\r\n. Normalizing on
      // arrival means the separator search below is looking for the one thing it can find -
      // matching only "\n\n" silently yielded no events at all and read as "no candidate".
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      // Events are separated by a blank line; a single event may span several reads.
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const data = block
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("");
        if (data && data !== "[DONE]") yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Reads the model configuration from the environment. There is deliberately no settings UI. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): GeminiConfig {
  const apiKey = env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is not set");
  return {
    apiKey,
    model: env.LLM_MODEL || "gemini-3.1-pro-preview",
    baseUrl: env.LLM_BASE_URL || undefined,
  };
}
