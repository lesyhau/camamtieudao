// Does enlarging a small sheet before recognition close the gap with jpeditor?
//
//   node scripts/try-upscale.ts [input_2.gif ...]
//
// decode.ts only ever shrinks: `scale = w > MAX_W ? MAX_W / w : 1`. A 382px-wide scan is read
// at 382px, where a digit is about eight pixels tall and every threshold in jianpu.ts is being
// asked to measure something smaller than the noise. This tries the other direction.
import { readFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { build } from "../src/lib/camam/build.ts";
import { convertFree } from "../src/lib/pipeline.ts";
import type { CamAmDoc } from "../src/lib/camam/types.ts";

const dir = new URL("../test/", import.meta.url);
const pitches = (d: CamAmDoc): string[] =>
  d.notes.map((n) => (n.rest ? "0" : `${n.digit}${n.octave > 0 ? "'".repeat(n.octave) : ",".repeat(-n.octave)}`));

function lcs(a: string[], b: string[]): number {
  let prev = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Uint32Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/** White ground before drawing: a GIF or PNG with transparency would otherwise read as ink. */
async function enlarge(bytes: Uint8Array, factor: number): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const img = await loadImage(Buffer.from(bytes));
  const w = Math.round(img.width * factor), h = Math.round(img.height * factor);
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { bytes: new Uint8Array(cv.toBuffer("image/png")), w, h };
}

const targets = process.argv.slice(2);
const files = targets.length ? targets : ["input_2.gif", "input_3.jpg"];

for (const file of files) {
  const n = /^input_(\d+)\./.exec(file)![1];
  const ref = build(parseJpwabc(readFileSync(new URL(`output_${n}.txt`, dir), "utf8")), "ref");
  const refP = pitches(ref);
  const raw = new Uint8Array(readFileSync(new URL(file, dir)));
  console.log(`\n${file} - reference ${refP.length} notes, key ${ref.key.jianpu}, "${ref.title}"`);

  for (const factor of [1, 1.5, 2, 3, 4]) {
    const { bytes, w, h } = await enlarge(raw, factor);
    try {
      const doc = (await convertFree(bytes, "image/png")).doc;
      const got = pitches(doc);
      const m = lcs(refP, got);
      console.log(
        `  x${String(factor).padEnd(4)} ${String(w).padStart(4)}x${String(h).padEnd(4)}  ` +
        `notes ${String(got.length).padStart(3)}  matched ${String(m).padStart(3)}/${refP.length}  ` +
        `${((m / refP.length) * 100).toFixed(1).padStart(5)}%  key ${doc.key.jianpu}  "${doc.title}"`,
      );
    } catch (e) {
      console.log(`  x${factor}  FAILED ${e instanceof Error ? e.message.slice(0, 70) : e}`);
    }
  }
}
