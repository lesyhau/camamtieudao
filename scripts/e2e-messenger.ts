// Drives the Messenger path with a fake transport: real parse, real signature, real pipeline,
// real dedup - only the network is stubbed.
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { parseEvents, verifySignature } from "../src/lib/messenger/messenger.ts";
import { handleIncoming, type Transport } from "../src/lib/chat/handle.ts";

const png = readFileSync(new URL("../fixtures/tan-van-xi.png", import.meta.url));
const secret = "app-secret";

const body = JSON.stringify({
  object: "page",
  entry: [{ messaging: [
    { sender: { id: "u1" }, message: { mid: "m1", attachments: [{ type: "image", payload: { url: "https://cdn/sheet.png" } }] } },
    { sender: { id: "page" }, message: { mid: "m2", is_echo: true, text: "our own reply" } },
    { sender: { id: "u2" }, message: { mid: "m3", text: "chào bạn" } },
  ] }],
});
const sig = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
console.log("signature verifies:", verifySignature(body, sig, secret));

const msgs = parseEvents(JSON.parse(body));
console.log(`parsed ${msgs.length} message(s) (the echo is dropped):`, msgs.map((m) => m.userId).join(", "));

const sent: Array<{ to: string; text: string }> = [];
let typing = 0;
const tx: Transport = {
  async send(to, text) { sent.push({ to, text }); },
  async typing() { typing++; },
  async fetchImage() { return { bytes: new Uint8Array(png), mime: "image/png" }; },
};

const t0 = Date.now();
await Promise.all(msgs.map((m) => handleIncoming(m, tx)));
console.log(`handled in ${((Date.now() - t0) / 1000).toFixed(1)}s, typing indicators: ${typing}\n`);

for (const s of sent) {
  console.log(`-> ${s.to}: ${s.text.split("\n").slice(0, 3).join(" / ").slice(0, 120)}…`);
}
