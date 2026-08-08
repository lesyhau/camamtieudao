// Run jpeditor's OWN browser pipeline on an image and dump what it saw, so this repo can be
// compared against it directly instead of against a checked-in .jpwabc that may predate it.
//
//   node scripts/dump-jpeditor.ts <image> <out.json> [--cells]
//
// Needs jpeditor built (`npm run build` there) and its playwright - both are resolved from
// JPEDITOR_DIR, default ../../jianpu_workspace/jpeditor. Nothing is installed into this repo.
//
// Dumps: the RecognizedScore (digits, octaves, rhythm, bboxes, barlines), the binary ink map,
// and with --cells the 64x64 recogniser input for every digit box. The last one is what settles
// "same ink, same box, different reading" arguments: if the cells match, the difference is the
// inference runtime; if they do not, it is the canvas.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { createRequire } from "node:module";

const JPEDITOR = process.env.JPEDITOR_DIR ?? resolve(process.cwd(), "../../jianpu_workspace/jpeditor");
// playwright lives in jpeditor's node_modules; resolve it from there rather than adding a
// heavyweight browser dependency to this repo for a diagnostic.
const require = createRequire(join(JPEDITOR, "package.json"));
const { chromium } = require("playwright") as { chromium: any };

const ROOT = join(JPEDITOR, "dist");
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".wasm": "application/wasm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".bmp": "image/bmp",
  ".webp": "image/webp", ".gif": "image/gif",
};

const imgPath = process.argv[2];
const outPath = process.argv[3] ?? "jpeditor.json";
const wantCells = process.argv.includes("--cells");
const wantBin = process.argv.includes("--bin");
if (!imgPath) { console.error("usage: node scripts/dump-jpeditor.ts <image> <out.json> [--cells] [--bin]"); process.exit(1); }

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    const data = await readFile(join(ROOT, normalize(p)));
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise<void>((r) => server.listen(0, () => r()));
const port = (server.address() as { port: number }).port;

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
page.on("console", (m: any) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e: Error) => errors.push("pageerror: " + e.message));
await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const b64 = Buffer.from(await readFile(imgPath)).toString("base64");
const mime = MIME[extname(imgPath).toLowerCase()] ?? "image/png";

const out = await page.evaluate(async ({ b64, mime, wantCells, wantBin }: any) => {
  const omr = await (window as any).__omr;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bin = await omr.decodeToBinary(bytes, mime);
  const score = await omr.recognizeJianpu(bin, omr.paddleOcrBackend());

  const b64of = (u8: Uint8Array) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // Verbatim copies of paddleocr.ts's binToCanvas + cellOf, so the cells compared are the ones
  // the recogniser actually receives.
  const binToCanvas = (b: any) => {
    const cv = new OffscreenCanvas(b.w, b.h);
    const ctx = cv.getContext("2d")!;
    const img = new ImageData(b.w, b.h);
    for (let i = 0; i < b.data.length; i++) {
      const v = b.data[i] ? 0 : 255, p = i * 4;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };
  const cellOf = (src: any, b: any, r: any, cell = 64, pad = 8) => {
    const inner = cell - pad * 2;
    const cv = new OffscreenCanvas(cell, cell);
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cell, cell);
    const sx = Math.max(0, r.x), sy = Math.max(0, r.y);
    const sw = Math.min(b.w, r.x + r.w) - sx, sh = Math.min(b.h, r.y + r.h) - sy;
    if (sw > 0 && sh > 0) {
      const scale = Math.min(inner / sw, inner / sh);
      const dw = sw * scale, dh = sh * scale;
      ctx.drawImage(src, sx, sy, sw, sh, (cell - dw) / 2, (cell - dh) / 2, dw, dh);
    }
    return cv;
  };

  let cells: string[] | undefined, cells48: string[] | undefined;
  if (wantCells) {
    const src = binToCanvas(bin);
    cells = []; cells48 = [];
    // recognizeDigitCells downscales the 64x64 cell to 48x48 before normalising it into the
    // tensor. That second resample is a separate chance to disagree, so dump both stages.
    const tmp = new OffscreenCanvas(48, 48);
    const tctx = tmp.getContext("2d")!;
    for (const row of score.rows) {
      for (const n of row.nums) {
        const cv = cellOf(src, bin, n.bbox);
        const d = cv.getContext("2d")!.getImageData(0, 0, 64, 64).data;
        const g = new Uint8Array(64 * 64);
        for (let i = 0; i < g.length; i++) g[i] = d[i * 4]; // grey: r==g==b
        cells.push(b64of(g));

        tctx.clearRect(0, 0, 48, 48);
        tctx.drawImage(cv, 0, 0, 48, 48);
        const d48 = tctx.getImageData(0, 0, 48, 48).data;
        const g48 = new Uint8Array(48 * 48);
        for (let i = 0; i < g48.length; i++) g48[i] = d48[i * 4];
        cells48.push(b64of(g48));
      }
    }
  }

  return {
    w: bin.w, h: bin.h, ink: bin.data.reduce((a: number, v: number) => a + v, 0),
    binB64: wantBin ? b64of(bin.data) : undefined,
    fifths: score.fifths, beats: score.beats, beatType: score.beatType, title: score.title,
    credits: score.credits, tempo: score.tempo, cells,
    cells48,
    rows: score.rows.map((r: any) => ({
      topY: r.topY, bottomY: r.bottomY, barlineXs: r.barlineXs,
      nums: r.nums.map((n: any) => ({
        digit: n.digit, octave: n.octave, dot: n.dot, div: n.div, augment: n.augment,
        slurStart: n.slurStart, slurStop: n.slurStop, tieStart: n.tieStart, tieStop: n.tieStop,
        lyrics: n.lyrics, x: n.bbox?.x, y: n.bbox?.y, w: n.bbox?.w, h: n.bbox?.h,
      })),
    })),
  };
}, { b64, mime, wantCells, wantBin } as any);

await writeFile(outPath, JSON.stringify(out));
const notes = out.rows.reduce((a: number, r: any) => a + r.nums.length, 0);
console.log(`${imgPath}: ${out.w}x${out.h} ink=${out.ink} fifths=${out.fifths} notes=${notes}` +
  `${out.cells ? ` cells=${out.cells.length}` : ""} -> ${outPath}`);
if (errors.length) console.error("page errors:", errors.slice(0, 5));
await browser.close();
server.close();
