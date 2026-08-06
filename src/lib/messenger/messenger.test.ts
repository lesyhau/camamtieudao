import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyChallenge, verifySignature, parseEvents, splitMessage } from "./messenger.ts";

const cfg = { pageAccessToken: "tok", appSecret: "s3cret", verifyToken: "vtok" };
const sign = (body: string, secret = cfg.appSecret) =>
  "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

test("the setup handshake echoes hub.challenge only when the token matches", () => {
  const url = (t: string) =>
    new URL(`https://x/api/webhook/messenger?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=CH`);
  assert.equal(verifyChallenge(url("vtok"), cfg), "CH");
  assert.equal(verifyChallenge(url("wrong"), cfg), null);
  assert.equal(verifyChallenge(new URL("https://x/?hub.mode=unsubscribe&hub.verify_token=vtok"), cfg), null);
});

test("an unset verify token never passes the handshake", () => {
  // Otherwise an empty configured token would match an empty supplied one.
  const url = new URL("https://x/?hub.mode=subscribe&hub.verify_token=&hub.challenge=CH");
  assert.equal(verifyChallenge(url, { ...cfg, verifyToken: "" }), null);
});

test("the signature is HMAC-SHA256 of the raw body", () => {
  const body = '{"object":"page","entry":[]}';
  assert.ok(verifySignature(body, sign(body), cfg.appSecret));
  assert.ok(!verifySignature(body, sign(body, "other"), cfg.appSecret));
  assert.ok(!verifySignature('{"object":"page","entry":[ ]}', sign(body), cfg.appSecret));
  assert.ok(!verifySignature(body, "sha1=abc", cfg.appSecret));
  assert.ok(!verifySignature(body, null, cfg.appSecret));
  assert.ok(!verifySignature(body, sign(body), ""));
});

const pageEvent = (messaging: unknown[]) => ({ object: "page", entry: [{ messaging }] });

test("an image message yields sender, mid and url", () => {
  const msgs = parseEvents(pageEvent([{
    sender: { id: "u1" },
    message: { mid: "m1", attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }] },
  }]));
  assert.deepEqual(msgs, [{ userId: "u1", messageId: "m1", text: undefined, imageUrl: "https://cdn/x.jpg" }]);
});

test("echoes are dropped, or the bot answers its own replies forever", () => {
  // is_echo marks messages the PAGE sent - our own replies included. Acting on them is an
  // infinite loop that spends real CPU on every turn.
  assert.deepEqual(parseEvents(pageEvent([{
    sender: { id: "page" },
    message: { mid: "m", is_echo: true, text: "cảm âm..." },
  }])), []);
});

test("delivery and read receipts are ignored", () => {
  assert.deepEqual(parseEvents(pageEvent([
    { sender: { id: "u" }, delivery: { mids: ["m"] } },
    { sender: { id: "u" }, read: { watermark: 1 } },
  ])), []);
});

test("several entries and several messaging events in one POST are all returned", () => {
  // Meta batches; handling only the first would silently drop messages under load.
  const msgs = parseEvents({
    object: "page",
    entry: [
      { messaging: [{ sender: { id: "a" }, message: { mid: "1", text: "x" } }] },
      { messaging: [
        { sender: { id: "b" }, message: { mid: "2", text: "y" } },
        { sender: { id: "c" }, message: { mid: "3", text: "z" } },
      ] },
    ],
  });
  assert.deepEqual(msgs.map((m) => m.userId), ["a", "b", "c"]);
});

test("a non-page object is not ours", () => {
  assert.deepEqual(parseEvents({ object: "instagram", entry: [] }), []);
  for (const junk of [null, undefined, 42, "s", {}, []]) assert.deepEqual(parseEvents(junk), []);
});

test("a non-image attachment does not become an imageUrl", () => {
  const msgs = parseEvents(pageEvent([{
    sender: { id: "u" },
    message: { mid: "m", attachments: [{ type: "audio", payload: { url: "https://cdn/a.mp3" } }] },
  }]));
  assert.deepEqual(msgs, []);
});

test("a long reply splits within Messenger's 2000-character limit", () => {
  const text = Array.from({ length: 60 }, (_, i) => `dòng ${i} ${"do re mi ".repeat(8)}`).join("\n\n");
  const parts = splitMessage(text);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 2000);
});
