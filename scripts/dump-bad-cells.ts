// Show me the pixels the recogniser was actually looking at when it said `1`.
//
//   node scripts/dump-bad-cells.ts [input_2.gif ...]
//
// 26 of 30 substitutions are "read as 1", 18 of them a printed `3`. That is one glyph
// swallowing the others, and the question is whether the recogniser was shown a `3` and got it
// wrong, or was shown something that genuinely looks like a `1` - a clipped crop, half a
// character, a stroke that broke in the print.
//
// So: wrap the OCR backend, keep every cell rectangle it was asked about beside the digit it
// returned, align that sequence against jpeditor's, and write out the disagreeing cells as one
// contact sheet per image. The crop is drawn from the binary map with margin, so a rectangle
// that cuts the glyph in half is visible as exactly that.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { build } from "../src/lib/camam/build.ts";
import { decodeToBinary } from "../src/lib/omr/decode.ts";
import { recognizeJianpu } from "../src/lib/omr/jianpu.ts";
import { paddleOcrBackend } from "../src/lib/omr/paddleocr.ts";

import type { Binary, Rect } from "../src/lib/omr/types.ts";

const dir = new URL("../test/", import.meta.url);
const outDir = new URL("../test/debug/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
};

/** Same pairing-aware alignment as digit-confusion.ts. */
function align(a: string[], b: string[]): Array<[string | null, string | null, number]> {
  const m = a.length, n = b.length;
  const t: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
    }
  }
  const raw: Array<[string | null, string | null, number]> = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { i--; j--; raw.push([a[i], b[j], j]); }
    else if (t[i - 1][j] >= t[i][j - 1]) { i--; raw.push([a[i], null, -1]); }
    else { j--; raw.push([null, b[j], j]); }
  }
  while (i > 0) { i--; raw.push([a[i], null, -1]); }
  while (j > 0) { j--; raw.push([null, b[j], j]); }
  raw.reverse();

  const out: Array<[string | null, string | null, number]> = [];
  for (let k = 0; k < raw.length; k++) {
    const [r, g, idx] = raw[k], next = raw[k + 1];
    if (r !== null && g === null && next && next[0] === null && next[1] !== null) {
      out.push([r, next[1], next[2]]); k++; continue;
    }
    if (r === null && g !== null && next && next[0] !== null && next[1] === null) {
      out.push([next[0], g, idx]); k++; continue;
    }
    out.push([r, g, idx]);
  }
  return out;
}

/** One cell of the binary map, with margin, magnified, ink black on white. */
function drawCell(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
                  bin: Binary, r: Rect, x0: number, y0: number, box: number): void {
  const mx = Math.max(2, Math.round(r.w * 0.4)), my = Math.max(2, Math.round(r.h * 0.4));
  const sx = r.x - mx, sy = r.y - my, sw = r.w + mx * 2, sh = r.h + my * 2;
  const scale = Math.min(box / sw, box / sh);
  const ox = x0 + (box - sw * scale) / 2, oy = y0 + (box - sh * scale) / 2;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const px = sx + x, py = sy + y;
      const ink = px >= 0 && py >= 0 && px < bin.w && py < bin.h && bin.data[py * bin.w + px] === 1;
      if (!ink) continue;
      ctx.fillStyle = "#000";
      ctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale));
    }
  }
  // The rectangle the recogniser was given, so a crop that clips the glyph is obvious.
  ctx.strokeStyle = "#e11";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + mx * scale, oy + my * scale, r.w * scale, r.h * scale);
}

const targets = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => /^input_\d+\./.test(f) && (!targets.length || targets.includes(f))).sort();

for (const file of files) {
  const n = /^input_(\d+)\./.exec(file)![1];
  const ref = build(parseJpwabc(readFileSync(new URL(`output_${n}.txt`, dir), "utf8")), "ref");
  const bytes = new Uint8Array(readFileSync(new URL(file, dir)));
  const bin = await decodeToBinary(bytes, MIME[file.slice(file.lastIndexOf("."))] ?? "image/jpeg");

  // Every rectangle the digit recogniser was asked about, with what it answered.
  const seen: Array<{ rect: Rect; got: number }> = [];
  const inner = paddleOcrBackend();
  const spy = {
    ...inner,
    async recognizeDigits(b: Binary, rects: Rect[]): Promise<number[]> {
      const out = await inner.recognizeDigits(b, rects);
      rects.forEach((rect, k) => seen.push({ rect, got: out[k] }));
      return out;
    },
  };
  await recognizeJianpu(bin, spy);

  const refD = ref.notes.map((x) => (x.rest ? "0" : String(x.digit)));
  const gotD = seen.map((c) => String(c.got));
  const bad = align(refD, gotD).filter(([r, g, i]) => r !== null && g !== null && r !== g && i >= 0);

  console.log(`${file}: ${seen.length} cells recognised, ${bad.length} disagree with the reference`);
  if (!bad.length) continue;
  const tally = new Map<string, number>();
  for (const [r, g] of bad) tally.set(`${r}->${g}`, (tally.get(`${r}->${g}`) ?? 0) + 1);
  console.log(`   ${[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} x${v}`).join("  ")}`);

  const BOX = 96, COLS = 8, PAD = 22;
  const rows = Math.ceil(bad.length / COLS);
  const cv = createCanvas(COLS * BOX, rows * (BOX + PAD));
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cv.width, cv.height);
  bad.forEach(([r, g, idx], k) => {
    const cx = (k % COLS) * BOX, cy = Math.floor(k / COLS) * (BOX + PAD);
    drawCell(ctx, bin, seen[idx].rect, cx, cy, BOX);
    ctx.fillStyle = "#e11";
    ctx.font = "13px sans-serif";
    ctx.fillText(`${r} read as ${g}`, cx + 4, cy + BOX + 15);
  });
  const path = new URL(`bad-${file.replace(/\.\w+$/, "")}.png`, outDir);
  writeFileSync(path, cv.toBuffer("image/png"));
  console.log(`   -> test/debug/bad-${file.replace(/\.\w+$/, "")}.png`);
}
