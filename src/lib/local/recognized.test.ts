// The converter's contract, pinned by the two bugs that cost real measurement time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromRecognized, type RecognizedScore } from "./recognized.ts";
import { build } from "../camam/build.ts";

const sheet = (rows: Array<{ barlineXs: number[]; xs: number[] }>): RecognizedScore => ({
  fifths: 2, beats: 4, beatType: 4, rows: rows.map((r) => ({
    barlineXs: r.barlineXs,
    nums: r.xs.map((x) => ({ digit: 1, octave: 0, dot: 0, div: 0, augment: 0, bbox: { x } })),
  })),
});

test("a row ending on a barline does not create the next measure twice", () => {
  // Creating measures while walking meant the row end pushed one and the next row pushed it
  // again: 65 measures where the sheet had 51.
  const d = build(fromRecognized(sheet([
    { barlineXs: [50], xs: [10, 20] },
    { barlineXs: [50], xs: [10, 20] },
  ])), "t");
  assert.equal(d.measures.length, 2);
  assert.deepEqual(d.notes.map((n) => n.measure), [0, 0, 1, 1]);
});

test("a measure running past a system break stays one measure", () => {
  // No barline after the last note of row 1, so row 2 continues it.
  const d = build(fromRecognized(sheet([
    { barlineXs: [], xs: [10, 20] },
    { barlineXs: [50], xs: [10, 20] },
  ])), "t");
  assert.equal(d.measures.length, 1);
  assert.deepEqual(d.notes.map((n) => n.measure), [0, 0, 0, 0]);
});

test("a note with no position is an error, not a silent single measure", () => {
  // Typing the note against the flattened JSON dump (x) rather than the real shape (bbox.x)
  // made every comparison false, collapsed the part to one measure, and surfaced only as a
  // barline score of 2%.
  const bad = sheet([{ barlineXs: [50], xs: [10] }]);
  delete (bad.rows[0].nums[0] as { bbox?: unknown }).bbox;
  assert.throws(() => fromRecognized(bad), /neither bbox\.x nor x/);
});

test("the flattened dump shape is still accepted", () => {
  const flat = sheet([{ barlineXs: [50], xs: [10, 60] }]);
  for (const n of flat.rows[0].nums) {
    (n as { x?: number }).x = n.bbox!.x;
    delete (n as { bbox?: unknown }).bbox;
  }
  assert.equal(build(fromRecognized(flat), "t").measures.length, 2);
});

test("slur and tie flags become one group per arc, singles elsewhere", () => {
  const s = sheet([{ barlineXs: [], xs: [10, 20, 30, 40] }]);
  s.rows[0].nums[1].slurStart = true;
  s.rows[0].nums[2].slurStop = true;
  const d = build(fromRecognized(s), "t");
  const sizes = d.groups.map((g) => g.notes.length).sort();
  assert.deepEqual(sizes, [1, 1, 2]);
});
