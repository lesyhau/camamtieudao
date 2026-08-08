// Image upload -> CamAmDoc, for the web page.
//
// Returns the whole document rather than rendered text: the browser can lay notes out in a
// grid, switch mapping and verse, and download JSON without asking the server again. One
// upload, one conversion.
import { convertFree } from "@/lib/pipeline.ts";
import { sharedQueue } from "@/lib/chat/handle.ts";
import { QueueFullError } from "@/lib/queue.ts";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Per-IP rate limit.
 *
 * Conversion costs ~13s of CPU on a 2-vCPU box, and this endpoint is public and unauthenticated
 * - without a limit one script can occupy the machine indefinitely. In-memory and per-process,
 * which is enough for a single container; a second replica would need shared state.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number(process.env.CONVERT_RATE_LIMIT ?? 6);
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic sweep so the map cannot grow without bound on a long-lived process.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return recent.length > RATE_MAX;
}

function clientIp(req: Request): string {
  // nginx sets X-Forwarded-For; the left-most entry is the original client.
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return Response.json(
      { error: "Bạn gửi hơi nhanh. Đợi một phút rồi thử lại nhé." },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  let bytes: Uint8Array;
  let mime: string;
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return Response.json({ error: "Chưa có ảnh nào được gửi lên." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Ảnh lớn quá (tối đa 20MB)." }, { status: 413 });
    }
    bytes = new Uint8Array(await file.arrayBuffer());
    mime = file.type || "image/jpeg";
  } catch {
    return Response.json({ error: "Không đọc được dữ liệu tải lên." }, { status: 400 });
  }

  // Content hash as the dedup key: the same image submitted twice - a double-click, a retry,
  // two people with the same sheet - is one conversion, and the second caller joins the first.
  const key = createHash("sha256").update(bytes).digest("hex");

  // NDJSON, streamed: one `{"step":...}` line per stage, then one final line carrying either
  // the document or an error. A conversion is ~20s of silence otherwise, and the browser can
  // read a growing text body incrementally - which is what lets the upload keep XHR (the only
  // transport that reports upload progress) instead of moving to fetch and losing it.
  //
  // The status is always 200, even for a failure: by the time a stage fails the headers are
  // long gone. The error travels in the last line, and the client reads it from there.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        // The dedup key means a second caller with the same image joins the first conversion
        // in flight - so this callback may fire for work another request started. That is
        // fine: the stages are the same, and the steps it reports are still true.
        const result = await sharedQueue.submit(key, () => convertFree(bytes, mime, (step) => send({ step })));
        send({ doc: result.doc, polished: result.polished, ms: result.ms, tier: result.tier });
      } catch (e) {
        send({ error: messageFor(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // nginx is configured with proxy_buffering off, but this says so at the response level
      // too - a buffering proxy would hold every step until the body ended, which is exactly
      // the silence this endpoint exists to break.
      "x-accel-buffering": "no",
    },
  });
}

function messageFor(e: unknown): string {
  if (e instanceof QueueFullError) return "Đang xử lý hơi nhiều. Bạn đợi một chút rồi thử lại nhé.";
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[convert] failed", e);
  if (/PDF/i.test(msg)) return "Chưa đọc được file PDF. Bạn gửi ảnh PNG/JPEG nhé.";
  return "Chưa đọc được bản nhạc này. Thử ảnh rõ hơn, đủ sáng và thẳng góc nhé.";
}
