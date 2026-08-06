// Zalo OA webhook.
//
// Acks in milliseconds and does the work afterwards. Conversion takes ~13s; Zalo will not wait
// that long, it times out and RETRIES, and the retry lands while the first run is still going.
// The queue's dedup key is the message id, so a retry joins the run in progress instead of
// converting the same image a second time on a 2-vCPU box.
import { verifySignature, explain, type SignatureMode } from "@/lib/zalo/verify.ts";
import { parseEvent, classify } from "@/lib/zalo/events.ts";
import { fetchImage, sendText } from "@/lib/zalo/client.ts";
import { WorkQueue } from "@/lib/queue.ts";
import { convert, replyFor, replyForError, type Tier } from "@/lib/pipeline.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Conversion is CPU-bound and runs after the ack, so the route itself must not be reaped.
export const maxDuration = 300;

// Module scope: one queue for the process, so concurrency is a real limit rather than a
// per-request one. Two at a time on a 2-vCPU box leaves room for the event loop.
const queue = new WorkQueue({
  concurrency: Number(process.env.OMR_CONCURRENCY ?? 2),
  maxPending: Number(process.env.OMR_MAX_PENDING ?? 32),
});

const env = (k: string): string => process.env[k] ?? "";

export async function GET(): Promise<Response> {
  // Zalo's console pings the URL when you save it; answering keeps that check green.
  return Response.json({ ok: true, service: "camamtieudao", webhook: "zalo" });
}

export async function POST(req: Request): Promise<Response> {
  // The raw body, byte for byte. Re-serializing parsed JSON changes key order and whitespace,
  // and the signature is over the bytes that arrived.
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
    // One real event is enough to replace the defensive parser with an exact one, and to pin
    // ZALO_SIGNATURE_MODE. Off by default: payloads contain user ids.
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
    // Refusing to run unauthenticated would be safer, but it also makes the very first
    // handshake impossible to debug. Loud rather than silent.
    console.warn("[zalo] ZALO_OA_SECRET is not set - accepting webhooks WITHOUT verification");
  }

  const intent = classify(evt);
  const userId = evt.senderId;

  if (intent.kind === "ignore" || !userId) {
    return Response.json({ ok: true, ignored: intent.kind === "ignore" ? intent.why : "no sender" });
  }

  const token = env("ZALO_OA_ACCESS_TOKEN");
  const tier: Tier = (process.env.DEFAULT_TIER as Tier) === "paid" ? "paid" : "free";

  if (intent.kind === "text") {
    // Conversation handling proper (mapping switches, credits, help) comes with the credit
    // system. For now anything that is not an image gets a nudge toward sending one.
    after(sendText({ accessToken: token }, userId,
      "Bạn gửi ảnh chụp bản nhạc số (giản phổ) cho mình nhé, mình sẽ chuyển thành cảm âm."));
    return Response.json({ ok: true, handled: "text" });
  }

  // Dedup on the message id. Without one, fall back to the URL - two different messages
  // carrying the same image are the same conversion anyway.
  const key = evt.messageId ?? intent.url;

  after((async () => {
    try {
      const { bytes, mime } = await fetchImage(intent.url);
      const result = await queue.submit(key, () => convert(bytes, mime, tier));
      await sendText({ accessToken: token }, userId, replyFor(result));
    } catch (e) {
      console.error("[zalo] conversion failed", e);
      await sendText({ accessToken: token }, userId, replyForError(e)).catch(() => {});
    }
  })());

  return Response.json({ ok: true, queued: key, ...queue.stats });
}

/**
 * Runs work after the response without making the handler await it.
 *
 * A rejection here would otherwise be an unhandled rejection, which in Node terminates the
 * process - one malformed image would take the service down.
 */
function after(work: Promise<unknown>): void {
  void work.catch((e) => console.error("[zalo] background task failed", e));
}
