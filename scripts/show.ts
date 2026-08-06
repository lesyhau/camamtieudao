import { readFileSync } from "node:fs";
import { decodeToBinary } from "../src/lib/omr/decode.ts";
import { recognizeJianpu } from "../src/lib/omr/jianpu.ts";
import { paddleOcrBackend } from "../src/lib/omr/paddleocr.ts";
import { fromRecognized, type RecognizedScore } from "../src/lib/local/recognized.ts";
import { build } from "../src/lib/camam/build.ts";
import { renderCamAm, recommendedMapping, summarize } from "../src/lib/camam/render.ts";

const png = readFileSync(new URL("../fixtures/tan-van-xi.png", import.meta.url));
const rec = await recognizeJianpu(await decodeToBinary(new Uint8Array(png), "image/png"), paddleOcrBackend());
const doc = build(fromRecognized(rec as unknown as RecognizedScore), "musicpp");
console.log("recommended mapping:", recommendedMapping(doc), "|", summarize(doc));
console.log("\n===== plain =====");
console.log(renderCamAm(doc).split("\n").slice(0, 9).join("\n"));
console.log("===== inline lyrics =====");
console.log(renderCamAm(doc, { lyrics: "inline", header: false }).split("\n").slice(1, 3).join("\n"));
console.log("===== below =====");
console.log(renderCamAm(doc, { lyrics: "below", header: false }).split("\n").slice(2, 6).join("\n"));
