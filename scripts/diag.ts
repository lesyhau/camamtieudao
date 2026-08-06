import { readFileSync } from "node:fs";
import { parseJpwabc } from "../src/lib/camam/jpwabc.ts";
import { parseJpx } from "../src/lib/camam/jpx.ts";
import { build } from "../src/lib/camam/build.ts";
const root = new URL("../", import.meta.url);
const gt = build(parseJpwabc(readFileSync(new URL("fixtures/tan-van-xi.jpwabc", root), "utf8")), "gt");
for (const m of ["gemini-3.6-flash", "gemini-3.1-pro-preview"]) {
  const d = build(parseJpx(readFileSync(new URL(`fixtures/tan-van-xi.${m}.jpx`, root), "utf8")), m);
  const ps = d.notes.filter(n => n.p !== null).map(n => n.p!);
  const j = (n: {digit:number;octave:number}) => `${n.digit}${n.octave>0?"'".repeat(n.octave):n.octave<0?",".repeat(-n.octave):""}`;
  console.log(`\n${m}:`);
  console.log(`  pitch range p ${Math.min(...ps)}..${Math.max(...ps)}   (truth ${gt.pitchRange.lowest!.p}..${gt.pitchRange.highest!.p})`);
  console.log(`  bandOffset anchor2 ${d.mappings.anchor2.bandOffset} (truth ${gt.mappings.anchor2.bandOffset}), bands ${d.mappings.anchor2.bandsUsed} (truth ${gt.mappings.anchor2.bandsUsed})`);
  const lo = Math.min(...ps);
  const outliers = d.notes.filter(n => n.p !== null && n.p <= lo + 1);
  console.log(`  notes at/near the extreme low (${outliers.length}): ${outliers.slice(0,8).map(n=>`#${n.id} ${j(n)}`).join(", ")}`);
  const hi = Math.max(...ps);
  const highs = d.notes.filter(n => n.p !== null && n.p >= hi - 1);
  console.log(`  notes at/near the extreme high (${highs.length}): ${highs.slice(0,8).map(n=>`#${n.id} ${j(n)}`).join(", ")}`);
  // how many octave marks total vs truth
  const oct = (x: typeof d) => x.notes.filter(n => n.octave !== 0).length;
  console.log(`  notes carrying an octave mark: ${oct(d)}  (truth ${oct(gt)})`);
}
