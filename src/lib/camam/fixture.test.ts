// M1 acceptance: the 叹云兮 ground truth converts end to end with no image involved.
// Fixture is the .jpwabc transcription of testdata/叹云兮 (JP-Word4, 桃李醉春风 记谱).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJpwabc } from "./jpwabc.ts";
import { build } from "./build.ts";
import { ANCHORS } from "./camam.ts";

const fixture = new URL("../../../fixtures/tan-van-xi.jpwabc", import.meta.url);
const doc = build(parseJpwabc(readFileSync(fixture, "utf8")), "fixture:jpwabc");

test("header is recovered", () => {
  assert.equal(doc.title, "叹云兮");
  assert.equal(doc.key.jianpu, "1=D");
  assert.equal(doc.key.fifths, 2);
  assert.deepEqual(doc.meter, { beats: 4, beatType: 4 });
  assert.equal(doc.verseCount, 2);
});

test("structure matches the sheet", () => {
  assert.equal(doc.notes.length, 419);
  // The .Repeat section's last span is 35-51, so the part is 51 measures - an independent
  // corroboration of the barline parse.
  assert.equal(doc.measures.length, 51);
  assert.equal(doc.lines.length, 12);
});

test("no mapping emits a comma-suffixed name", () => {
  for (const a of ANCHORS) {
    const bad = doc.notes.filter((n) => n.camAm[a.id]?.includes(","));
    assert.deepEqual(bad.map((n) => n.camAm[a.id]), [], `${a.id} produced low-octave commas`);
  }
});

test("every non-rest note is named under every mapping", () => {
  for (const a of ANCHORS) {
    assert.equal(doc.notes.filter((n) => !n.rest && !n.camAm[a.id]).length, 0);
  }
  assert.equal(doc.notes.filter((n) => n.rest && n.camAm.anchor5 !== null).length, 0);
});

test("every note has an exact, positive length", () => {
  for (const n of doc.notes) {
    assert.ok(Number.isFinite(n.length.x) && n.length.x > 0, `note ${n.id} length`);
    assert.equal(n.length.x, n.length.num / n.length.den);
  }
});

test("2 → do fits the three-band scheme; 5 → do does not, for this song", () => {
  // Not a defect in either mapping: the song covers p -5..12 (~2.6 octaves), and anchoring
  // at degree 5 straddles four 7-position band boundaries where degree 2 straddles three.
  // Restricting to sung notes does not change it - see the band histogram in the README.
  assert.equal(doc.mappings.anchor2.bandsUsed, 3);
  assert.equal(doc.mappings.anchor5.bandsUsed, 4);
  assert.ok(doc.source.warnings.some((w) => w.includes("anchor5")));
});

test("the opening sung phrase aligns to the printed lyrics", () => {
  const lyricOf = (id: number) =>
    doc.groups.find((g) => g.notes[0] === id && Object.keys(g.lyrics).length)?.lyrics;
  const line1 = doc.notes.filter((n) => n.line === 1);
  const w1 = line1.map((n) => lyricOf(n.id)?.["1"] ?? "").filter(Boolean).slice(0, 5);
  const w2 = line1.map((n) => lyricOf(n.id)?.["2"] ?? "").filter(Boolean).slice(0, 5);
  assert.deepEqual(w1, ["个", "世", "界", "凋", "谢，"]);
  assert.deepEqual(w2, ["们", "命", "运", "重", "叠，"]);
});

test("melismas leave the continuation notes unsung", () => {
  // 界 and 谢， each span two notes in the printed sheet; the second note of each pair
  // carries no syllable of its own.
  const sung = doc.groups.filter((g) => Object.keys(g.lyrics).length);
  assert.ok(sung.some((g) => g.notes.length === 2 && g.lyrics["1"] === "界"));
  assert.ok(sung.some((g) => g.notes.length === 2 && g.lyrics["1"] === "谢，"));
});

test("a two-note same-pitch bracket is a tie, not a slur", () => {
  const ties = doc.notes.filter((n) => n.tie === "start");
  assert.ok(ties.length > 0);
  for (const s of ties) {
    const stop = doc.notes[s.id + 1];
    assert.equal(stop.tie, "stop");
    assert.equal(stop.digit, s.digit);
    assert.equal(stop.octave, s.octave);
    assert.equal(s.slur, null, "a tie must not also be reported as a slur");
  }
});
