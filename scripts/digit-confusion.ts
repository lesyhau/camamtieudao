// Which digits do we get wrong, and what do we say instead?
//
//   node scripts/digit-confusion.ts
//
// bench-omr.ts says how much of the reference we reproduce. This says WHAT the mistakes are.
// The two streams are aligned by the same longest-common-subsequence used there, and every
// position where they disagree is tallied into a matrix - so a systematic misread shows up as
// one hot column instead of being averaged into a percentage.
import { readFileSync, readdirSync } from "node:fs";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { build } from "../src/lib/camam/build.ts";
import { convertFree } from "../src/lib/pipeline.ts";
import type { CamAmDoc } from "../src/lib/camam/types.ts";

const dir = new URL("../test/", import.meta.url);
const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
};

/** Digit only - the octave marks are a separate question and would blur this one. */
const digits = (d: CamAmDoc): string[] => d.notes.map((n) => (n.rest ? "0" : String(n.digit)));

/** Full LCS table, so the alignment itself can be walked back. */
function align(a: string[], b: string[]): Array<[string | null, string | null]> {
  const m = a.length, n = b.length;
  const t: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
    }
  }
  const out: Array<[string | null, string | null]> = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { out.push([a[--i], b[--j]]); }
    else if (t[i - 1][j] >= t[i][j - 1]) { out.push([a[--i], null]); }   // reference note we missed
    else { out.push([null, b[--j]]); }                                   // note we invented
  }
  while (i > 0) out.push([a[--i], null]);
  while (j > 0) out.push([null, b[--j]]);
  out.reverse();

  // LCS has no notion of "changed": a misread comes out as a deletion of the reference note
  // immediately followed by an insertion of ours. Pairing those adjacent halves back together
  // is what turns "73 missed, 45 invented" into "3 was read as 1, N times", which is the
  // difference between a number and a lead.
  const paired: Array<[string | null, string | null]> = [];
  for (let k = 0; k < out.length; k++) {
    const [r, g] = out[k];
    const next = out[k + 1];
    if (r !== null && g === null && next && next[0] === null && next[1] !== null) {
      paired.push([r, next[1]]); k++; continue;
    }
    if (r === null && g !== null && next && next[0] !== null && next[1] === null) {
      paired.push([next[0], g]); k++; continue;
    }
    paired.push([r, g]);
  }
  return paired;
}

const SYMS = ["0", "1", "2", "3", "4", "5", "6", "7"];
const matrix = new Map<string, Map<string, number>>();
const missed = new Map<string, number>();
const invented = new Map<string, number>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

for (const file of readdirSync(dir).filter((f) => /^input_\d+\./.test(f)).sort()) {
  const n = /^input_(\d+)\./.exec(file)![1];
  const ref = build(parseJpwabc(readFileSync(new URL(`output_${n}.txt`, dir), "utf8")), "ref");
  const bytes = new Uint8Array(readFileSync(new URL(file, dir)));
  let ours: CamAmDoc;
  try {
    ours = (await convertFree(bytes, MIME[file.slice(file.lastIndexOf("."))] ?? "image/jpeg")).doc;
  } catch { continue; }

  for (const [r, g] of align(digits(ref), digits(ours))) {
    if (r === null) { bump(invented, g!); continue; }
    if (g === null) { bump(missed, r); continue; }
    if (r === g) continue;
    if (!matrix.has(r)) matrix.set(r, new Map());
    bump(matrix.get(r)!, g);
  }
}

console.log("Substitutions - rows are what the sheet prints, columns what we read.\n");
console.log("        " + SYMS.map((s) => s.padStart(5)).join("") + "    total");
let grand = 0;
for (const r of SYMS) {
  const row = matrix.get(r);
  if (!row) continue;
  const total = [...row.values()].reduce((a, b) => a + b, 0);
  grand += total;
  console.log(`  ${r} ->  ` + SYMS.map((c) => String(row.get(c) ?? "").padStart(5)).join("") + `${String(total).padStart(9)}`);
}
console.log(`\ntotal substitutions: ${grand}`);

const col = (c: string) => [...matrix.values()].reduce((a, m) => a + (m.get(c) ?? 0), 0);
console.log("\nread AS each digit (a hot number here is one glyph swallowing the others):");
console.log("  " + SYMS.map((c) => `${c}:${col(c)}`).join("   "));

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
console.log(`\nnotes missed entirely: ${sum(missed)}  ${JSON.stringify(Object.fromEntries(missed))}`);
console.log(`notes invented:        ${sum(invented)}  ${JSON.stringify(Object.fromEntries(invented))}`);
