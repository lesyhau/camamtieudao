// RawScore -> CamAmDoc. Two-pass by construction: every note is placed before any
// name is rendered, because band normalization depends on the song's lowest note.
import type { CamAmDoc, Group, Note } from "./types.ts";
import type { RawScore } from "./jpwabc.ts";
import { fifthsOf } from "./jpwabc.ts";
import { ANCHORS, lengthOf, mapAll, pos } from "./camam.ts";

const CREDIT_RE = /^(.*?)(作词|作曲|编曲|记谱|译词|演唱)$/;

export function build(raw: RawScore, engine: string): CamAmDoc {
  const warnings: string[] = [];

  const pitches = raw.notes.map((n) => ({
    p: n.digit === 0 ? null : pos(n.digit, n.octave),
    accidental: n.accidental,
  }));

  const results = ANCHORS.map((a) => ({ anchor: a, res: mapAll(pitches, a) }));
  for (const { anchor, res } of results) {
    if (res.overflow) {
      warnings.push(
        `mapping ${anchor.id} (${anchor.label}) spans ${res.info.bandsUsed} octave bands; ` +
        `bands above 2 are rendered UPPERCASE + apostrophe`,
      );
    }
  }

  const notes: Note[] = raw.notes.map((n, i) => {
    const camAm: Record<string, string | null> = {};
    for (const { anchor, res } of results) camAm[anchor.id] = res.names[i];
    return {
      id: i,
      line: n.line,
      measure: n.measure,
      rest: n.digit === 0,
      digit: n.digit,
      octave: n.digit === 0 ? 0 : n.octave,
      p: pitches[i].p,
      accidental: n.accidental,
      underscores: n.underscores,
      dots: n.dots,
      dashes: n.dashes,
      length: lengthOf(n.underscores, n.dots, n.dashes),
      camAm,
      group: n.group,
      tie: null,
      slur: n.slur,
    };
  });

  // Group notes, then reclassify two-note same-pitch groups as ties.
  const byGroup = new Map<number, number[]>();
  for (const n of notes) {
    if (!byGroup.has(n.group)) byGroup.set(n.group, []);
    byGroup.get(n.group)!.push(n.id);
  }
  const groups: Group[] = [];
  for (const [id, ids] of [...byGroup].sort((a, b) => a[0] - b[0])) {
    if (ids.length === 2) {
      const [a, b] = ids.map((x) => notes[x]);
      if (!a.rest && a.digit === b.digit && a.octave === b.octave) {
        a.tie = "start"; b.tie = "stop";
        a.slur = null; b.slur = null;
      }
    }
    groups.push({ id, notes: ids, lyrics: {} });
  }

  assignLyrics(raw, notes, groups, warnings);

  const withPitch = notes.filter((n) => n.p !== null);
  const lowest = withPitch.reduce<Note | null>((m, n) => (!m || n.p! < m.p! ? n : m), null);
  const highest = withPitch.reduce<Note | null>((m, n) => (!m || n.p! > m.p! ? n : m), null);

  const credits = raw.authors.map((a) => {
    const m = CREDIT_RE.exec(a.replace(/\s+/g, ""));
    return m ? { role: m[2], name: m[1] } : { role: "", name: a };
  });

  const mappings: CamAmDoc["mappings"] = {};
  for (const { anchor, res } of results) mappings[anchor.id] = res.info;

  return {
    schemaVersion: 1,
    source: { engine, warnings },
    title: raw.title,
    credits,
    key: { jianpu: raw.keyText, tonic: raw.tonic, fifths: fifthsOf(raw.tonic) },
    meter: { beats: raw.beats, beatType: raw.beatType },
    baseUnit: "quarter",
    verseCount: raw.verses.length,
    pitchRange: {
      lowest: lowest ? { digit: lowest.digit, octave: lowest.octave, p: lowest.p! } : null,
      highest: highest ? { digit: highest.digit, octave: highest.octave, p: highest.p! } : null,
    },
    mappings,
    notes,
    groups,
    measures: raw.measures.map((m) => {
      const ids = notes.filter((n) => n.measure === m.index).map((n) => n.id);
      return {
        index: m.index, line: m.line,
        notes: ids.length ? ([ids[0], ids[ids.length - 1]] as [number, number]) : null,
        barline: m.barline, repeatStart: m.repeatStart, repeatEnd: m.repeatEnd, ending: m.ending,
      };
    }),
    lines: raw.lines.map((l) => {
      const ms = raw.measures.filter((m) => m.line === l.index).map((m) => m.index);
      return {
        index: l.index,
        measures: ms.length ? ([ms[0], ms[ms.length - 1]] as [number, number]) : null,
        pageBreak: l.pageBreak,
      };
    }),
  };
}

/**
 * .Words segments address their first syllable as @measure,noteIndex (both 1-based,
 * note index counted within the measure), then run one slash-separated slot per note.
 * Empty slot = melisma continuation. Lyrics attach to the note's *group*.
 */
function assignLyrics(raw: RawScore, notes: Note[], groups: Group[], warnings: string[]): void {
  const groupOf = new Map(groups.map((g) => [g.id, g]));
  for (const v of raw.verses) {
    const start = notes.findIndex(
      (n) => n.measure === v.measure - 1 && countInMeasure(notes, n) === v.noteIndex,
    );
    if (start < 0) {
      warnings.push(`verse W${v.verse}: anchor @${v.measure},${v.noteIndex} not found`);
      continue;
    }
    let i = start;
    for (const slot of v.slots) {
      if (i >= notes.length) break;
      const text = slot.trim();
      if (text) {
        const g = groupOf.get(notes[i].group)!;
        g.lyrics[String(v.verse)] = (g.lyrics[String(v.verse)] ?? "") + text;
      }
      i++;
    }
  }
}

const countInMeasure = (notes: Note[], n: Note): number =>
  notes.filter((o) => o.measure === n.measure && o.id <= n.id).length;
