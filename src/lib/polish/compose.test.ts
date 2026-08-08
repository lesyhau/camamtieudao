import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compose, composeByLine, sungText, units } from "./compose.ts";
import { parseSections } from "./prompt.ts";
import { tokenOf } from "./token.ts";
import { renderPolished } from "./render.ts";
import { parseJpwabc } from "../camam/jpwabc.ts";
import { build } from "../camam/build.ts";
import type { Polished } from "./types.ts";

const doc = build(
  parseJpwabc(readFileSync(new URL("../../../fixtures/tan-van-xi.jpwabc", import.meta.url), "utf8")),
  "test",
);
const us = units(doc);
const total = (secs: { phrases: { notes: unknown[] }[] }[]) =>
  secs.reduce((n, s) => n + s.phrases.reduce((m, p) => m + p.notes.length, 0), 0);

test("a token is the note as a sheet prints it", () => {
  assert.equal(tokenOf({ digit: 5, octave: 0, rest: false }), "5");
  assert.equal(tokenOf({ digit: 1, octave: 1, rest: false }), "1'");
  assert.equal(tokenOf({ digit: 6, octave: -1, rest: false }), "6,");
  assert.equal(tokenOf({ digit: 0, octave: 0, rest: true }), "0");
});

test("repeats inside a syllable collapse, and nothing else does", () => {
  const kept = us.reduce((n, u) => n + u.notes.length, 0);
  assert.ok(kept < doc.notes.length, "the reference song does have repeats to drop");
  assert.equal(kept, 377, "419 -> 377 on the reference song");

  for (const u of us) {
    if (!u.syllable) continue;
    for (let i = 1; i < u.notes.length; i++) {
      const a = u.notes[i - 1], b = u.notes[i];
      assert.ok(
        a.rest || b.rest || a.digit !== b.digit || a.octave !== b.octave,
        "no two adjacent notes in one syllable share a pitch",
      );
    }
  }
});

test("a repeated pitch under the NEXT word is a note you play again", () => {
  // Two syllables, same pitch: both survive, because only within-syllable repeats collapse.
  const twice = us.filter((u) => u.syllable).filter((u, i, a) => {
    const prev = a[i - 1];
    return prev?.syllable && prev.notes.at(-1)?.digit === u.notes[0]?.digit
      && prev.notes.at(-1)?.octave === u.notes[0]?.octave;
  });
  assert.ok(twice.length > 0, "the reference song has such a pair");
});

test("verses merge to one, and the merged text is what the model is shown", () => {
  assert.equal(doc.verseCount, 2);
  const words = sungText(us);
  assert.ok(!words.includes("/"), "no verse-alternation notation leaks into the words");
  assert.equal(words.split(/\s+/).length, us.filter((u) => u.syllable).length);
});

test("every note survives composition, however the model phrases it", () => {
  const kept = us.reduce((n, u) => n + u.notes.length, 0);
  const sections = parseSections("## Lời 1\n一 个 世 界 凋 谢，\n我 会 守 在 你 身 边，");
  assert.equal(total(compose(us, sections)), kept, "unmentioned words still carry their notes");
  assert.equal(total(compose(us, [])), kept, "an empty answer loses nothing");
  assert.equal(total(composeByLine(us)), kept);
});

test("a hallucinated word costs that word, not the alignment after it", () => {
  const good = compose(us, parseSections("## A\n一 个 世 界\n凋 谢，"));
  const withJunk = compose(us, parseSections("## A\n一 个 KHÔNG_CÓ 世 界\n凋 谢，"));
  assert.equal(total(good), total(withJunk));
  assert.equal(
    withJunk[withJunk.length - 1].phrases.map((p) => p.lyric).join("|"),
    good[good.length - 1].phrases.map((p) => p.lyric).join("|"),
    "the invented word is dropped and the real ones stay put",
  );
});

test("leading instrumental notes become their own section", () => {
  const out = compose(us, parseSections("## Lời 1\n一 个 世 界 凋 谢，"));
  assert.equal(out[0].title, "Dạo đầu");
  assert.ok(out[0].phrases[0].notes.length > 0);
  assert.equal(out[0].phrases[0].lyric, "");
});

test("the same phrasing renders differently under each fingering, and never disagrees with itself", () => {
  const composed = compose(us, parseSections("## Lời 1\n一 个 世 界 凋 谢，"));
  const polished: Polished = {
    model: "test",
    sections: composed.map((c) => ({
      title: c.title,
      lines: c.phrases.map((p) => ({ tokens: p.notes.map(tokenOf), lyric: p.lyric })),
    })),
  };
  const ids = Object.keys(doc.mappings);
  const a = renderPolished(polished, doc, ids[0]);
  const b = renderPolished(polished, doc, ids[1]);
  assert.notEqual(a, b);
  for (const text of [a, b]) {
    assert.ok(text.startsWith(doc.title));
    assert.ok(text.includes("## Dạo đầu"));
    assert.ok(text.includes("一 个 世 界 凋 谢，"));
  }
});

test("section headings are read, and chrome around them is not", () => {
  const secs = parseSections("```\n## Lời 1\n* bỏ qua\nmột hai ba\n\n## Điệp khúc\nbốn năm\n```");
  assert.deepEqual(secs.map((s) => s.title), ["Lời 1", "Điệp khúc"]);
  assert.deepEqual(secs[0].lines, ["một hai ba"]);
});
