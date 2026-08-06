// JPX has to be able to say everything the sheet says. If it cannot, asking a model for it is
// pointless - the ceiling on extraction accuracy would be the format, not the model.
//
// The load-bearing test is the lossless round trip of the ground truth. Everything else here
// pins down a specific decision that was got wrong once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJpwabc } from "./jpwabc.ts";
import { parseJpx, writeJpx, JpxError } from "./jpx.ts";
import { build } from "./build.ts";
import type { CamAmDoc } from "./types.ts";

const gt = build(
  parseJpwabc(readFileSync(new URL("../../../fixtures/tan-van-xi.jpwabc", import.meta.url), "utf8")),
  "fixture:jpwabc",
);
const jpx = writeJpx(gt);
const rt = build(parseJpx(jpx), "fixture:jpx");

const shape = (n: CamAmDoc["notes"][number]) =>
  `${n.digit}/${n.octave}/${n.underscores}/${n.dots}/${n.dashes}/${n.measure}/${n.line}/${n.camAm.anchor5}/${n.camAm.anchor2}`;

test("the ground truth round-trips through JPX without loss", () => {
  assert.equal(rt.notes.length, gt.notes.length, "note count");
  assert.equal(rt.measures.length, gt.measures.length, "measure count");
  assert.equal(rt.lines.length, gt.lines.length, "line count");
  assert.equal(rt.groups.length, gt.groups.length, "group count");
  assert.deepEqual(rt.mappings, gt.mappings, "band normalization must land identically");
  assert.deepEqual(rt.notes.map(shape), gt.notes.map(shape), "note shape / measure / line / names");
});

test("every syllable survives, on the same note", () => {
  const lyrics = (d: CamAmDoc) =>
    d.groups.filter((g) => Object.keys(g.lyrics).length).map((g) => `${g.notes[0]}:${JSON.stringify(g.lyrics)}`);
  assert.deepEqual(lyrics(rt), lyrics(gt));
});

test("JPX is compact enough to ask a model for in one piece", () => {
  // ~8 characters per note. The equivalent JSON is roughly four times this, and long
  // structured output is where models drift.
  assert.ok(jpx.length < gt.notes.length * 12, `${jpx.length} chars for ${gt.notes.length} notes`);
});

test("a group spanning a system break stays one group", () => {
  // `( 3__ |` ending a line and `3- )` opening the next is how a slur across a system is
  // written; the fixture does it twice. Closing groups at end of line split those in half and
  // produced two phantom syllable slots.
  const spanning = gt.groups.filter((g) => {
    const ls = g.notes.map((i) => gt.notes[i].line);
    return new Set(ls).size > 1;
  });
  assert.ok(spanning.length >= 2, `expected cross-line groups, found ${spanning.length}`);
  for (const g of spanning) {
    const same = rt.groups.find((h) => h.notes[0] === g.notes[0]);
    assert.deepEqual(same?.notes, g.notes);
  }
});

test("a line break does not invent a barline", () => {
  // Every line of this fixture ends on a real barline, so all 11 breaks were places where the
  // writer emitted `|` at the end of the line AND again before the first note of the next -
  // 11 phantom measures, 51 becoming 62.
  for (let L = 0; L < gt.lines.length - 1; L++) {
    const last = [...gt.notes].reverse().find((n) => n.line === L)!;
    const next = gt.notes.find((n) => n.line === L + 1)!;
    assert.notEqual(last.measure, next.measure, `fixture line ${L + 1} should end on a barline`);
  }
  assert.equal(rt.measures.length, 51);
});

test("a measure that continues past a line break stays one measure", () => {
  // The other half of the same guard, which this fixture happens not to exercise: a system
  // that breaks mid-measure (a continuation line) must not gain a barline at the break.
  const doc = build(parseJpx("#key 1=C\n#meter 4/4\nL1: 1 2\nL2: 3 4 |"), "t");
  assert.equal(doc.measures.length, 1);
  assert.deepEqual(doc.notes.map((n) => n.measure), [0, 0, 0, 0]);
  assert.deepEqual(doc.notes.map((n) => n.line), [0, 0, 1, 1]);

  const again = build(parseJpx(writeJpx(doc)), "t2");
  assert.equal(again.measures.length, 1, "and survives a round trip");
  assert.deepEqual(again.notes.map((n) => n.line), [0, 0, 1, 1]);
});

test("inline lyrics attach to the note they are written on", () => {
  const d = build(parseJpx("#key 1=C\n#meter 4/4\nL1: 1[a] 2 3[b] |"), "t");
  const at = (i: number) => d.groups.find((g) => g.notes[0] === i)?.lyrics["1"];
  assert.equal(at(0), "a");
  assert.equal(at(1), undefined);
  assert.equal(at(2), "b");
});

test("a lyric after a closing bracket belongs to the group's first note", () => {
  const d = build(parseJpx("#key 1=C\n#meter 4/4\nL1: ( 5__ 5_ )[界] 6 |"), "t");
  const g = d.groups.find((x) => x.lyrics["1"] === "界");
  assert.deepEqual(g?.notes, [0, 1], "the syllable owns both notes of the melisma");
});

test("verses are pipe-separated in reading order", () => {
  const d = build(parseJpx("#key 1=C\n#meter 4/4\n#verses 2\nL1: 1[个|们] 2[世|命] |"), "t");
  assert.equal(d.verseCount, 2);
  assert.deepEqual(d.groups[0].lyrics, { "1": "个", "2": "们" });
  assert.deepEqual(d.groups[1].lyrics, { "1": "世", "2": "命" });
});

test("a volta parses on a line that also contains lyrics", () => {
  // Regression: the volta was detected with a lookahead for a later `]`, which every lyric on
  // the line defeated. Real model output hit this on its first try.
  const d = build(parseJpx("#key 1=C\n#meter 4/4\nL1: 1[我] |: [1 2_[会] 3_[在] :| [2 4 |"), "t");
  assert.deepEqual(d.notes.map((n) => n.digit), [1, 2, 3, 4]);
  assert.ok(d.measures.some((m) => m.ending === 1), "first ending");
  assert.ok(d.measures.some((m) => m.ending === 2), "second ending");
  assert.equal(d.groups.find((g) => g.notes[0] === 1)?.lyrics["1"], "会");
});

test("a malformed line fails loudly and quotes itself back", () => {
  // The repair prompt needs the offending line verbatim to ask for it again.
  assert.throws(
    () => parseJpx("#key 1=C\n#meter 4/4\nL1: 1 2 $$$ 3 |"),
    (e: unknown) => e instanceof JpxError && e.lineNo === 3 && e.line.includes("$$$"),
  );
  assert.throws(() => parseJpx("#key 1=C\nnot a staff line"), JpxError);
});

test("unknown headers are ignored rather than fatal", () => {
  // A model inventing `#composer` should not cost us the whole sheet.
  const d = build(parseJpx("#key 1=C\n#meter 4/4\n#composer someone\nL1: 1 |"), "t");
  assert.equal(d.notes.length, 1);
});

test("a dash detached from its note still extends it", () => {
  // The sheet prints the augmentation dash as its own glyph, so models emit `6 - -` rather
  // than `6--` no matter what the spec asks for. Both must mean three beats.
  const attached = build(parseJpx("#key 1=C\n#meter 4/4\nL1: 6-- 0 |"), "t");
  const spaced = build(parseJpx("#key 1=C\n#meter 4/4\nL1: 6 - - 0 |"), "t");
  assert.deepEqual(spaced.notes.map((n) => n.dashes), attached.notes.map((n) => n.dashes));
  assert.deepEqual(spaced.notes[0].length, { num: 3, den: 1, x: 3 });
  assert.equal(spaced.notes.length, 2, "a loose dash must not become a note of its own");
});

test("a lyric survives a dash written after it", () => {
  const d = build(parseJpx("#key 1=C\n#meter 4/4\nL1: 6[线] - 0 |"), "t");
  assert.equal(d.groups.find((g) => g.notes[0] === 0)?.lyrics["1"], "线");
  assert.equal(d.notes[0].dashes, 1);
});

test("a lyric written after a loose dash belongs to the held note", () => {
  // `6, -[心]`: the printed word sits under the dash, so the model writes it there.
  const d = build(parseJpx("#key 1=C\n#meter 4/4\nL1: 6, -[心] 0 |"), "t");
  assert.equal(d.notes.length, 2);
  assert.equal(d.notes[0].dashes, 1);
  assert.equal(d.groups.find((g) => g.notes[0] === 0)?.lyrics["1"], "心");
});
