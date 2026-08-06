// Measure extraction accuracy against ground truth.
//
//   node scripts/bench.ts [model] [--save]
//
// Reads LLM_* from .env.local. Costs a real model call; not part of `npm test`.
import { readFileSync, writeFileSync } from "node:fs";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { parseJpx } from "../src/lib/camam/jpx.ts";
import { build } from "../src/lib/camam/build.ts";
import { extract } from "../src/lib/extract/extract.ts";
import { scoreAgainst, formatReport } from "../src/lib/extract/score.ts";

const root = new URL("../", import.meta.url);
for (const line of readFileSync(new URL(".env.local", root), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] ??= m[2];
}

const model = process.argv.find((a) => a.startsWith("gemini")) ?? process.env.LLM_MODEL ?? "gemini-3.1-pro-preview";
const save = process.argv.includes("--save");

const gt = build(parseJpwabc(readFileSync(new URL("fixtures/tan-van-xi.jpwabc", root), "utf8")), "gt");
const png = readFileSync(new URL("fixtures/tan-van-xi.png", root));

console.log(`model: ${model}`);
console.log(`image: ${(png.length / 1024).toFixed(0)}KB`);
console.log(`truth: ${gt.notes.length} notes, ${gt.measures.length} measures, ${gt.lines.length} lines, ${gt.verseCount} verses\n`);

const t0 = Date.now();
const res = await extract(
  { apiKey: process.env.LLM_API_KEY!, model, baseUrl: process.env.LLM_BASE_URL || undefined },
  {
    image: { mimeType: "image/png", data: png.toString("base64") },
    onAttempt: (i) =>
      console.log(`  attempt ${i.attempt}: ${i.ok ? "parsed" : "PARSE FAILED"}  (in ${i.usage.input}, out ${i.usage.output} tokens)`),
  },
);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

for (const r of res.repaired) console.log(`  repaired: ${r}`);
console.log(`\n${secs}s, ${res.attempts} attempt(s), ${res.usage.input} in / ${res.usage.output} out\n`);

const got = build(parseJpx(res.jpx), `gemini:${model}`);
console.log(formatReport(scoreAgainst(gt, got)));

if (save) {
  const out = new URL(`fixtures/tan-van-xi.${model}.jpx`, root);
  writeFileSync(out, res.jpx);
  console.log(`\nsaved ${out.pathname}`);
}
