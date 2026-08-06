// What happens when a user sends us something, independent of which chat platform they used.
//
// Zalo and Messenger differ only in how a message arrives and how a reply goes out. Everything
// between - fetch the image, queue it, convert, render - is the same, and lives here so the
// two adapters cannot drift into behaving differently.
import { WorkQueue } from "../queue.ts";
import { convert, replyFor, replyForError, type Tier } from "../pipeline.ts";

/** A message from any platform, reduced to what this app acts on. */
export interface Incoming {
  /** Platform user id. The identity a tier and, later, a credit balance hangs off. */
  userId: string;
  /** Stable message id, used as the dedup key so a platform retry joins rather than re-runs. */
  messageId?: string;
  text?: string;
  imageUrl?: string;
}

export interface Transport {
  /** Send a reply. Splitting to the platform's length limit is the adapter's business. */
  send(userId: string, text: string): Promise<void>;
  /** Download an attachment the platform pointed at. */
  fetchImage(url: string): Promise<{ bytes: Uint8Array; mime: string }>;
  /** Optional "typing" indicator - a 13s wait with no feedback reads as a broken bot. */
  typing?(userId: string): Promise<void>;
}

// One queue per process, so concurrency is a real limit across every platform rather than
// per-request or per-adapter.
export const sharedQueue = new WorkQueue({
  concurrency: Number(process.env.OMR_CONCURRENCY ?? 2),
  maxPending: Number(process.env.OMR_MAX_PENDING ?? 32),
});

export const PROMPT_FOR_IMAGE =
  "Bạn gửi ảnh chụp bản nhạc số (giản phổ) cho mình nhé, mình sẽ chuyển thành cảm âm.";

/**
 * Handles one incoming message to completion. Callers should NOT await this before acking the
 * webhook - conversion takes ~13s and every platform times out long before that.
 */
export async function handleIncoming(msg: Incoming, tx: Transport, tier: Tier = "free"): Promise<void> {
  if (!msg.imageUrl) {
    if (msg.text) await tx.send(msg.userId, PROMPT_FOR_IMAGE);
    return;
  }

  // Fire and forget: a failed typing indicator must not cost the user their conversion.
  void tx.typing?.(msg.userId).catch(() => {});

  try {
    const { bytes, mime } = await tx.fetchImage(msg.imageUrl);
    // Dedup key: the message id if the platform gave one, else the URL. Two messages carrying
    // the same image are the same conversion anyway.
    const key = msg.messageId ?? msg.imageUrl;
    const result = await sharedQueue.submit(key, () => convert(bytes, mime, tier));
    await tx.send(msg.userId, replyFor(result));
  } catch (e) {
    console.error("[chat] conversion failed", e);
    // Best effort: if the reply itself fails there is nothing further to try.
    await tx.send(msg.userId, replyForError(e)).catch(() => {});
  }
}

/**
 * Runs background work without the handler awaiting it.
 *
 * An unhandled rejection terminates a Node process, so one malformed image would otherwise
 * take the whole service down.
 */
export function after(work: Promise<unknown>): void {
  void work.catch((e) => console.error("[chat] background task failed", e));
}
