// Our OMR against jpeditor's, on the same images.
//
//   node scripts/bench-omr.ts [substring]
//
// test/ holds input_N.<ext> beside output_N.txt, where the .txt is the .jpwabc that jpeditor's
// browser build produced for that image. Both sides are parsed by THIS repo's own .jpwabc
// reader and built into a CamAmDoc, so the comparison is note-for-note on identical structures
// rather than a diff of two text formats that happen to look similar.
//
// The point is to separate two very different failures that look the same from the outside:
// our recognition disagreeing with jpeditor's, and our recognition agreeing while something
// downstream throws the result away.
import { readFileSync, readdirSync } from "node:fs";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { build } from "../src/lib/camam/build.ts";
import { convertFree } from "../src/lib/pipeline.ts";
import type { CamAmDoc } from "../src/lib/camam/types.ts";

const root = new URL("../", import.meta.url);
const dir = new URL("test/", root);
const filter = process.argv[2];

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
};

/** The pitch stream, which is what a player actually reads. Rests included, as `0`. */
const pitches = (doc: CamAmDoc): string[] =>
  doc.notes.map((n) => (n.rest ? "0" : `${n.digit}${n.octave > 0 ? "'".repeat(n.octave) : ",".repeat(-n.octave)}`));

/** Longest common subsequence length - how much of the reference we got, in order. */
function lcs(a: string[], b: string[]): number {
  let prev = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Uint32Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length];
}

const files = readdirSync(dir).filter((f) => /^input_\d+\./.test(f)).sort();
if (!files.length) throw new Error("no test/input_N.<ext> files");

console.log("image                    ref    ours   matched  agreement   key        title");
console.log("-".repeat(96));

for (const file of files) {
  const n = /^input_(\d+)\./.exec(file)![1];
  if (filter && !file.includes(filter) && !n.includes(filter)) continue;

  let refDoc: CamAmDoc;
  try {
    refDoc = build(parseJpwabc(readFileSync(new URL(`output_${n}.txt`, dir), "utf8")), "jpeditor");
  } catch (e) {
    console.log(`${file.padEnd(24)} reference unreadable: ${e instanceof Error ? e.message : e}`);
    continue;
  }

  const ext = file.slice(file.lastIndexOf("."));
  const bytes = new Uint8Array(readFileSync(new URL(file, dir)));
  const t0 = Date.now();
  let ours: CamAmDoc;
  try {
    ours = (await convertFree(bytes, MIME[ext] ?? "image/jpeg")).doc;
  } catch (e) {
    console.log(`${file.padEnd(24)} FAILED: ${e instanceof Error ? e.message : e}`);
    continue;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  const ref = pitches(refDoc);
  const got = pitches(ours);
  const matched = lcs(ref, got);
  const pct = ref.length ? (matched / ref.length) * 100 : 0;

  console.log(
    `${file.padEnd(24)} ${String(ref.length).padStart(4)}  ${String(got.length).padStart(5)}  ` +
    `${String(matched).padStart(7)}  ${pct.toFixed(1).padStart(7)}%  ` +
    `${(ours.key.jianpu === refDoc.key.jianpu ? "=" : `${ours.key.jianpu}≠${refDoc.key.jianpu}`).padEnd(10)} ` +
    `${(ours.title || "(none)").slice(0, 20).padEnd(20)} ${secs}s`,
  );

  // The first place the two streams part company usually explains the rest.
  if (pct < 99) {
    let i = 0;
    while (i < ref.length && i < got.length && ref[i] === got[i]) i++;
    console.log(`    first difference at note ${i}: reference ${ref.slice(i, i + 8).join(" ")}`);
    console.log(`    ${" ".repeat(String(i).length + 24)}ours ${got.slice(i, i + 8).join(" ")}`);
  }
}
