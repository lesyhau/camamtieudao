// Facebook Messenger Platform adapter.
//
// Unlike Zalo, this contract is unambiguous and documented: the webhook is signed with
// X-Hub-Signature-256 (HMAC-SHA256 of the raw body, keyed by the app secret), and the payload
// envelope is a fixed page/entry/messaging shape. So this asserts the schema rather than
// hunting for fields the way the Zalo reader has to.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Incoming, Transport } from "../chat/handle.ts";

/** Graph API version. v25.0 is current (Feb 2026); Meta supports each for ~2 years. */
const GRAPH_VERSION = process.env.MESSENGER_GRAPH_VERSION || "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Messenger truncates past 2000 characters. */
export const MAX_MESSAGE_CHARS = 2000;

export interface MessengerConfig {
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): MessengerConfig {
  return {
    pageAccessToken: env.MESSENGER_PAGE_TOKEN ?? "",
    appSecret: env.MESSENGER_APP_SECRET ?? "",
    verifyToken: env.MESSENGER_VERIFY_TOKEN ?? "",
  };
}

// ---------------------------------------------------------------- verification

/**
 * The one-off handshake Meta performs when you save a webhook URL: it GETs with a challenge
 * and expects the challenge echoed back verbatim, as plain text. Returning JSON fails it.
 */
export function verifyChallenge(url: URL, cfg: MessengerConfig): string | null {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && cfg.verifyToken && token === cfg.verifyToken) {
    return challenge ?? "";
  }
  return null;
}

/** `sha256=<hex>` over the RAW body bytes. Re-serialized JSON will not match. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const [algo, provided] = header.split("=");
  if (algo !== "sha256" || !provided) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

// ---------------------------------------------------------------- events

interface MessagingEvent {
  sender?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
}

/**
 * One webhook POST can carry several entries, each with several messaging events, so this
 * returns a list rather than a single message.
 *
 * Echoes are dropped. `is_echo` marks messages the PAGE sent - including our own replies - and
 * acting on them makes the bot answer itself in a loop that costs real CPU. Delivery and read
 * receipts have no `message` and fall out naturally.
 */
export function parseEvents(body: unknown): Incoming[] {
  const root = body as { object?: string; entry?: Array<{ messaging?: MessagingEvent[] }> };
  if (root?.object !== "page" || !Array.isArray(root.entry)) return [];

  const out: Incoming[] = [];
  for (const entry of root.entry) {
    for (const evt of entry.messaging ?? []) {
      const userId = evt.sender?.id;
      const msg = evt.message;
      if (!userId || !msg || msg.is_echo) continue;

      const image = (msg.attachments ?? []).find(
        (a) => a.type === "image" && typeof a.payload?.url === "string",
      );
      if (!image && !msg.text) continue;

      out.push({ userId, messageId: msg.mid, text: msg.text, imageUrl: image?.payload?.url });
    }
  }
  return out;
}

// ---------------------------------------------------------------- transport

export class MessengerApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Messenger API ${status}: ${body.slice(0, 300)}`);
    this.name = "MessengerApiError";
    this.status = status;
    this.body = body;
  }
}

/** Splits on blank lines, then lines, so a cam am system is never cut mid-phrase. */
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

async function graphPost(cfg: MessengerConfig, body: unknown): Promise<void> {
  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(cfg.pageAccessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new MessengerApiError(res.status, await res.text());
}

export function transport(cfg: MessengerConfig): Transport {
  return {
    async send(userId, text) {
      for (const part of splitMessage(text)) {
        // messaging_type RESPONSE is what keeps this inside the standard 24-hour window: it
        // declares the message as a reply to the user's own, which needs no message tag.
        await graphPost(cfg, {
          recipient: { id: userId },
          messaging_type: "RESPONSE",
          message: { text: part },
        });
      }
    },

    async typing(userId) {
      // Conversion takes ~13s. Without this the bot looks dead and people send the image again.
      await graphPost(cfg, { recipient: { id: userId }, sender_action: "typing_on" });
    },

    async fetchImage(url) {
      const res = await fetch(url);
      if (!res.ok) throw new MessengerApiError(res.status, await res.text());
      const max = 20 * 1024 * 1024;
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > max) throw new Error(`image is ${declared} bytes, over the ${max} limit`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > max) throw new Error(`image is ${bytes.byteLength} bytes, over the ${max} limit`);
      const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      return { bytes, mime };
    },
  };
}
