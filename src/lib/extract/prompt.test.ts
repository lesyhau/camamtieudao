// Every example the prompt teaches must be valid JPX.
//
// If the spec shows a construct the parser rejects, extraction fails in a way that reads as
// model error and costs a long time to attribute. Each case below asserts BOTH that the
// snippet appears in the spec and that it parses to what the spec claims - so neither side can
// drift without the other failing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJpx } from "../camam/jpx.ts";
import { build } from "../camam/build.ts";
import { JPX_SPEC, SYSTEM_PROMPT, userPrompt, repairPrompt } from "./prompt.ts";

const doc = (staff: string) => build(parseJpx(`#key 1=C\n#meter 4/4\n#verses 2\nL1: ${staff}`), "t");

/** Assert the snippet is actually taught, so the test cannot outlive the spec. */
const taught = (snippet: string) =>
  assert.ok(JPX_SPEC.includes(snippet), `spec no longer contains ${JSON.stringify(snippet)}`);

test("the octave examples parse as described", () => {
  taught("5'");
  taught("6,,");
  const d = doc("5' 6,, |");
  assert.deepEqual(d.notes.map((n) => [n.digit, n.octave]), [[5, 1], [6, -2]]);
});

test("1._ is a dotted note with one beam, and 5--- is held four beats", () => {
  taught("1._ is a dotted note with one beam");
  taught("5--- is a note held four beats");
  const d = doc("1._ 5--- |");
  assert.deepEqual(d.notes[0].length, { num: 3, den: 4, x: 0.75 });
  assert.deepEqual(d.notes[1].length, { num: 4, den: 1, x: 4 });
});

test("a group may cross a barline", () => {
  taught("( 6__ | 6 )");
  const d = doc("( 6__ | 6 ) |");
  assert.equal(d.groups.filter((g) => g.notes.length === 2).length, 1);
  assert.equal(d.measures.length, 2);
});

test("the lyric examples attach where the spec says", () => {
  taught("1_[个]");
  taught("( 5__ 5_ )[界]");
  taught("1_[个|们]");
  taught("[谢，]");

  assert.equal(doc("1_[个] |").groups[0].lyrics["1"], "个");

  const melisma = doc("( 5__ 5_ )[界] |");
  const g = melisma.groups.find((x) => x.lyrics["1"] === "界");
  assert.deepEqual(g?.notes, [0, 1]);

  assert.deepEqual(doc("1_[个|们] |").groups[0].lyrics, { "1": "个", "2": "们" });
  assert.equal(doc("1_[谢，] |").groups[0].lyrics["1"], "谢，");
});

test("every barline and repeat token the spec lists is accepted", () => {
  for (const tok of ["|", "||", "|]", "|:", ":|"]) {
    taught(tok);
    assert.doesNotThrow(() => doc(`1 ${tok} 2 |`), `barline ${tok}`);
  }
  taught("[1");
  taught("[2");
  const d = doc("1 |: [1 2 :| 3 |");
  assert.ok(d.measures.some((m) => m.repeatStart), "repeat open recorded");
  assert.ok(d.measures.some((m) => m.repeatEnd), "repeat close recorded");
  assert.ok(d.measures.some((m) => m.ending === 1), "volta recorded");
});

test("a rest is digit 0 and carries no cam am name", () => {
  taught("0 is a rest");
  const d = doc("0 1 |");
  assert.equal(d.notes[0].rest, true);
  assert.equal(d.notes[0].camAm.anchor5, null);
  assert.equal(d.notes[1].rest, false);
});

test("the credit example parses into a role and a name", () => {
  taught("#credit 作词 郭德紫毅");
  const d = build(parseJpx("#key 1=C\n#meter 4/4\n#credit 作词 郭德紫毅\nL1: 1 |"), "t");
  assert.deepEqual(d.credits, [{ role: "作词", name: "郭德紫毅" }]);
});

test("the system prompt embeds the spec and forbids commentary", () => {
  assert.ok(SYSTEM_PROMPT.includes(JPX_SPEC));
  assert.match(SYSTEM_PROMPT, /Output ONLY the JPX document/);
  assert.match(SYSTEM_PROMPT, /no markdown fences/);
});

test("a single-image request does not mention strips", () => {
  const p = userPrompt({ index: 1, total: 1, firstLine: 1 });
  assert.doesNotMatch(p, /strip/i);
  assert.match(p, /starting at L1/);
});

test("later strips are told not to re-emit headers", () => {
  const p = userPrompt({ index: 2, total: 3, firstLine: 5, known: { title: "叹云兮", key: "1=D" } });
  assert.match(p, /strip 2 of 3/);
  assert.match(p, /starting at L5/);
  assert.match(p, /Do not emit any # header/);
  assert.match(p, /叹云兮/);
});

test("the repair prompt quotes the bad line back verbatim", () => {
  const p = repairPrompt("L3: 1 2 $$$ 3 |", 3, "unrecognised token");
  assert.match(p, /\$\$\$/);
  assert.match(p, /Line 3/);
  assert.match(p, /only that line was wrong/);
});
