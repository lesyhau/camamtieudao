// Talking back to Zalo: send a message, fetch an attachment.
//
// The send endpoint and body shape are from secondary sources rather than the official docs
// (client-rendered), so `sendText` reports failures with the full response body - the first
// real send will say precisely what is wrong, which beats a silent no-op.

const API_BASE = "https://openapi.zalo.me/v3.0/oa";

export interface ZaloConfig {
  /** OA access token. Expires; refreshing it is a separate concern from sending. */
  accessToken: string;
}

export class ZaloApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Zalo API ${status}: ${body.slice(0, 300)}`);
    this.name = "ZaloApiError";
    this.status = status;
    this.body = body;
  }
}

/** Zalo caps a single message; longer replies are split rather than truncated. */
export const MAX_MESSAGE_CHARS = 2000;

/**
 * Splits on blank lines first, then single lines, so a cam am system is never cut mid-phrase.
 * A single line longer than the limit is hard-split as a last resort.
 */
export function splitMessage(text: string, limit = MAX_MESSAGE_CHARS): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let cur = "";
  const flush = (): void => { if (cur.trim()) out.push(cur.trimEnd()); cur = ""; };

  for (const para of text.split(/\n\n+/)) {
    if (cur.length + para.length + 2 <= limit) { cur += (cur ? "\n\n" : "") + para; continue; }
    flush();
    if (para.length <= limit) { cur = para; continue; }
    for (const line of para.split("\n")) {
      if (cur.length + line.length + 1 > limit) flush();
      if (line.length > limit) {
        for (let i = 0; i < line.length; i += limit) out.push(line.slice(i, i + limit));
        continue;
      }
      cur += (cur ? "\n" : "") + line;
    }
  }
  flush();
  return out.length ? out : [text.slice(0, limit)];
}

export async function sendText(cfg: ZaloConfig, userId: string, text: string): Promise<void> {
  for (const part of splitMessage(text)) {
    const res = await fetch(`${API_BASE}/message/cs`, {
      method: "POST",
      headers: { "content-type": "application/json", access_token: cfg.accessToken },
      body: JSON.stringify({ recipient: { user_id: userId }, message: { text: part } }),
    });
    const body = await res.text();
    if (!res.ok) throw new ZaloApiError(res.status, body);
    // Zalo answers 200 with an error object in the body; a non-zero `error` is still a failure.
    try {
      const j = JSON.parse(body) as { error?: number; message?: string };
      if (typeof j.error === "number" && j.error !== 0) throw new ZaloApiError(200, body);
    } catch (e) {
      if (e instanceof ZaloApiError) throw e; // not-JSON is tolerated; an error object is not
    }
  }
}

/** Downloads an attachment. Size-capped so a hostile or mistaken URL cannot exhaust memory. */
export async function fetchImage(url: string, maxBytes = 20 * 1024 * 1024): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new ZaloApiError(res.status, await res.text());

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`image is ${declared} bytes, over the ${maxBytes} limit`);

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error(`image is ${buf.byteLength} bytes, over the ${maxBytes} limit`);

  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  return { bytes: buf, mime };
}
