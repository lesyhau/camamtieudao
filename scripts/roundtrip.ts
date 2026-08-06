// Round-trips the ground truth through JPX and reports any loss. Not a test - the assertions
// live in jpx.test.ts; this prints the diff when one of them fails.
import { readFileSync } from "node:fs";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { parseJpx, writeJpx } from "../src/lib/camam/jpx.ts";
import { build } from "../src/lib/camam/build.ts";

const a = build(parseJpwabc(readFileSync(new URL("../fixtures/tan-van-xi.jpwabc", import.meta.url), "utf8")), "gt");
const jpx = writeJpx(a);
const b = build(parseJpx(jpx), "rt");

const cmp = (label: string, x: unknown, y: unknown) =>
  console.log(`  ${JSON.stringify(x) === JSON.stringify(y) ? "OK  " : "DIFF"} ${label}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
const sung = (d: typeof a) => d.groups.filter((g) => Object.keys(g.lyrics).length).length;

console.log(`JPX: ${jpx.split("\n").length} lines, ${jpx.length} chars`);
console.log("round trip (ground truth vs JPX->parse):");
cmp("notes", a.notes.length, b.notes.length);
cmp("measures", a.measures.length, b.measures.length);
cmp("lines", a.lines.length, b.lines.length);
cmp("groups", a.groups.length, b.groups.length);
cmp("sung groups", sung(a), sung(b));
cmp("mappings", a.mappings, b.mappings);

let bad = 0;
for (let i = 0; i < Math.min(a.notes.length, b.notes.length); i++) {
  const x = a.notes[i], y = b.notes[i];
  const k = (n: typeof x) => `${n.digit}/${n.octave}/${n.underscores}/${n.dots}/${n.dashes}/${n.measure}/${n.line}/${n.camAm.anchor5}/${n.camAm.anchor2}`;
  if (k(x) !== k(y)) { if (bad < 6) console.log(`  note ${i}: ${k(x)}  !=  ${k(y)}`); bad++; }
}
console.log(`  note/measure/line/name mismatches: ${bad}`);

let lbad = 0;
for (const g of a.groups) {
  const h = b.groups.find((z) => z.notes[0] === g.notes[0]);
  if (JSON.stringify(g.lyrics) !== JSON.stringify(h?.lyrics ?? {})) {
    if (lbad < 6) console.log(`  group@note${g.notes[0]}: ${JSON.stringify(g.lyrics)} != ${JSON.stringify(h?.lyrics)}`);
    lbad++;
  }
}
console.log(`  lyric mismatches: ${lbad}`);
