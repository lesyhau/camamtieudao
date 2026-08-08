// OUR reading vs jpeditor's CURRENT reading, note for note.
//
//   node scripts/bench-jpeditor.ts [substring]
//
// Reads test/jpeditor/input_N.json - the RecognizedScore jpeditor's own build produced for that
// image, captured by scripts/dump-jpeditor.ts. Both sides are RecognizedScore, so this compares
// the recogniser directly: no .jpwabc, no CamAmDoc, nothing downstream to blur the result.
//
// This exists because test/output_N.txt is a .jpwabc from an OLDER jpeditor build, which its own
// current build no longer reproduces (90.1% on input_2, 80.5% on input_3). Scoring against it
// charges us for jpeditor's changes as if they were our defects. bench-omr.ts still reports that
// number; this reports agreement with what jpeditor does today.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { decodeToBinary } from "../src/lib/omr/decode.ts";
import { recognizeJianpu } from "../src/lib/omr/jianpu.ts";
import { paddleOcrBackend } from "../src/lib/omr/paddleocr.ts";

const root = new URL("../", import.meta.url);
const dir = new URL("test/", root);
const refDir = new URL("test/jpeditor/", root);
const filter = process.argv[2];

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
};

interface RefNum { digit: number; octave: number; dot: number; div: number; augment: number; x: number; y: number; w: number; h: number }
interface RefRow { barlineXs: number[]; nums: RefNum[] }
interface Ref { fifths: number; beats: number; beatType: number; title?: string; rows: RefRow[] }

const files = readdirSync(dir).filter((f) => /^input_\d+\./.test(f)).sort();
if (!files.length) throw new Error("no test/input_N.<ext> files");

console.log("image            notes ref/ours   digits   +octave   +rhythm   boxes   key   rows");
console.log("-".repeat(88));

let anyMissing = false;
for (const file of files) {
  const n = /^input_(\d+)\./.exec(file)![1];
  if (filter && !file.includes(filter) && !n.includes(filter)) continue;

  const refPath = new URL(`input_${n}.json`, refDir);
  if (!existsSync(refPath)) {
    console.log(`${file.padEnd(16)} no test/jpeditor/input_${n}.json - run scripts/dump-jpeditor.ts`);
    anyMissing = true;
    continue;
  }
  const ref: Ref = JSON.parse(readFileSync(refPath, "utf8"));

  const ext = file.slice(file.lastIndexOf("."));
  const bytes = new Uint8Array(readFileSync(new URL(file, dir)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score: any = await recognizeJianpu(await decodeToBinary(bytes, MIME[ext] ?? "image/jpeg"), paddleOcrBackend());

  const flat = (rows: { nums: unknown[] }[]) => rows.flatMap((r) => r.nums as RefNum[]);
  const A = flat(ref.rows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (score.rows as any[]).flatMap((r: any) => r.nums.map((v: any) => ({
    digit: v.digit, octave: v.octave, dot: v.dot, div: v.div, augment: v.augment,
    x: v.bbox.x, y: v.bbox.y, w: v.bbox.w, h: v.bbox.h,
  })));

  const pct = (k: number, of: number) => of ? `${((k / of) * 100).toFixed(1)}%`.padStart(7) : "    n/a";
  if (A.length !== B.length) {
    console.log(`${file.padEnd(16)} ${String(A.length).padStart(4)}/${String(B.length).padEnd(5)}` +
      `  NOTE COUNT DIFFERS - rows ${ref.rows.length} vs ${score.rows.length}, ` +
      `barlines ${JSON.stringify(ref.rows.map((r) => r.barlineXs.length))} vs ` +
      `${JSON.stringify((score.rows as { barlineXs: number[] }[]).map((r) => r.barlineXs.length))}`);
    continue;
  }
  let dig = 0, oct = 0, rhy = 0, box = 0;
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = B[i];
    if (a.digit === b.digit) dig++;
    if (a.digit === b.digit && a.octave === b.octave) oct++;
    if (a.digit === b.digit && a.octave === b.octave && a.dot === b.dot && a.div === b.div && a.augment === b.augment) rhy++;
    if (a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h) box++;
  }
  console.log(`${file.padEnd(16)} ${String(A.length).padStart(4)}/${String(B.length).padEnd(5)}  ` +
    `${pct(dig, A.length)}  ${pct(oct, A.length)}  ${pct(rhy, A.length)}  ${pct(box, A.length)}  ` +
    `${(ref.fifths === score.fifths ? "  =  " : `${score.fifths}≠${ref.fifths}`).padEnd(5)} ` +
    `${ref.rows.length === score.rows.length ? " =" : `${score.rows.length}≠${ref.rows.length}`}`);
}
if (anyMissing) {
  console.log("\nRegenerate with:  for i in 0 1 2 3 4 5; do node scripts/dump-jpeditor.ts test/input_$i.* test/jpeditor/input_$i.json; done");
}
