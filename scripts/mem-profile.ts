// Where does one conversion's memory actually go?
//
//   node scripts/mem-profile.ts [image] [--sample 100]
//
// Run this ON THE TARGET HOST. Every earlier measurement of this bug was taken on Windows,
// where process.memoryUsage().rss reports the working set - it read 10-18GB for work the Linux
// VM does in 3.6GB, which is why four hypotheses in a row were tested against a number that
// meant nothing.
//
// It samples VmRSS and VmHWM from /proc (the kernel's own accounting, not V8's) against a phase
// label, and wraps the OCR backend so the timeline can be read against OCR call boundaries.
// The distinction it is built to draw:
//
//   - RSS climbing in step with OCR calls and never coming down  -> something accumulates
//   - RSS climbing inside ONE call                               -> a single allocation is huge
//   - heapUsed flat while rss climbs                             -> native, not V8
//   - external/arrayBuffers tracking rss                         -> Buffers, which GC can free
//   - neither tracking rss                                       -> canvas/ORT native, which it cannot
import { readFileSync, writeSync } from "node:fs";
import { decodeToBinary } from "../src/lib/omr/decode.ts";
import { recognizeJianpu } from "../src/lib/omr/jianpu.ts";
import { connectedComponents } from "../src/lib/omr/ccl.ts";
import { paddleOcrBackend, omrProfile } from "../src/lib/omr/paddleocr.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const image = args[0] ?? new URL("../fixtures/tan-van-xi.png", import.meta.url).pathname;
const every = Number(process.argv.find((a) => a.startsWith("--sample="))?.split("=")[1] ?? 100);

/** VmRSS/VmHWM in MB from /proc/self/status - the kernel's number, not the runtime's. */
function proc(): { rss: number; hwm: number } {
  try {
    const s = readFileSync("/proc/self/status", "utf8");
    const kb = (k: string) => Number(/(\d+)/.exec(s.split(`${k}:`)[1]?.split("\n")[0] ?? "")?.[1] ?? 0) / 1024;
    return { rss: kb("VmRSS"), hwm: kb("VmHWM") };
  } catch {
    // Not Linux. The numbers below are then V8's, and the header says so.
    const m = process.memoryUsage();
    return { rss: m.rss / 1048576, hwm: 0 };
  }
}

let phase = "start";
let ocrCalls = 0;
const MB = 1048576;
const samples: Array<{ t: number; phase: string; calls: number; rss: number; heap: number; ext: number; ab: number }> = [];
const t0 = Date.now();

// Printed LIVE, with writeSync so nothing is buffered: the interesting runs end in SIGKILL from
// the OOM killer, and a buffered timeline dies with the process. This is why the first attempt
// showed only "Killed" - the whole climb was still sitting in a pipe.
let lastPrinted = -1e9;
function sample() {
  const m = process.memoryUsage();
  const s = {
    t: Date.now() - t0,
    phase,
    calls: ocrCalls,
    rss: proc().rss,
    heap: m.heapUsed / MB,
    ext: m.external / MB,
    ab: m.arrayBuffers / MB,
  };
  samples.push(s);
  if (s.t - lastPrinted >= 250) {
    lastPrinted = s.t;
    writeSync(1,
      `  ${String(s.t).padStart(7)}  ${s.phase.padEnd(18)} ${String(s.calls).padStart(4)} ` +
      `rss ${s.rss.toFixed(0).padStart(6)}  heap ${s.heap.toFixed(0).padStart(5)}  ` +
      `ext ${s.ext.toFixed(0).padStart(5)}  ab ${s.ab.toFixed(0).padStart(5)}\n`);
  }
}
const timer = setInterval(sample, every);
timer.unref?.();

/** Wraps every backend method so the timeline can be read against call boundaries. */
function traced<T extends object>(backend: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(backend as Record<string, unknown>)) {
    if (typeof v !== "function") { out[k] = v; continue; }
    out[k] = async (...a: unknown[]) => {
      ocrCalls++;
      const was = phase;
      phase = `ocr:${k}`;
      // The batch size matters: an array argument is how many crops are alive at once.
      const n = Array.isArray(a[0]) ? a[0].length : 1;
      const before = proc().rss;
      try {
        return await (v as (...x: unknown[]) => Promise<unknown>).apply(backend, a);
      } finally {
        const after = proc().rss;
        console.log(
          `  ${String(ocrCalls).padStart(3)} ${k.padEnd(18)} n=${String(n).padStart(4)}  ` +
          `rss ${before.toFixed(0)} -> ${after.toFixed(0)} MB  (${after - before >= 0 ? "+" : ""}${(after - before).toFixed(0)})`,
        );
        phase = was;
      }
    };
  }
  return out as T;
}

async function main() {
  const isLinux = process.platform === "linux";
  console.log(`node ${process.version} on ${process.platform}, ${image}`);
  console.log(isLinux
    ? "rss = VmRSS from /proc/self/status (kernel resident set)"
    : "NOT LINUX - rss is process.memoryUsage().rss, which on Windows is the working set and is NOT comparable");
  sample();

  const bytes = new Uint8Array(readFileSync(image));
  console.log(`\nimage ${(bytes.length / MB).toFixed(1)} MB`);

  phase = "decode";
  const mark = (label: string) => console.log(`${label.padEnd(22)} rss ${proc().rss.toFixed(0)} MB  hwm ${proc().hwm.toFixed(0)} MB`);
  mark("before decode");
  const bin = await decodeToBinary(bytes);
  mark("after decode");
  console.log(`   binary ${bin.w}x${bin.h} = ${((bin.w * bin.h) / MB).toFixed(1)} MB per full-size mask`);

  // The one stage of recognizeJianpu that can be called from outside it. Running it here first
  // splits the question in two: if RSS explodes on this line the labelling is the problem, and
  // if it survives, the problem is downstream of it.
  phase = "ccl";
  const comps = connectedComponents(bin, 4);
  mark("after ccl");
  console.log(`   ${comps.length} components`);

  phase = "recognize";
  const rec = await recognizeJianpu(bin, traced(paddleOcrBackend()));
  mark("after recognize");
  console.log(`   ${rec.rows?.length ?? "?"} rows, ocr profile ${JSON.stringify(omrProfile())}`);

  phase = "done";
  sample();

  // Does any of it come back on its own?
  if (global.gc) { global.gc(); sample(); mark("after forced gc"); }
  await new Promise((r) => setTimeout(r, 2000));
  sample();
  mark("2s later");

  clearInterval(timer);
  report();
}

function report() {
  const peak = samples.reduce((a, b) => (b.rss > a.rss ? b : a));
  console.log(`\npeak rss ${peak.rss.toFixed(0)} MB at ${peak.t}ms in phase "${peak.phase}" (after ${peak.calls} ocr calls)`);
  console.log(`   at peak: heapUsed ${peak.heap.toFixed(0)} MB, external ${peak.ext.toFixed(0)} MB, arrayBuffers ${peak.ab.toFixed(0)} MB`);
  console.log(`   unaccounted (rss - heap - external): ${(peak.rss - peak.heap - peak.ext).toFixed(0)} MB\n`);

  // One line per 500ms, so a 15s run prints 30 lines rather than 150.
  console.log("    t(ms)  phase              calls    rss    heap     ext      ab");
  let last = -1e9;
  for (const s of samples) {
    if (s.t - last < 500) continue;
    last = s.t;
    console.log(
      `  ${String(s.t).padStart(7)}  ${s.phase.padEnd(18)} ${String(s.calls).padStart(5)} ` +
      `${s.rss.toFixed(0).padStart(6)}  ${s.heap.toFixed(0).padStart(6)} ${s.ext.toFixed(0).padStart(7)} ${s.ab.toFixed(0).padStart(7)}`,
    );
  }
}

await main();
