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
}

export interface GenerateResult {
  text: string;
  usage: { input: number; output: number; total: number };
  finishReason: string;
}

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

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

export async function generate(cfg: GeminiConfig, opts: GenerateOptions): Promise<GenerateResult> {
  const base = cfg.baseUrl?.replace(/\/+$/, "") || DEFAULT_BASE;
  const url = `${base}/models/${encodeURIComponent(cfg.model)}:generateContent`;

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

  const res = await fetch(url, {
    method: "POST",
    // The key goes in a header, not the query string: query strings end up in proxy logs and
    // in the URL of any error this throws.
    headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 500);
    try { detail = JSON.parse(raw).error?.message ?? detail; } catch { /* keep the raw body */ }
    throw new GeminiError(res.status, detail);
  }

  let json: unknown;
  try { json = JSON.parse(raw); } catch {
    throw new GeminiError(res.status, `response was not JSON: ${raw.slice(0, 300)}`);
  }

  const c = (json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  });

  const cand = c.candidates?.[0];
  if (!cand) {
    const blocked = c.promptFeedback?.blockReason;
    throw new GeminiError(200, blocked ? `no candidate, blocked: ${blocked}` : "no candidate in response");
  }

  // Reasoning models return thought parts with no `text`; concatenating only the text parts is
  // what leaves the answer. A MAX_TOKENS finish is surfaced rather than silently truncated -
  // half a sheet parses fine and would otherwise look like a model that skipped ten systems.
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const u = c.usageMetadata ?? {};
  return {
    text,
    finishReason: cand.finishReason ?? "UNKNOWN",
    usage: {
      input: u.promptTokenCount ?? 0,
      output: u.candidatesTokenCount ?? 0,
      total: u.totalTokenCount ?? 0,
    },
  };
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
