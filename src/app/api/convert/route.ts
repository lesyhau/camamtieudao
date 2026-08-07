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

  try {
    const result = await sharedQueue.submit(key, () => convertFree(bytes, mime));
    return Response.json({ doc: result.doc, ms: result.ms, tier: result.tier });
  } catch (e) {
    if (e instanceof QueueFullError) {
      return Response.json(
        { error: "Đang xử lý hơi nhiều. Bạn đợi một chút rồi thử lại nhé." },
        { status: 503, headers: { "retry-after": "30" } },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[convert] failed", e);
    if (/PDF/i.test(msg)) {
      return Response.json({ error: "Chưa đọc được file PDF. Bạn gửi ảnh PNG/JPEG nhé." }, { status: 415 });
    }
    return Response.json(
      { error: "Chưa đọc được bản nhạc này. Thử ảnh rõ hơn, đủ sáng và thẳng góc nhé." },
      { status: 422 },
    );
  }
}
