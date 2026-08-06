// Messenger webhook.
//
// Acks in milliseconds, converts afterwards. Meta retries a webhook it considers failed, and a
// ~13s conversion is far past its patience - so the work happens after the response and the
// shared queue dedups on the message id, making a retry join the run in progress.
import {
  configFromEnv, verifyChallenge, verifySignature, parseEvents, transport,
} from "@/lib/messenger/messenger.ts";
import { handleIncoming, after, sharedQueue } from "@/lib/chat/handle.ts";
import type { Tier } from "@/lib/pipeline.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Meta's setup handshake: echo hub.challenge as PLAIN TEXT. JSON fails verification. */
export async function GET(req: Request): Promise<Response> {
  const cfg = configFromEnv();
  const challenge = verifyChallenge(new URL(req.url), cfg);
  if (challenge === null) {
    return new Response("verification failed", { status: 403 });
  }
  return new Response(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const cfg = configFromEnv();
  // Raw bytes: the signature is over what arrived, not over a re-serialization of it.
  const raw = await req.text();

  if (cfg.appSecret) {
    if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
      return new Response("bad signature", { status: 401 });
    }
  } else {
    console.warn("[messenger] MESSENGER_APP_SECRET is not set - accepting webhooks UNVERIFIED");
  }

  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    // 400 rather than 500: a body Meta cannot have sent is not worth retrying.
    return new Response("body was not JSON", { status: 400 });
  }

  const messages = parseEvents(body);
  const tier: Tier = (process.env.DEFAULT_TIER as Tier) === "paid" ? "paid" : "free";
  const tx = transport(cfg);

  // Meta expects 200 quickly and will resend anything slower. Every message is handled after
  // the response; the queue owns the concurrency limit.
  for (const msg of messages) after(handleIncoming(msg, tx, tier));

  // Always 200. A non-2xx makes Meta retry, and repeatedly failing eventually unsubscribes the
  // app from the page - so an event we could not act on is acknowledged, not rejected.
  return Response.json({ ok: true, handled: messages.length, ...sharedQueue.stats });
}
