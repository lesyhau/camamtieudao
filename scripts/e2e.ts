// End-to-end through the real pipeline: image bytes -> CamAmDoc -> the reply Zalo would send.
import { readFileSync } from "node:fs";
import { convertFree, replyFor, replyForError } from "../src/lib/pipeline.ts";
import { splitMessage } from "../src/lib/zalo/client.ts";
import { WorkQueue } from "../src/lib/queue.ts";

const png = readFileSync(new URL("../fixtures/tan-van-xi.png", import.meta.url));
const q = new WorkQueue({ concurrency: 2 });

// Two submissions with the same key: exactly what a Zalo webhook retry looks like.
const key = "msg-1";
const [a, b] = await Promise.all([
  q.submit(key, () => convertFree(new Uint8Array(png), "image/png")),
  q.submit(key, () => convertFree(new Uint8Array(png), "image/png")),
]);
console.log(`dedup: same result object = ${a === b}  (a retry must not convert twice)`);

const reply = replyFor(a);
const parts = splitMessage(reply);
console.log(`reply: ${reply.length} chars -> ${parts.length} Zalo message(s), longest ${Math.max(...parts.map((p) => p.length))}\n`);
console.log(parts[0].split("\n").slice(0, 8).join("\n"));
console.log("\n--- error replies are in Vietnamese, no stack traces:");
console.log("  " + replyForError(new Error("PDF input is not supported yet")));
console.log("  " + replyForError(new Error("image is 99999999 bytes, over the 20971520 limit")));
console.log("  " + replyForError(new Error("something exploded")));
