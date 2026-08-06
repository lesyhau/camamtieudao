// Scores the local musicpp OMR output against ground truth, with the same scorer used for the
// model path.  node scripts/bench-local.ts [omr.json]
import { readFileSync } from "node:fs";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { build } from "../src/lib/camam/build.ts";
import { fromRecognized, type RecognizedScore } from "../src/lib/local/recognized.ts";
import { scoreAgainst, formatReport } from "../src/lib/extract/score.ts";

const root = new URL("../", import.meta.url);
const gt = build(parseJpwabc(readFileSync(new URL("fixtures/tan-van-xi.jpwabc", root), "utf8")), "gt");
const path = process.argv[2] ?? new URL("fixtures/tan-van-xi.musicpp.json", root);
const rec = JSON.parse(readFileSync(path, "utf8")) as RecognizedScore;

const got = build(fromRecognized(rec), "musicpp");
console.log(`truth : ${gt.notes.length} notes, ${gt.measures.length} measures, ${gt.lines.length} lines, ${gt.verseCount} verses`);
console.log(`musicpp: ${got.notes.length} notes, ${got.measures.length} measures, ${got.lines.length} lines, ${got.verseCount} verses`);
console.log(`  title  ${JSON.stringify(got.title)}   key ${got.key.jianpu}   meter ${got.meter.beats}/${got.meter.beatType}`);
console.log(`  mappings ${JSON.stringify(got.mappings.anchor2)} (truth ${JSON.stringify(gt.mappings.anchor2)})\n`);
console.log(formatReport(scoreAgainst(gt, got)));
