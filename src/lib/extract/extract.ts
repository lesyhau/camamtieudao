// Image -> JPX -> RawScore. One model call, plus up to two targeted repairs.
import type { RawScore } from "../camam/jpwabc.ts";
import { parseJpx, JpxError } from "../camam/jpx.ts";
import type { GeminiConfig, ImagePart } from "./gemini.ts";
import { generate } from "./gemini.ts";
import { SYSTEM_PROMPT, userPrompt, repairPrompt } from "./prompt.ts";

export interface ExtractOptions {
  image: ImagePart;
  /** Attempts to repair a document that failed to parse. 0 disables repair. */
  maxRepairs?: number;
  signal?: AbortSignal;
  /** Called after each model round trip, for progress reporting. */
  onAttempt?: (info: { attempt: number; usage: { input: number; output: number }; ok: boolean }) => void;
}

export interface ExtractResult {
  score: RawScore;
  jpx: string;
  attempts: number;
  usage: { input: number; output: number };
  /** Parse errors that were repaired, in the order they occurred. Empty on a clean first pass. */
  repaired: string[];
}

/**
 * Models wrap output in ```fences``` no matter how firmly asked not to, and the cost of
 * tolerating it here is one regex against a whole sheet lost to a parse error.
 */
export function stripFences(text: string): string {
  const t = text.trim();
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(t);
  return (fenced ? fenced[1] : t).trim();
}

export async function extract(cfg: GeminiConfig, opts: ExtractOptions): Promise<ExtractResult> {
  const maxRepairs = opts.maxRepairs ?? 2;
  const usage = { input: 0, output: 0 };
  const repaired: string[] = [];

  let parts: Array<string | ImagePart> = [
    userPrompt({ index: 1, total: 1, firstLine: 1 }),
    opts.image,
  ];
  let lastJpx = "";

  for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
    const res = await generate(cfg, { system: SYSTEM_PROMPT, parts, signal: opts.signal });
    usage.input += res.usage.input;
    usage.output += res.usage.output;
    lastJpx = stripFences(res.text);

    // A truncated document parses perfectly - it is simply missing the end. Without this it
    // looks like a model that declined to transcribe the last few systems.
    if (res.finishReason === "MAX_TOKENS") {
      throw new Error(
        `The model hit its output limit after ${res.usage.output} tokens, so the transcription ` +
        `is incomplete. Raise maxOutputTokens or transcribe the sheet in strips.`,
      );
    }

    try {
      const score = parseJpx(lastJpx);
      opts.onAttempt?.({ attempt, usage: res.usage, ok: true });
      return { score, jpx: lastJpx, attempts: attempt, usage, repaired };
    } catch (e) {
      opts.onAttempt?.({ attempt, usage: res.usage, ok: false });
      if (!(e instanceof JpxError) || attempt > maxRepairs) throw e;
      repaired.push(e.message);
      // Hand back the model's own document plus a pointed correction. Re-asking from scratch
      // would discard every line that was already right, and tends to reproduce the same
      // misreading anyway.
      parts = [
        userPrompt({ index: 1, total: 1, firstLine: 1 }),
        opts.image,
        `You previously produced:\n\n${lastJpx}`,
        repairPrompt(e.line, e.lineNo, e.message),
      ];
    }
  }

  throw new Error(`could not parse the model output after ${maxRepairs + 1} attempts`);
}
