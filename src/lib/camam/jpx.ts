// JPX - the format the vision model emits, and the only thing it is ever asked for.
//
// It is the jianpu note grammar (shared via notation.ts) with lyrics inlined per note:
//
//     #title    叹云兮
//     #key      1=D
//     #meter    4/4
//     #verses   2
//     L1: 0 3_ 5__ ( 6__ | 6 ) 5_ 3__ ...
//     L2: |: 1_[个|们] 7,__[世|命] ( 1__ 1_ )[界|运] ...
//
// Why inline lyrics rather than separate lyric lines: a model writing a syllable at the moment
// it reads it cannot desynchronise. Every format that carries lyrics on their own line -
// `.Words` included - makes alignment a counting exercise the model performs silently and gets
// wrong somewhere in the middle of a 400-note sheet, with nothing in the output to show it.
//
// Why not ask for the JSON directly: a page is ~400 notes, and long structured output is where
// models drift. JPX is roughly a quarter of the tokens and every line is independently
// checkable, so a bad line can be identified and re-asked rather than failing the sheet.
import type { RawMeasure, RawNote, RawScore } from "./jpwabc.ts";
import { fifthsOf } from "./jpwabc.ts";
import { CREDIT_ROLES } from "./build.ts";
import type { CamAmDoc } from "./types.ts";
import { readNote, writeNote } from "./notation.ts";

/** Raised when a line cannot be read. Carries the line so a repair prompt can quote it back. */
export class JpxError extends Error {
  // Explicit fields, not constructor parameter properties: `src/lib/camam/` runs under Node's
  // strip-only type removal, which cannot erase a parameter property (it would have to emit
  // an assignment). tsconfig's erasableSyntaxOnly enforces this at build time.
  readonly line: string;
  readonly lineNo: number;
  constructor(message: string, line: string, lineNo: number) {
    super(`${message} (line ${lineNo}: ${JSON.stringify(line)})`);
    this.name = "JpxError";
    this.line = line;
    this.lineNo = lineNo;
  }
}

const HEADER_RE = /^#(\w+)\s+(.*)$/;
const STAFF_RE = /^L(\d+):\s*(.*)$/;

export function parseJpx(text: string): RawScore {
  const out: RawScore = {
    title: "", keyText: "", tonic: "C", beats: 4, beatType: 4,
    authors: [], notes: [], measures: [], lines: [], verses: [],
  };
  // Lyrics arrive attached to their note, so they are collected here and converted into the
  // measure/noteIndex-addressed `verses` shape only at the end - RawScore is shared with the
  // .jpwabc reader and must look the same whichever produced it.
  const inline: Array<{ noteIdx: number; verse: number; text: string }> = [];
  let verseCount = 1;

  let lineIdx = -1;
  let measureIdx = 0;
  let depth = 0;
  let groupId = 0;
  let openedGroupAt = -1;
  let pendingRepeatStart = false;
  let pendingEnding: number | null = null;
  let started = false;

  const startMeasure = (): void => {
    out.measures.push({
      index: measureIdx, line: Math.max(0, lineIdx), barline: "|",
      repeatStart: pendingRepeatStart, repeatEnd: false, ending: pendingEnding,
    });
    pendingRepeatStart = false;
    pendingEnding = null;
  };
  const closeMeasure = (barline: string): void => {
    const m = out.measures[out.measures.length - 1];
    m.barline = barline;
    m.repeatEnd = barline === ":|";
    measureIdx++;
    startMeasure();
  };
  /**
   * A volta is written just after the barline that opens its measure - `:| [2 4 |` - so by the
   * time the token is read, closeMeasure has already created that measure. Setting it on the
   * still-empty current measure is therefore the common case; `pendingEnding` only covers a
   * volta written before any barline at all.
   */
  const setEnding = (n: number): void => {
    const cur = out.measures[out.measures.length - 1];
    if (cur && !out.notes.some((x) => x.measure === cur.index)) cur.ending = n;
    else pendingEnding = n;
  };

  const raw = text.split(/\r?\n/);
  for (let ln = 0; ln < raw.length; ln++) {
    const src = raw[ln].trim();
    if (!src || src.startsWith("//")) continue;

    const h = HEADER_RE.exec(src);
    if (h) {
      const [, key, value] = h;
      const v = value.trim();
      switch (key) {
        case "title": out.title = v; break;
        case "subtitle": case "performer": break; // carried on the doc, not the RawScore
        case "key": {
          out.keyText = v;
          const m = /^1\s*=\s*(.+)$/.exec(v);
          out.tonic = m ? m[1].trim() : v;
          break;
        }
        case "meter": {
          const m = /^(\d+)\s*\/\s*(\d+)$/.exec(v);
          if (!m) throw new JpxError("#meter must look like 4/4", src, ln + 1);
          out.beats = Number(m[1]); out.beatType = Number(m[2]);
          break;
        }
        case "tempo": break;
        case "verses": verseCount = Math.max(1, Number(v) || 1); break;
        // JPX writes the role first (`#credit 作词 郭德紫毅`) because it is a structured field
        // and that is easier for a model to get right. Sheets and .jpwabc print it last.
        // Normalize here so build() keeps a single credit parser.
        case "credit": {
          const parts = v.replace(/\s+/g, " ").split(" ");
          const role = CREDIT_ROLES.find((r) => r === parts[0]);
          out.authors.push(role && parts.length > 1 ? `${parts.slice(1).join(" ")} ${role}` : v);
          break;
        }
        default: break; // unknown headers are ignored, not fatal
      }
      continue;
    }

    const st = STAFF_RE.exec(src);
    if (!st) throw new JpxError("expected a #header or an L<n>: staff line", src, ln + 1);
    lineIdx++;
    out.lines.push({ index: lineIdx, pageBreak: false });
    if (!started) { startMeasure(); started = true; }

    let s = st[2];
    let guard = 0;
    while (s.length) {
      if (guard++ > 100_000) throw new JpxError("staff line did not terminate", src, ln + 1);
      if (/^\s/.test(s)) { s = s.slice(1); continue; }

      if (s.startsWith("|:")) { pendingRepeatStart = true; closeMeasure("|"); s = s.slice(2); continue; }
      if (s.startsWith(":|")) { closeMeasure(":|"); s = s.slice(2); continue; }
      if (s.startsWith("||")) { closeMeasure("||"); s = s.slice(2); continue; }
      if (s.startsWith("|]")) { closeMeasure("|]"); s = s.slice(2); continue; }
      if (s.startsWith("|"))  { closeMeasure("|");  s = s.slice(1); continue; }
      // A volta is a standalone token, so it is followed by whitespace or the line end. That
      // is the whole disambiguation from a lyric bracket - and a lyric can only be consumed
      // immediately after a note or a `)`, never here at token start.
      //
      // This previously used a negative lookahead for a later `]`, which any lyric anywhere
      // on the line defeated: `| [1 1_[我]` failed to parse, and the repair loop then spent
      // two model calls asking for a correction to a line that was already right.
      const volta = /^\[([12])(?=\s|$)/.exec(s);
      if (volta) { setEnding(Number(volta[1])); s = s.slice(2); continue; }

      if (s.startsWith("(")) {
        if (depth === 0) { openedGroupAt = out.notes.length; groupId++; }
        depth++; s = s.slice(1); continue;
      }
      if (s.startsWith(")")) {
        depth = Math.max(0, depth - 1);
        if (depth === 0 && openedGroupAt >= 0) {
          const span = out.notes.slice(openedGroupAt);
          if (span.length) { span[0].slur = "start"; span[span.length - 1].slur = "stop"; }
          openedGroupAt = -1;
        }
        s = s.slice(1);
        // A group may carry one lyric for the whole group: `( 6__ 6_ )[界|运]`.
        const after = readLyric(s);
        if (after && depth === 0 && out.notes.length) {
          pushGroupLyric(inline, out, out.notes.length - 1, after.parts);
          s = s.slice(after.len);
        }
        continue;
      }

      // A dash detached from its note: `6[线] - 0`. On the sheet the augmentation dash IS a
      // separate glyph printed to the right, so models write it as a separate token however
      // firmly the spec asks for one unbroken run - and the repair loop cannot talk them out
      // of something they are reading correctly. It means exactly what an attached dash means,
      // so accept it and add it to the note it follows.
      const loose = /^-+/.exec(s);
      if (loose) {
        if (!out.notes.length) throw new JpxError("a dash before any note", src, ln + 1);
        const target = out.notes.length - 1;
        out.notes[target].dashes += loose[0].length;
        s = s.slice(loose[0].length);
        // `6, -[心]` - the syllable written on the held note, but placed after the dash because
        // that is where the printed word sits. It belongs to the note the dash extends.
        const held = readLyric(s);
        if (held) {
          for (let v = 0; v < held.parts.length; v++) {
            const t = held.parts[v].trim();
            if (t) inline.push({ noteIdx: target, verse: v + 1, text: t });
          }
          verseCount = Math.max(verseCount, held.parts.length);
          s = s.slice(held.len);
        }
        continue;
      }

      const n = readNote(s);
      if (n) {
        out.notes.push({
          ...n.note,
          line: lineIdx,
          measure: measureIdx,
          group: depth > 0 ? groupId : ++groupId,
          tie: null,
          slur: null,
        });
        s = s.slice(n.len);
        const lyr = readLyric(s);
        if (lyr) {
          for (let v = 0; v < lyr.parts.length; v++) {
            const t = lyr.parts[v].trim();
            if (t) inline.push({ noteIdx: out.notes.length - 1, verse: v + 1, text: t });
          }
          verseCount = Math.max(verseCount, lyr.parts.length);
          s = s.slice(lyr.len);
        }
        continue;
      }
      throw new JpxError(`unrecognised token starting at ${JSON.stringify(s.slice(0, 12))}`, src, ln + 1);
    }
  }

  if (started) {
    const last = out.measures[out.measures.length - 1];
    if (!out.notes.some((n) => n.measure === last.index)) out.measures.pop();
  }

  // Convert inline lyrics into RawScore's measure/noteIndex-addressed verse segments, one
  // segment per verse covering the whole part, with an empty slot wherever a note is unsung.
  for (let v = 1; v <= verseCount; v++) {
    const slots = out.notes.map((_, i) => inline.find((x) => x.noteIdx === i && x.verse === v)?.text ?? "");
    if (slots.some(Boolean)) out.verses.push({ verse: v, measure: 1, noteIndex: 1, slots });
  }

  return out;
}

/** `[a]` or `[a|b]` at the head of `s`; one part per verse. */
function readLyric(s: string): { parts: string[]; len: number } | null {
  if (!s.startsWith("[")) return null;
  const end = s.indexOf("]");
  if (end < 0) return null;
  return { parts: s.slice(1, end).split("|"), len: end + 1 };
}

/** A lyric written after `)` belongs to the group's FIRST note - that is the syllable's onset,
 *  and the remaining notes of the group are its melisma. */
function pushGroupLyric(
  inline: Array<{ noteIdx: number; verse: number; text: string }>,
  out: RawScore, lastNoteIdx: number, parts: string[],
): void {
  const g = out.notes[lastNoteIdx]?.group;
  let idx = lastNoteIdx;
  for (let i = lastNoteIdx; i >= 0 && out.notes[i].group === g; i--) idx = i;
  for (let v = 0; v < parts.length; v++) {
    const t = parts[v].trim();
    if (t) inline.push({ noteIdx: idx, verse: v + 1, text: t });
  }
}

/**
 * Emit JPX from a built document. Used to turn ground truth into a golden JPX file, and to
 * prove by round-trip that the format can represent everything the sheet contains - if it
 * could not, asking a model for it would be pointless.
 */
export function writeJpx(doc: CamAmDoc): string {
  const out: string[] = [];
  if (doc.title) out.push(`#title    ${doc.title}`);
  if (doc.subtitle) out.push(`#subtitle ${doc.subtitle}`);
  if (doc.performer) out.push(`#performer ${doc.performer}`);
  if (doc.key.jianpu) out.push(`#key      ${doc.key.jianpu}`);
  out.push(`#meter    ${doc.meter.beats}/${doc.meter.beatType}`);
  if (doc.tempo) out.push(`#tempo    ${doc.tempo.bpm}`);
  for (const c of doc.credits) out.push(`#credit   ${c.role} ${c.name}`.trimEnd());
  if (doc.verseCount > 0) out.push(`#verses   ${doc.verseCount}`);
  out.push("");

  const lyricOfGroup = new Map<number, string>();
  for (const g of doc.groups) {
    const parts: string[] = [];
    for (let v = 1; v <= doc.verseCount; v++) parts.push(g.lyrics[String(v)] ?? "");
    while (parts.length && !parts[parts.length - 1]) parts.pop();
    if (parts.length) lyricOfGroup.set(g.id, `[${parts.join("|")}]`);
  }
  const groupById = new Map(doc.groups.map((g) => [g.id, g]));

  // Both of these are hoisted out of the per-line loop on purpose.
  //
  // A group legitimately spans a line break - `( 3__ |` at the end of one system and `3- )` at
  // the start of the next is how a slur crossing a system is written, and the fixture does it
  // twice. Closing the group at the end of each line silently split those into four groups
  // instead of two, which shows up as two extra syllable slots. The reader already carries
  // depth across lines; the writer has to match.
  let openGroup: number | null = null;
  let measure = -1;

  for (const line of doc.lines) {
    const notes = doc.notes.filter((n) => n.line === line.index);
    if (!notes.length && line.measures === null) continue;
    const toks: string[] = [];

    for (const n of notes) {
      // Never closes an open group: groups legitimately span barlines (`( 6__ | 6 )`).
      if (measure !== -1 && n.measure !== measure) emitBarline(toks, measure, n.measure);
      measure = n.measure;

      const g = groupById.get(n.group);
      const multi = (g?.notes.length ?? 1) > 1;
      if (multi && openGroup !== n.group) {
        if (openGroup !== null) { toks.push(")" + (lyricOfGroup.get(openGroup) ?? "")); }
        toks.push("(");
        openGroup = n.group;
      }
      toks.push(writeNote(n) + (multi ? "" : (lyricOfGroup.get(n.group) ?? "")));
      if (multi && g && n.id === g.notes[g.notes.length - 1]) {
        toks.push(")" + (lyricOfGroup.get(n.group) ?? ""));
        openGroup = null;
      }
    }
    // A trailing barline only if this line actually ended on one. A system can break
    // mid-measure (a continuation line), and emitting `|` there would invent a barline the
    // sheet does not have.
    //
    // When it DOES end on one, `measure` is advanced past it so the next line's opening note
    // does not emit the same barline a second time. That double emission - not a phantom
    // barline - is what turned 51 measures into 62.
    const nextNote = doc.notes.find((n) => n.line > line.index);
    if (!nextNote || nextNote.measure !== measure) {
      emitBarline(toks, measure, nextNote ? nextNote.measure : null);
      if (nextNote) measure = nextNote.measure;
    }
    out.push(`L${line.index + 1}: ${toks.join(" ")}`);
  }
  return out.join("\n") + "\n";

  /** One barline between two measures, carrying the repeat/volta marks of the one being entered. */
  function emitBarline(toks: string[], from: number, to: number | null): void {
    const prev = doc.measures.find((x) => x.index === from);
    const next = to === null ? undefined : doc.measures.find((x) => x.index === to);
    // A forward repeat replaces the preceding barline rather than adding to it, as in .jpwabc.
    toks.push(next?.repeatStart ? "|:" : (prev?.barline ?? "|"));
    if (next?.ending) toks.push(`[${next.ending}`);
  }
}

export type { RawMeasure, RawNote };
export { fifthsOf };
