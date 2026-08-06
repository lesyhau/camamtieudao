// Accuracy of an extracted document against ground truth.
//
// Reported per dimension rather than as one number, because the dimensions fail independently
// and for different reasons: a model that reads every digit but drops octave dots is a very
// different problem from one that transposes lyrics by a note.
import type { CamAmDoc } from "../camam/types.ts";

export interface Dimension {
  name: string;
  got: number;
  total: number;
  accuracy: number;
  /** A few concrete disagreements, for eyeballing. */
  examples: string[];
}

/** Levenshtein over token arrays; used where a missing note must not misalign everything after it. */
function editDistance(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur.slice();
  }
  return prev[n];
}

const pct = (got: number, total: number) => (total === 0 ? 1 : got / total);

function bySequence(name: string, gt: string[], got: string[]): Dimension {
  const d = editDistance(gt, got);
  const examples: string[] = [];
  for (let i = 0; i < Math.min(gt.length, got.length) && examples.length < 5; i++) {
    if (gt[i] !== got[i]) examples.push(`#${i}: ${gt[i]} -> ${got[i]}`);
  }
  return { name, got: Math.max(0, gt.length - d), total: gt.length, accuracy: pct(Math.max(0, gt.length - d), gt.length), examples };
}

export interface Report {
  dimensions: Dimension[];
  noteCount: { expected: number; got: number };
}

export function scoreAgainst(gt: CamAmDoc, got: CamAmDoc): Report {
  const digits = (d: CamAmDoc) => d.notes.map((n) => `${n.digit}${n.octave > 0 ? "'".repeat(n.octave) : n.octave < 0 ? ",".repeat(-n.octave) : ""}`);
  const pitchOnly = (d: CamAmDoc) => d.notes.map((n) => String(n.digit));
  const rhythm = (d: CamAmDoc) => d.notes.map((n) => `${n.underscores}.${n.dots}-${n.dashes}`);
  const full = (d: CamAmDoc) => d.notes.map((n) => `${n.digit}/${n.octave}/${n.underscores}/${n.dots}/${n.dashes}`);
  const camAm = (d: CamAmDoc) => d.notes.map((n) => n.camAm.anchor2 ?? "-");
  const bars = (d: CamAmDoc) => d.measures.map((m) => m.barline);
  const lyrics = (d: CamAmDoc, v: string) =>
    d.groups.filter((g) => g.lyrics[v]).map((g) => g.lyrics[v]);

  const dims: Dimension[] = [
    bySequence("digits (pitch only)", pitchOnly(gt), pitchOnly(got)),
    bySequence("digits + octave", digits(gt), digits(got)),
    bySequence("rhythm (beams/dots/dashes)", rhythm(gt), rhythm(got)),
    bySequence("note, everything", full(gt), full(got)),
    bySequence("cam am (2 -> do)", camAm(gt), camAm(got)),
    bySequence("barlines", bars(gt), bars(got)),
    bySequence("lyrics verse 1", lyrics(gt, "1"), lyrics(got, "1")),
    bySequence("lyrics verse 2", lyrics(gt, "2"), lyrics(got, "2")),
  ];

  return { dimensions: dims, noteCount: { expected: gt.notes.length, got: got.notes.length } };
}

export function formatReport(r: Report): string {
  const rows = r.dimensions.map((d) =>
    `  ${d.name.padEnd(28)} ${(d.accuracy * 100).toFixed(1).padStart(6)}%   ${d.got}/${d.total}`,
  );
  return [
    `  notes: expected ${r.noteCount.expected}, got ${r.noteCount.got}`,
    ...rows,
  ].join("\n");
}
