// CamAmDoc -> text a player can read.
//
// Written for a chat message first, which rules out the obvious layout. Aligning a row of
// syllables under a row of notes with spaces only works in a monospace font, and neither Zalo
// nor Messenger gives you one - the columns collapse and the result is worse than useless
// because it still LOOKS aligned. Every mode here is therefore alignment-proof: a syllable is
// bound to its note by punctuation, not by position.
import type { CamAmDoc, Note } from "./types.ts";

export type LyricMode = "none" | "inline" | "below";

export interface RenderOptions {
  /** Which anchor mapping to print. Defaults to the doc's recommendation. */
  mapping?: string;
  lyrics?: LyricMode;
  /** 1-based verse for lyric modes. */
  verse?: number;
  /** Print `|` at barlines. */
  barlines?: boolean;
  /** Include the title/key/meter header block. */
  header?: boolean;
}

/**
 * The mapping to lead with: fewest octave bands, so the song fits the three-case scheme
 * (lower / Capitalised / UPPER) without spilling into the apostrophe fallback.
 */
export function recommendedMapping(doc: CamAmDoc): string {
  const ids = Object.keys(doc.mappings);
  if (!ids.length) return "";
  return ids.reduce((best, id) =>
    doc.mappings[id].bandsUsed < doc.mappings[best].bandsUsed ? id : best, ids[0]);
}

const lyricOf = (doc: CamAmDoc, n: Note, verse: number): string | undefined => {
  const g = doc.groups.find((x) => x.id === n.group);
  // Only the group's FIRST note carries the syllable; the rest are its melisma.
  return g && g.notes[0] === n.id ? g.lyrics[String(verse)] : undefined;
};

export function renderCamAm(doc: CamAmDoc, opts: RenderOptions = {}): string {
  const mapping = opts.mapping ?? recommendedMapping(doc);
  const mode = opts.lyrics ?? "none";
  const verse = opts.verse ?? 1;
  const bars = opts.barlines ?? true;
  const out: string[] = [];

  if (opts.header ?? true) {
    if (doc.title) out.push(doc.title);
    const bits = [doc.key.jianpu, `${doc.meter.beats}/${doc.meter.beatType}`].filter(Boolean);
    if (doc.tempo) bits.push(`♩=${doc.tempo.bpm}`);
    if (bits.length) out.push(bits.join("   "));
    const label = doc.mappings[mapping]?.label;
    if (label) out.push(`Cảm âm (${label})`);
    for (const c of doc.credits) if (c.name) out.push(`${c.role}: ${c.name}`.replace(/^: /, ""));
    out.push("");
  }

  for (const line of doc.lines) {
    const notes = doc.notes.filter((n) => n.line === line.index);
    if (!notes.length) continue;

    const toks: string[] = [];
    const under: string[] = [];
    let measure = -1;

    for (const n of notes) {
      if (bars && measure !== -1 && n.measure !== measure) { toks.push("|"); under.push("|"); }
      measure = n.measure;

      // A rest is printed as a dash rather than dropped: the gap is part of how the line reads.
      const name = n.rest ? "-" : (n.camAm[mapping] ?? "?");
      const syl = mode === "none" ? undefined : lyricOf(doc, n, verse);

      if (mode === "inline" && syl) toks.push(`${name}(${syl})`);
      else toks.push(name);

      if (mode === "below") under.push(syl ?? "");
    }

    out.push(toks.join(" "));
    // `below` prints the syllables as their own line WITHOUT padding them into columns - it is
    // a reading aid for someone who already has the sheet, not a substitute for it.
    if (mode === "below" && under.some((s) => s && s !== "|")) out.push(under.filter(Boolean).join(" "));
    if (mode === "below") out.push("");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** A one-line summary for a chat reply: what was read, and how confident the shape looks. */
export function summarize(doc: CamAmDoc): string {
  const sung = doc.groups.filter((g) => Object.keys(g.lyrics).length).length;
  const bits = [
    `${doc.notes.length} nốt`,
    `${doc.measures.length} ô nhịp`,
    `${doc.lines.length} dòng`,
  ];
  if (doc.verseCount) bits.push(`${doc.verseCount} lời (${sung} âm tiết)`);
  return bits.join(" · ");
}
