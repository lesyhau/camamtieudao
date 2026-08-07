// Accuracy of the FREE path (local OMR) against ground truth, plus its peak memory.
//
//   node scripts/bench-free.ts [image] [truth.jpwabc]
//
// scripts/bench.ts is the paid path and costs a real model call. This one is free and offline,
// so it is the regression to run after touching anything under src/lib/omr/ - in particular the
// canvas shim, where a change to how cells are cropped could shift what the OCR reads.
import { readFileSync } from "node:fs";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { build } from "../src/lib/camam/build.ts";
import { convertFree } from "../src/lib/pipeline.ts";
import { scoreAgainst, formatReport } from "../src/lib/extract/score.ts";

const root = new URL("../", import.meta.url);
const args = process.argv.slice(2);
const png = readFileSync(args[0] ? new URL(args[0], `file://${process.cwd()}/`) : new URL("fixtures/tan-van-xi.png", root));
const truth = readFileSync(args[1] ? new URL(args[1], `file://${process.cwd()}/`) : new URL("fixtures/tan-van-xi.jpwabc", root), "utf8");

function peakMB(): number {
  try {
    const s = readFileSync("/proc/self/status", "utf8");
    return Number(/(\d+)/.exec(s.split("VmHWM:")[1]?.split("\n")[0] ?? "")?.[1] ?? 0) / 1024;
  } catch {
    return 0; // not Linux; process.memoryUsage().rss would be the working set and is not comparable
  }
}

const gt = build(parseJpwabc(truth), "gt");
console.log(`truth: ${gt.notes.length} notes, ${gt.measures.length} measures, ${gt.lines.length} lines, ${gt.verseCount} verses`);

const t0 = Date.now();
const res = await convertFree(new Uint8Array(png), "image/png");
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`got:   ${res.doc.notes.length} notes, ${res.doc.measures.length} measures, ` +
  `${res.doc.lines.length} lines, ${res.doc.verseCount} verses`);
const hwm = peakMB();
console.log(`\n${secs}s${hwm ? `, peak rss ${hwm.toFixed(0)} MB` : ""}\n`);
console.log(formatReport(scoreAgainst(gt, res.doc)));
