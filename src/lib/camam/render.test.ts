import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJpx } from "./jpx.ts";
import { build } from "./build.ts";
import { renderCamAm, recommendedMapping, summarize } from "./render.ts";

const doc = build(parseJpx(
  "#title T\n#key 1=C\n#meter 4/4\n#verses 2\nL1: 1[a|x] 2 ( 3 4 )[b|y] | 0 5 |",
), "t");

test("the recommended mapping is the one using fewest octave bands", () => {
  const id = recommendedMapping(doc);
  const used = doc.mappings[id].bandsUsed;
  for (const m of Object.values(doc.mappings)) assert.ok(used <= m.bandsUsed);
});

test("no mode pads syllables into columns", () => {
  // Chat clients use proportional fonts. Space-aligned columns collapse there, and the result
  // is worse than no alignment because it still looks deliberate.
  for (const lyrics of ["none", "inline", "below"] as const) {
    const out = renderCamAm(doc, { lyrics, header: false });
    assert.doesNotMatch(out, /   +/, `${lyrics} mode emitted padding`);
  }
});

test("inline mode binds each syllable to its note with parentheses", () => {
  const out = renderCamAm(doc, { lyrics: "inline", header: false, verse: 1 });
  assert.match(out, /\(a\)/);
  assert.match(out, /\(b\)/);
  // The melisma's second note carries no syllable of its own.
  assert.equal((out.match(/\(b\)/g) ?? []).length, 1);
});

test("verse selection picks the right lyric line", () => {
  assert.match(renderCamAm(doc, { lyrics: "inline", header: false, verse: 2 }), /\(x\)/);
  assert.doesNotMatch(renderCamAm(doc, { lyrics: "inline", header: false, verse: 2 }), /\(a\)/);
});

test("a rest prints as a dash rather than vanishing", () => {
  // The gap is part of how the line reads; dropping it silently shortens the phrase.
  assert.match(renderCamAm(doc, { header: false }), /\| - /);
});

test("barlines can be turned off", () => {
  assert.doesNotMatch(renderCamAm(doc, { header: false, barlines: false }), /\|/);
});

test("the header carries title, key, meter and which mapping is shown", () => {
  const out = renderCamAm(doc);
  assert.match(out, /^T$/m);
  assert.match(out, /1=C/);
  assert.match(out, /4\/4/);
  assert.match(out, /Cảm âm \(/);
});

test("the summary counts what was read", () => {
  const s = summarize(doc);
  assert.match(s, /6 nốt/);
  assert.match(s, /2 ô nhịp/);
  assert.match(s, /2 lời/);
});
