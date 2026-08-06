// Zalo OA webhook.
//
// Kept alongside the Messenger one - the OA application process is slow, so Messenger ships
// first - and both routes are thin: everything from "we have an image" onward lives in
// lib/chat/handle.ts, so the two platforms cannot drift into behaving differently.
//
// Unlike Messenger, two specifics here are UNCONFIRMED (see lib/zalo/verify.ts): the signature
// base string and the payload shape. Both are handled tolerantly until one real event settles
// them.
import { verifySignature, explain, type SignatureMode } from "@/lib/zalo/verify.ts";
import { parseEvent, classify } from "@/lib/zalo/events.ts";
import { fetchImage, sendText } from "@/lib/zalo/client.ts";
import { handleIncoming, after, sharedQueue, type Transport } from "@/lib/chat/handle.ts";
import type { Tier } from "@/lib/pipeline.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const env = (k: string): string => process.env[k] ?? "";

export async function GET(): Promise<Response> {
  // Zalo's console pings the URL when you save it; answering keeps that check green.
  return Response.json({ ok: true, service: "camamtieudao", webhook: "zalo" });
}

export async function POST(req: Request): Promise<Response> {
  // Raw bytes: the signature covers what arrived, not a re-serialization of it.
  const raw = await req.text();
  const signature = req.headers.get("x-zevent-signature") ?? "";
  const timestampHeader = req.headers.get("x-zevent-timestamp") ?? "";

  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    return Response.json({ ok: false, error: "body was not JSON" }, { status: 400 });
  }

  const evt = parseEvent(body);
  const timestamp = timestampHeader || evt.timestamp || "";
  const appId = env("ZALO_APP_ID");
  const oaSecret = env("ZALO_OA_SECRET");

  if (process.env.ZALO_LOG_RAW_EVENTS === "1") {
    // One real event replaces the defensive parser with an exact one and pins the signature
    // mode. Off by default: payloads carry user ids.
    console.log("[zalo] raw event", raw.slice(0, 4000));
    if (signature) console.log("[zalo]", explain({ rawBody: raw, signature, timestamp, appId, oaSecret }));
  }

  if (oaSecret) {
    const ok = verifySignature({
      rawBody: raw, signature, timestamp, appId, oaSecret,
      mode: (process.env.ZALO_SIGNATURE_MODE as SignatureMode) || "either",
    });
    if (!ok) return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  } else {
    // Refusing outright would be safer but makes the first handshake impossible to debug.
    console.warn("[zalo] ZALO_OA_SECRET is not set - accepting webhooks WITHOUT verification");
  }

  const intent = classify(evt);
  if (intent.kind === "ignore" || !evt.senderId) {
    return Response.json({ ok: true, ignored: intent.kind === "ignore" ? intent.why : "no sender" });
  }

  const token = env("ZALO_OA_ACCESS_TOKEN");
  const tx: Transport = {
    send: (userId, text) => sendText({ accessToken: token }, userId, text),
    fetchImage: (url) => fetchImage(url),
    // Zalo's OA API has no typing indicator equivalent worth relying on, so there is none.
  };

  const tier: Tier = (process.env.DEFAULT_TIER as Tier) === "paid" ? "paid" : "free";
  after(handleIncoming(
    { userId: evt.senderId, messageId: evt.messageId, text: intent.kind === "text" ? intent.text : undefined,
      imageUrl: intent.kind === "image" ? intent.url : undefined },
    tx, tier,
  ));

  return Response.json({ ok: true, ...sharedQueue.stats });
}
