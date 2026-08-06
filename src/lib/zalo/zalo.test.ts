import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifySignature, candidates } from "./verify.ts";
import { parseEvent, classify } from "./events.ts";
import { splitMessage } from "./client.ts";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const base = { rawBody: '{"a":1}', timestamp: "1700000000", appId: "app123", oaSecret: "s3cret" };

test("both reported signature formulas are accepted while the docs are unconfirmed", () => {
  assert.ok(verifySignature({ ...base, signature: sha(base.rawBody + base.timestamp + base.oaSecret) }));
  assert.ok(verifySignature({ ...base, signature: sha(base.appId + base.rawBody + base.timestamp + base.oaSecret) }));
});

test("pinning the mode rejects the other formula", () => {
  const a = sha(base.rawBody + base.timestamp + base.oaSecret);
  const b = sha(base.appId + base.rawBody + base.timestamp + base.oaSecret);
  assert.ok(verifySignature({ ...base, signature: a, mode: "a" }));
  assert.ok(!verifySignature({ ...base, signature: b, mode: "a" }));
  assert.ok(verifySignature({ ...base, signature: b, mode: "b" }));
});

test("the mac= prefix and casing are tolerated", () => {
  const a = sha(base.rawBody + base.timestamp + base.oaSecret);
  assert.ok(verifySignature({ ...base, signature: `mac=${a.toUpperCase()}` }));
});

test("a wrong secret, a wrong body, or junk all fail", () => {
  const a = sha(base.rawBody + base.timestamp + base.oaSecret);
  assert.ok(!verifySignature({ ...base, oaSecret: "wrong", signature: a }));
  assert.ok(!verifySignature({ ...base, rawBody: '{"a":2}', signature: a }));
  assert.ok(!verifySignature({ ...base, signature: "not-a-digest" }));
  assert.ok(!verifySignature({ ...base, signature: "" }));
});

test("candidates differ, so the two formulas are genuinely distinguishable", () => {
  const c = candidates(base);
  assert.notEqual(c.a, c.b);
});

test("an image event yields sender, message id and url", () => {
  const evt = parseEvent({
    app_id: "app", event_name: "user_send_image", timestamp: "1700000000",
    sender: { id: "u1" },
    message: { msg_id: "m1", attachments: [{ type: "image", payload: { url: "https://x/y.jpg" } }] },
  });
  assert.deepEqual(
    { s: evt.senderId, m: evt.messageId, u: evt.imageUrl, e: evt.eventName },
    { s: "u1", m: "m1", u: "https://x/y.jpg", e: "user_send_image" },
  );
  assert.deepEqual(classify(evt), { kind: "image", url: "https://x/y.jpg" });
});

test("an image url is found even when the nesting differs from the guess", () => {
  // The exact nesting is unconfirmed, so the reader hunts rather than asserting a path.
  for (const message of [
    { photo_url: "https://x/a.png" },
    { attachment: { payload: { url: "https://x/b.jpeg" } } },
    { attachments: [{ payload: { thumbnail: "https://x/c.webp" } }] },
  ]) {
    const evt = parseEvent({ sender: { id: "u" }, message });
    assert.equal(classify(evt).kind, "image", JSON.stringify(message));
  }
});

test("a text event classifies as text", () => {
  const evt = parseEvent({ sender: { id: "u1" }, message: { msg_id: "m", text: "chào" } });
  assert.deepEqual(classify(evt), { kind: "text", text: "chào" });
});

test("an unrecognised payload is ignored, never thrown", () => {
  // Throwing would 500, and Zalo retries a failed webhook - an endless loop over a payload we
  // will never understand.
  for (const junk of [null, undefined, 42, "hello", {}, { event_name: "follow" }]) {
    assert.doesNotThrow(() => classify(parseEvent(junk)));
  }
  assert.equal(classify(parseEvent({ event_name: "follow" })).kind, "ignore");
});

test("a long reply splits on blank lines, never mid-line", () => {
  const text = Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(60)}`).join("\n\n");
  const parts = splitMessage(text, 500);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 500, `part is ${p.length}`);
  assert.equal(parts.join("\n\n").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
});

test("a single over-long line is hard-split rather than dropped", () => {
  const parts = splitMessage("y".repeat(1200), 500);
  assert.equal(parts.join("").length, 1200);
});
