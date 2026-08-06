// Runs the vendored OMR pipeline in Node and scores it, to prove the port matches the browser.
import { readFileSync } from "node:fs";
import { decodeToBinary } from "../src/lib/omr/decode.ts";
import { recognizeJianpu } from "../src/lib/omr/jianpu.ts";
import { paddleOcrBackend } from "../src/lib/omr/paddleocr.ts";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { build } from "../src/lib/camam/build.ts";
import { fromRecognized, type RecognizedScore } from "../src/lib/local/recognized.ts";
import { scoreAgainst, formatReport } from "../src/lib/extract/score.ts";

const root = new URL("../", import.meta.url);
const png = readFileSync(new URL("fixtures/tan-van-xi.png", root));
const t0 = Date.now();
const bin = await decodeToBinary(new Uint8Array(png), "image/png");
const tDecode = Date.now();
const rec = await recognizeJianpu(bin, paddleOcrBackend());
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const notes = rec.rows.reduce((a, r) => a + r.nums.length, 0);
console.log(`${secs}s total (decode ${((tDecode - t0) / 1000).toFixed(1)}s)  rows ${rec.rows.length}  notes ${notes}`);
console.log(`title ${JSON.stringify(rec.title)}  fifths ${rec.fifths}  meter ${rec.beats}/${rec.beatType}\n`);

const gt = build(parseJpwabc(readFileSync(new URL("fixtures/tan-van-xi.jpwabc", root), "utf8")), "gt");
const got = build(fromRecognized(rec as unknown as RecognizedScore), "musicpp-node");
console.log(formatReport(scoreAgainst(gt, got)));
