import { test } from "node:test";
import assert from "node:assert/strict";
import { alteration, applyCase, lengthOf, place } from "./camam.ts";

const RING = ["do", "re", "mi", "fa", "sol", "la", "si"];
const altText = (d: number) => (d === 0 ? "" : d > 0 ? "#".repeat(d) : "b".repeat(-d));

/** Degrees 1..7 at octave 0 under one anchor, name only (band/case applied elsewhere). */
function tableFor(anchorDigit: number, printed: "#" | "b" | null = null): string[] {
  return [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const { ring } = place(d - 1, anchorDigit);
    return RING[ring] + altText(alteration(ring, anchorDigit, printed));
  });
}

test("anchor 5 → do is mixolydian: si is the only altered degree", () => {
  assert.deepEqual(tableFor(5), ["fa", "sol", "la", "sib", "do", "re", "mi"]);
});

test("anchor 2 → do is dorian: mi and si are altered", () => {
  assert.deepEqual(tableFor(2), ["sib", "do", "re", "mib", "fa", "sol", "la"]);
});

test("a printed accidental composes with the modal alteration, it does not replace it", () => {
  // Degree 4 under anchor 5 is a flat 7 (sib). The sheet's #4 raises it a semitone, which
  // must cancel back to a natural si - not stack into si#.
  const { ring } = place(3, 5);
  assert.equal(alteration(ring, 5, "#"), 0);
  assert.equal(RING[ring], "si");

  // Degree 1 under anchor 5 is unaltered (fa), so a printed # genuinely sharpens it.
  const fa = place(0, 5);
  assert.equal(RING[fa.ring] + altText(alteration(fa.ring, 5, "#")), "fa#");

  // Degree 1 under anchor 2 is a flat 7; #1 cancels it.
  const si = place(0, 2);
  assert.equal(RING[si.ring] + altText(alteration(si.ring, 2, "#")), "si");
});

test("band renders as case, and the accidental follows the syllable", () => {
  assert.equal(applyCase("sib", 0), "sib");
  assert.equal(applyCase("sib", 1), "Sib");
  assert.equal(applyCase("sib", 2), "SIB");
  assert.equal(applyCase("do#", 2), "DO#");
});

test("bands past 2 fall back to UPPERCASE plus an apostrophe", () => {
  assert.equal(applyCase("sib", 3), "SIB'");
  assert.equal(applyCase("do", 4), "DO''");
});

test("octave marks move by exactly one band", () => {
  // 5 at octave 0 is do; 5' is one band up; 5, is one band down.
  assert.deepEqual(place(4, 5), { ring: 0, band: 0 });
  assert.deepEqual(place(4 + 7, 5), { ring: 0, band: 1 });
  assert.deepEqual(place(4 - 7, 5), { ring: 0, band: -1 });
});

test("length = (1/2^u)(1 + sum 2^-k) + dashes, as an exact fraction", () => {
  assert.deepEqual(lengthOf(0, 0, 0), { num: 1, den: 1, x: 1 });      // 5
  assert.deepEqual(lengthOf(1, 0, 0), { num: 1, den: 2, x: 0.5 });    // 5_
  assert.deepEqual(lengthOf(2, 0, 0), { num: 1, den: 4, x: 0.25 });   // 5__
  assert.deepEqual(lengthOf(3, 0, 0), { num: 1, den: 8, x: 0.125 });  // 5___
  assert.deepEqual(lengthOf(0, 1, 0), { num: 3, den: 2, x: 1.5 });    // 5.
  assert.deepEqual(lengthOf(1, 1, 0), { num: 3, den: 4, x: 0.75 });   // 1._
  assert.deepEqual(lengthOf(0, 2, 0), { num: 7, den: 4, x: 1.75 });   // 5..
  assert.deepEqual(lengthOf(0, 0, 2), { num: 3, den: 1, x: 3 });      // 6--
  assert.deepEqual(lengthOf(0, 0, 3), { num: 4, den: 1, x: 4 });      // 5---
});
