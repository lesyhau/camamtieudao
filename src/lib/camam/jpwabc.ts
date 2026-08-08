// .jpwabc importer — fixture scaffolding only.
//
// The production path parses JPX, whose note grammar is identical; only the lyric
// carrier differs (JPX inlines `[...]` per note, .jpwabc uses slash-separated
// `.Words` segments with an @measure,note offset). Sharing `readNote` keeps the two
// in step, so a JPX parser is this file minus the section machinery.
import type { NoteToken } from "./notation.ts";
import { readNote } from "./notation.ts";

export interface RawNote extends NoteToken {
  line: number;
  measure: number;
  group: number;
  tie: "start" | "stop" | null;
  slur: "start" | "stop" | null;
}

export interface RawMeasure {
  index: number;
  line: number;
  barline: string;
  repeatStart: boolean;
  repeatEnd: boolean;
  ending: number | null;
}

export interface RawScore {
  title: string;
  keyText: string;
  tonic: string;
  beats: number;
  beatType: number;
  /** Metronome mark, when the source states one. `♩=69` -> 69. */
  bpm?: number;
  authors: string[];
  notes: RawNote[];
  measures: RawMeasure[];
  lines: { index: number; pageBreak: boolean }[];
  verses: { verse: number; measure: number; noteIndex: number; slots: string[] }[];
}

const FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
  F: -1, "bB": -2, "bE": -3, "bA": -4, "bD": -5, "bG": -6, "bC": -7,
  Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

export const fifthsOf = (tonic: string): number => FIFTHS[tonic] ?? 0;

function parseVoice(lines: string[], out: RawScore): void {
  let lineIdx = 0;
  let measureIdx = 0;
  let depth = 0;
  let groupId = 0;
  let openedGroupAt = -1;
  let pendingRepeatStart = false;
  let pendingEnding: number | null = null;

  const startMeasure = (): void => {
    out.measures.push({
      index: measureIdx, line: lineIdx, barline: "|",
      repeatStart: pendingRepeatStart, repeatEnd: false, ending: pendingEnding,
    });
    pendingRepeatStart = false;
    pendingEnding = null;
  };
  startMeasure();

  const closeMeasure = (barline: string): void => {
    const m = out.measures[out.measures.length - 1];
    m.barline = barline;
    m.repeatEnd = barline === ":|";
    measureIdx++;
    startMeasure();
  };

  for (const raw of lines) {
    let s = raw;
    while (s.length) {
      if (/^\s/.test(s)) { s = s.slice(1); continue; }

      if (s.startsWith("$(true,0,0,true)")) {
        out.lines.push({ index: lineIdx, pageBreak: true });
        lineIdx++; s = s.slice(16); continue;
      }
      if (s.startsWith("$(true)")) {
        out.lines.push({ index: lineIdx, pageBreak: false });
        lineIdx++; s = s.slice(7); continue;
      }
      // Articulations / tuplet brackets: recorded nowhere yet, consumed so they
      // cannot be mistaken for barlines.
      if (s.startsWith("{")) { s = s.slice(s.indexOf("}") + 1 || 1); continue; }

      if (s.startsWith("|:")) { pendingRepeatStart = true; closeMeasure("|"); s = s.slice(2); continue; }
      if (s.startsWith(":|")) { closeMeasure(":|"); s = s.slice(2); continue; }
      if (s.startsWith("[|]")) { closeMeasure("[|]"); s = s.slice(3); continue; }
      if (s.startsWith("||")) { closeMeasure("||"); s = s.slice(2); continue; }
      if (s.startsWith("|]")) { closeMeasure("|]"); s = s.slice(2); continue; }
      if (s.startsWith("|")) { closeMeasure("|"); s = s.slice(1); continue; }
      // Same as the JPX reader: the volta follows the barline that opened its measure, so
      // that measure already exists by the time this token is read.
      const volta = /^\[([12])/.exec(s);
      if (volta) {
        const cur = out.measures[out.measures.length - 1];
        if (cur && !out.notes.some((x) => x.measure === cur.index)) cur.ending = Number(volta[1]);
        else pendingEnding = Number(volta[1]);
        s = s.slice(2); continue;
      }

      if (s.startsWith("(")) {
        if (depth === 0) { openedGroupAt = out.notes.length; groupId++; }
        depth++; s = s.slice(1); continue;
      }
      if (s.startsWith(")")) {
        depth = Math.max(0, depth - 1);
        if (depth === 0 && openedGroupAt >= 0) {
          const span = out.notes.slice(openedGroupAt);
          if (span.length) {
            span[0].slur = "start";
            span[span.length - 1].slur = "stop";
          }
          openedGroupAt = -1;
        }
        s = s.slice(1); continue;
      }

      const n = readNote(s);
      if (n) {
        out.notes.push({
          ...n.note,
          line: lineIdx,
          measure: measureIdx,
          // Notes outside any bracket each form their own one-syllable group.
          group: depth > 0 ? groupId : ++groupId,
          tie: null,
          slur: null,
        });
        s = s.slice(n.len);
        continue;
      }
      s = s.slice(1); // unknown byte: skip rather than abort
    }
  }
  // Trailing empty measure created by the final barline.
  const last = out.measures[out.measures.length - 1];
  if (!out.notes.some((n) => n.measure === last.index)) out.measures.pop();
}

export function parseJpwabc(text: string): RawScore {
  const out: RawScore = {
    title: "", keyText: "", tonic: "C", beats: 4, beatType: 4,
    authors: [], notes: [], measures: [], lines: [], verses: [],
  };

  const sections = new Map<string, string[]>();
  let cur = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, "");
    if (line.startsWith("//")) continue;
    if (/^\.\w+/.test(line.trim())) { cur = line.trim(); sections.set(cur, []); continue; }
    if (cur) sections.get(cur)!.push(line);
  }

  for (const line of sections.get(".Title") ?? []) {
    const t = /^Title\s*=\s*(.*)$/.exec(line);
    if (t) out.title = t[1].trim();
    const k = /^KeyAndMeters\s*=\s*\{1=([^,]+),(\d+)\/(\d+)\}/.exec(line);
    if (k) {
      out.tonic = k[1].trim();
      out.keyText = `1=${out.tonic}`;
      out.beats = Number(k[2]);
      out.beatType = Number(k[3]);
    }
    const a = /^WordsByAndMusicBy\s*=\s*(.*)$/.exec(line);
    if (a && a[1].trim()) out.authors = a[1].split("\\n").map((x) => x.trim()).filter(Boolean);
  }

  parseVoice(sections.get(".Voice") ?? [], out);

  const words = sections.get(".Words") ?? [];
  for (let i = 0; i < words.length; i++) {
    const h = /^W(\d+)@(\d+),(\d+):\s*$/.exec(words[i].trim());
    if (!h) continue;
    out.verses.push({
      verse: Number(h[1]),
      measure: Number(h[2]),
      noteIndex: Number(h[3]),
      slots: parseWordsBody(words[i + 1] ?? ""),
    });
  }

  return out;
}

const PUNC = ".,;'!?。：，；！？“”｡､、";

/**
 * `.Words` bodies are character-addressed, not slash-delimited: every CJK character
 * (or ASCII word run) consumes exactly one note, `/` consumes a note with no lyric
 * (melisma), and trailing punctuation glues onto the preceding syllable without
 * consuming a note at all. Mirrors WordsSection.parse in jpword/jpwfile.ts.
 */
export function parseWordsBody(body: string): string[] {
  const slots: string[] = [];
  let pos = 0;
  while (pos < body.length) {
    const ch = body[pos];
    if (ch === "{") {
      const end = body.indexOf("}", pos + 1);
      if (end < 0) break;
      slots.push(body.substring(pos + 1, end));
      pos = end + 1;
      continue;
    }
    if (" -()".includes(ch)) { pos++; continue; }
    if (ch === "/") { slots.push(""); pos++; continue; }
    if (/[a-zA-Z]/.test(ch)) {
      let end = pos + 1;
      while (end < body.length && body.charCodeAt(end) < 0x7f && /[a-zA-Z]/.test(body[end])) end++;
      slots.push(body.substring(pos, end));
      pos = end + 1; // matches jpwfile.ts: the delimiter after a word run is consumed
      continue;
    }
    if (PUNC.includes(ch) && slots.length) { slots[slots.length - 1] += ch; pos++; continue; }
    slots.push(ch);
    pos++;
  }
  // An opening quote belongs to the following syllable, not the preceding one.
  for (let i = 0; i + 1 < slots.length; i++) {
    if (slots[i].endsWith("“")) {
      slots[i] = slots[i].replace(/“$/, "");
      slots[i + 1] = "“" + slots[i + 1];
    }
  }
  return slots;
}
