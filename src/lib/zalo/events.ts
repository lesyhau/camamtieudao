// Reading a Zalo OA webhook event.
//
// The payload shape could not be confirmed from the official docs (client-rendered SPA), so
// this parses DEFENSIVELY rather than asserting a schema: it looks for an image URL in the
// several places the platform is reported to put one, and reports what it could not
// understand instead of throwing. An unknown event must never 500 - Zalo retries a failed
// webhook, and a retry loop over a payload we will never understand is worse than a shrug.
//
// Set ZALO_LOG_RAW_EVENTS=1 to log whole payloads; one real image event is enough to replace
// all of this with an exact reader.

export interface ZaloEvent {
  /** e.g. user_send_text, user_send_image. Absent on shapes we do not recognise. */
  eventName?: string;
  /** Zalo user id of the sender - the identity the free/paid tier hangs off. */
  senderId?: string;
  /** Stable per-message id. Used as the queue's dedup key, so a retry joins rather than re-runs. */
  messageId?: string;
  text?: string;
  /** First image attachment URL, if any. */
  imageUrl?: string;
  timestamp?: string;
}

type Json = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined;

const obj = (v: unknown): Json | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined;

/** First value found at any of the given dotted paths. */
function pick(root: Json, paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = root;
    for (const key of path.split(".")) {
      const o = obj(cur);
      if (!o) { cur = undefined; break; }
      cur = o[key];
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

/** Depth-first hunt for the first http(s) URL that looks like an image. */
function findImageUrl(node: unknown, depth = 0): string | undefined {
  if (depth > 6) return undefined;
  if (typeof node === "string") {
    return /^https?:\/\//.test(node) && /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(node) ? node : undefined;
  }
  if (Array.isArray(node)) {
    for (const v of node) { const hit = findImageUrl(v, depth + 1); if (hit) return hit; }
    return undefined;
  }
  const o = obj(node);
  if (!o) return undefined;
  // Prefer an explicit url/href/thumb before falling back to scanning everything.
  for (const k of ["url", "href", "payload", "attachments", "thumbnail"]) {
    if (k in o) { const hit = findImageUrl(o[k], depth + 1); if (hit) return hit; }
  }
  for (const v of Object.values(o)) { const hit = findImageUrl(v, depth + 1); if (hit) return hit; }
  return undefined;
}

export function parseEvent(body: unknown): ZaloEvent {
  const root = obj(body);
  if (!root) return {};

  const eventName = str(pick(root, ["event_name", "eventName", "event"]));
  const senderId = str(pick(root, ["sender.id", "sender.user_id", "user_id", "from_id", "sender_id"]));
  const messageId = str(pick(root, ["message.msg_id", "message.message_id", "msg_id", "message_id"]));
  const text = str(pick(root, ["message.text", "message.content", "text"]));
  const timestamp = str(pick(root, ["timestamp", "time", "ts"]));

  // The URL is looked for structurally first, then by scanning: an image event is reported to
  // carry it at message.attachments[].payload.url, but the exact nesting is unconfirmed.
  const direct = str(pick(root, [
    "message.attachments.0.payload.url",
    "message.attachment.payload.url",
    "message.photo_url",
    "message.image_url",
  ]));
  const imageUrl = direct ?? findImageUrl(root.message ?? root);

  return { eventName, senderId, messageId, text, imageUrl, timestamp };
}

/** What kind of turn this is, from the app's point of view. */
export type Intent =
  | { kind: "image"; url: string }
  | { kind: "text"; text: string }
  | { kind: "ignore"; why: string };

export function classify(evt: ZaloEvent): Intent {
  if (evt.imageUrl) return { kind: "image", url: evt.imageUrl };
  if (evt.text) return { kind: "text", text: evt.text };
  // Delivery receipts, follow/unfollow, anything unrecognised. Acked and dropped: retrying
  // would not make it comprehensible.
  return { kind: "ignore", why: evt.eventName ?? "unrecognised payload" };
}
