// Paste a link, get the image back.
//
// The bytes are returned to the browser rather than converted here on purpose: the page then
// holds a File exactly as if the user had dropped one, so preview, replace, delete, the content
// hash used for deduplication and the conversion itself all work unchanged. One new endpoint
// instead of a second path through the whole flow.
//
// See src/lib/fetchimage.ts for why the URL is checked as carefully as it is.
import { FetchImageError, fetchImage } from "@/lib/fetchimage.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Its own limit, separate from /api/convert.
 *
 * Fetching is far cheaper than converting, so the ceiling is higher - but it is an outbound
 * request to an address the caller chooses, which is exactly the primitive someone would want
 * for scanning a network, so it cannot be unlimited either.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number(process.env.FETCH_IMAGE_RATE_LIMIT ?? 20);
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return recent.length > RATE_MAX;
}

const clientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

export async function POST(req: Request): Promise<Response> {
  if (rateLimited(clientIp(req))) {
    return Response.json(
      { error: "Bạn gửi hơi nhanh. Đợi một phút rồi thử lại nhé." },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  let url: unknown;
  try {
    url = (await req.json())?.url;
  } catch {
    return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "Chưa có đường dẫn nào." }, { status: 400 });
  }
  // A link long enough to be interesting is a link long enough to be an attack surface.
  if (url.length > 2048) {
    return Response.json({ error: "Đường dẫn quá dài." }, { status: 400 });
  }

  try {
    const { bytes, mime } = await fetchImage(url);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": mime,
        "content-length": String(bytes.length),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof FetchImageError) {
      // The detail goes to the log; the reader gets the sentence written for them. Reflecting
      // the detail would turn the refusals into a network scanner with a readable oracle.
      console.warn("[fetch-image]", e.message);
      return Response.json({ error: e.userMessage }, { status: 400 });
    }
    console.error("[fetch-image] unexpected", e);
    return Response.json({ error: "Không tải được ảnh từ đường dẫn này." }, { status: 500 });
  }
}
