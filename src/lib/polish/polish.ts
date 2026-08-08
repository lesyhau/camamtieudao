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
import { compose, composeByLine, phraseCells, phraseNotes, sungText, units, type Composed } from "./compose.ts";
import { tokenOf } from "./token.ts";

export type { Polished, PolishedLine, PolishedSection } from "./types.ts";

/**
 * gemini-3.5-flash with thinking OFF.
 *
 * An earlier note here blamed the model for returning nothing. That was wrong, and the record
 * is worth keeping straight: the failure came from the FIRST prompt, which handed the model the
 * notes as well and asked for four jobs at once - 2368 input tokens of them. On this prompt the
 * identical model and settings finish cleanly.
 *
 * Thinking is off because it measured worse here, not merely slower. All three candidates
 * phrase the reference song identically; the difference is what they do with the leftovers:
 *
 *   flash, thinking on    9.9s   2739 thinking tokens   invents a "Thông tin thêm" section
 *   flash, thinking off   2.0s      0                   clean
 *   flash-lite            1.5s      0                   clean
 *
 * Reasoning has nothing to reason about in "put a line break where the sentence ends", and
 * given the budget it finds something else to do with it. It is not even stable: two runs at
 * temperature 0 with thinking on split the same song into 20 phrases and then 38. With it off,
 * the same run twice is the same answer twice, which is what a cache and a user both expect.
 */
export function polishConfigFromEnv(): GeminiConfig | null {
  const apiKey = process.env.POLISH_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.POLISH_MODEL || "gemini-3.5-flash",
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
      thinkingBudget: Number(process.env.POLISH_THINKING_BUDGET ?? 0),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const sections = parseSections(res.text);
    if (!sections.length) {
      console.warn("[polish] no sections in model output; using the sheet's own lines");
      return fallback("local");
    }
    const composed = compose(us, sections);
    // A model that answered with something unrelated aligns almost nothing back onto the song.
    const matched = composed.reduce((n, s) => n + s.phrases.reduce((m, p) => m + phraseNotes(p).length, 0), 0);
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
  // One cell per note. The word sits on the note it starts on; the rest of that unit's notes
  // carry an empty syllable, which is how a held word is drawn.
  lines: c.phrases
    .map((p) => ({ cells: phraseCells(p).map((c2) => ({ token: tokenOf(c2.note), syllable: c2.syllable })) }))
    // A phrase whose every note was a rest has nothing left to print.
    .filter((l) => l.cells.length),
});
