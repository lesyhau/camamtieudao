// The polish step: repeats collapsed and verses merged in code, sentences and section names
// from a cheap model.
//
// The model is OPTIONAL. No key, an error, a timeout, an unparseable answer - each falls back
// to phrasing on the sheet's own printed lines, which still carries the collapsing and the
// verse merge, i.e. most of the readability. A convenience feature must not be able to take
// the conversion down.
import { generate, type GeminiConfig } from "../extract/gemini.ts";
import type { CamAmDoc } from "../camam/types.ts";
import type { Polished, PolishedSection } from "./types.ts";
import { SYSTEM, parseSections } from "./prompt.ts";
import { compose, composeByLine, sungText, units, type Composed } from "./compose.ts";
import { tokenOf } from "./token.ts";

export type { Polished, PolishedLine, PolishedSection } from "./types.ts";

/**
 * Flash-class by default, and `-lite` specifically.
 *
 * Measured on the reference song: `gemini-3.5-flash` spent its whole output budget thinking
 * and returned nothing usable (finish=MAX_TOKENS after 324 tokens, 29s); `gemini-3.5-flash-lite`
 * answered in 5.6s. This is a text-shaping job over a few hundred words - the reasoning models
 * have nothing to reason about here, and pay for the privilege.
 */
export function polishConfigFromEnv(): GeminiConfig | null {
  const apiKey = process.env.POLISH_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.POLISH_MODEL || "gemini-3.5-flash-lite",
    baseUrl: process.env.POLISH_BASE_URL || process.env.LLM_BASE_URL || undefined,
  };
}

/** Milliseconds before the phrasing is abandoned and the sheet's own lines are used. */
const TIMEOUT_MS = Number(process.env.POLISH_TIMEOUT_MS ?? 45_000);

export async function polish(doc: CamAmDoc, cfg = polishConfigFromEnv()): Promise<Polished | null> {
  if (!doc.notes.length) return null;

  const us = units(doc);
  const words = sungText(us);
  const fallback = (model: string): Polished | null => {
    const composed = composeByLine(us);
    return composed.length ? { sections: composed.map(toSection), model } : null;
  };

  // Nothing to phrase: a purely instrumental sheet has no sentences to find.
  if (!cfg || !words.trim()) return fallback("local");

  try {
    const res = await generate(cfg, {
      system: SYSTEM,
      parts: [words],
      // Sentence boundaries are a judgement but not a creative one, and sampling here shows up
      // as the same song split differently on two runs.
      temperature: 0,
      maxOutputTokens: 8192,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const sections = parseSections(res.text);
    if (!sections.length) {
      console.warn("[polish] no sections in model output; using the sheet's own lines");
      return fallback("local");
    }
    const composed = compose(us, sections);
    // A model that answered with something unrelated aligns almost nothing back onto the song.
    const matched = composed.reduce((n, s) => n + s.phrases.reduce((m, p) => m + p.notes.length, 0), 0);
    if (matched < doc.notes.length * 0.5) {
      console.warn(`[polish] only ${matched}/${doc.notes.length} notes aligned; using the sheet's own lines`);
      return fallback("local");
    }
    return { sections: composed.map(toSection), model: cfg.model };
  } catch (e) {
    console.warn("[polish] failed:", e instanceof Error ? e.message : e);
    return fallback("local");
  }
}

const toSection = (c: Composed): PolishedSection => ({
  title: c.title,
  lines: c.phrases.map((p) => ({ tokens: p.notes.map(tokenOf), lyric: p.lyric })),
});
