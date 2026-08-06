// RecognizedScore (jpeditor's local musicpp OMR) -> RawScore.
//
// Deliberately skips MusicXML. jpeditor routes its OMR output through MusicXML because it is
// feeding a score editor, but that round trip drops nothing we need and adds a format that
// cannot express half of what we do want. Cam am needs digit, octave, beams, dots, dashes and
// lyrics - all of which RecognizedScore already carries, in the same shape RawScore wants.
import type { RawNote, RawMeasure, RawScore } from "../camam/jpwabc.ts";

/** The subset of jpeditor's RecognizedScore this consumes. */
export interface RecognizedNum {
  digit: number;
  octave: number;
  dot: number;
  div: number;
  augment: number;
  x: number;
  lyrics?: string[] | null;
  sectionMark?: string | null;
  slurStart?: boolean;
  slurStop?: boolean;
  tieStart?: boolean;
  tieStop?: boolean;
}

export interface RecognizedRow {
  barlineXs: number[];
  nums: RecognizedNum[];
}

export interface RecognizedScore {
  fifths: number;
  beats: number;
  beatType: number;
  title?: string;
  credits?: string[];
  rows: RecognizedRow[];
}

/** fifths -> the tonic name jianpu prints after `1=`. Inverse of jpwabc.ts's FIFTHS table. */
const TONIC_BY_FIFTHS: Record<number, string> = {
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
  [-1]: "F", [-2]: "bB", [-3]: "bE", [-4]: "bA", [-5]: "bD", [-6]: "bG", [-7]: "bC",
};

export function fromRecognized(rec: RecognizedScore): RawScore {
  const notes: RawNote[] = [];
  const measures: RawMeasure[] = [];
  const lines: RawScore["lines"] = [];

  let measureIdx = 0;

  // Measures are NOT created while walking; only `measureIdx` advances, and the measure list is
  // derived from the indices notes actually landed in. Creating them inline meant a row that
  // ended on a barline pushed the next measure, and the following row pushed it again - 65
  // measures where the sheet has 51.
  rec.rows.forEach((row, lineIdx) => {
    lines.push({ index: lineIdx, pageBreak: false });
    if (!row.nums.length) return;

    let bi = 0;
    for (const n of row.nums) {
      // Advance past every barline this note sits to the right of.
      while (bi < row.barlineXs.length && n.x > row.barlineXs[bi]) { bi++; measureIdx++; }
      notes.push({
        digit: n.digit,
        octave: n.digit === 0 ? 0 : n.octave,
        accidental: null, // the local pipeline detects no accidentals at all
        underscores: n.div,
        dots: n.dot > 0 ? 1 : 0,
        dashes: n.augment,
        line: lineIdx,
        measure: measureIdx,
        group: 0, // assigned below, from the slur/tie flags
        tie: n.tieStart ? "start" : n.tieStop ? "stop" : null,
        slur: n.slurStart ? "start" : n.slurStop ? "stop" : null,
      });
    }

    // A row whose last note has no barline after it runs into the next row: the sheet prints no
    // barline at a system break, so closing the measure there would split a real one in two.
    // Same rule as jpeditor's own toMusicXml.
    const lastX = row.nums[row.nums.length - 1].x;
    if (row.barlineXs.some((x) => x >= lastX)) measureIdx++;
  });

  // Derive the measure list from where notes actually landed, so an index can neither be
  // created twice nor left empty.
  for (const idx of [...new Set(notes.map((n) => n.measure))].sort((a, b) => a - b)) {
    measures.push(newMeasure(idx, notes.find((n) => n.measure === idx)!.line));
  }

  assignGroups(rec, notes);

  const verses = collectVerses(rec, notes.length);

  return {
    title: (rec.title ?? "").replace(/[\r\n]+/g, ""),
    keyText: `1=${TONIC_BY_FIFTHS[rec.fifths] ?? "C"}`,
    tonic: TONIC_BY_FIFTHS[rec.fifths] ?? "C",
    beats: rec.beats,
    beatType: rec.beatType,
    authors: rec.credits ?? [],
    notes,
    measures,
    lines,
    verses,
  };
}

const newMeasure = (index: number, line: number): RawMeasure => ({
  index, line, barline: "|", repeatStart: false, repeatEnd: false, ending: null,
});

/**
 * Turn the per-note slur/tie flags into groups. A note may close one arc and open the next, so
 * a stop is applied before a start. Anything outside an arc is its own single-note group,
 * which is what makes one syllable per group hold for unslurred notes too.
 */
function assignGroups(rec: RecognizedScore, notes: RawNote[]): void {
  const flat = rec.rows.flatMap((r) => r.nums);
  let next = 1;
  let open: number | null = null;
  for (let i = 0; i < notes.length; i++) {
    const n = flat[i];
    if (open === null && (n?.slurStart || n?.tieStart)) { open = next++; }
    notes[i].group = open ?? next++;
    if (open !== null && (n?.slurStop || n?.tieStop)) open = null;
  }
}

/** JpNum.lyrics is indexed by verse; RawScore wants one slot per note per verse. */
function collectVerses(rec: RecognizedScore, noteCount: number): RawScore["verses"] {
  const flat = rec.rows.flatMap((r) => r.nums);
  const maxVerse = flat.reduce((m, n) => Math.max(m, n.lyrics?.length ?? 0), 0);
  const out: RawScore["verses"] = [];
  for (let v = 0; v < maxVerse; v++) {
    const slots = new Array<string>(noteCount).fill("");
    let any = false;
    for (let i = 0; i < noteCount; i++) {
      const t = flat[i]?.lyrics?.[v] ?? "";
      if (t) { slots[i] = t; any = true; }
    }
    if (any) out.push({ verse: v + 1, measure: 1, noteIndex: 1, slots });
  }
  return out;
}
