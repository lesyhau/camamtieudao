// A tiny in-process work queue with deduplication.
//
// Conversion takes ~13s single-threaded. A chat platform will not wait that long for a webhook
// ack - it times out and RETRIES, and the retry arrives while the first is still running. Doing
// the work inline therefore means converting the same image twice, spending twice the CPU on a
// 2-vCPU box, and replying twice. So the webhook enqueues and acks immediately, and the queue
// owns both the concurrency limit and the deduplication.
//
// Deliberately in-process and not durable: a restart loses queued work, which for a chat bot
// means a user re-sends an image. A durable queue means a database, and the app holds no state
// on disk yet. Revisit when credits arrive, since those must survive a restart.

export interface QueueOptions {
  /** Jobs running at once. Match to cores; conversion is CPU-bound. */
  concurrency?: number;
  /** Refuse new work past this many waiting jobs, so a burst fails fast instead of piling up. */
  maxPending?: number;
}

export class QueueFullError extends Error {
  constructor(pending: number) {
    super(`queue is full (${pending} waiting)`);
    this.name = "QueueFullError";
  }
}

interface Entry<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  run: () => Promise<T>;
}

export class WorkQueue {
  private readonly concurrency: number;
  private readonly maxPending: number;
  private readonly waiting: Array<{ key: string; entry: Entry<unknown> }> = [];
  /** key -> entry, for every job queued OR running. This is what makes a retry a no-op. */
  private readonly inFlight = new Map<string, Entry<unknown>>();
  private active = 0;

  constructor(opts: QueueOptions = {}) {
    this.concurrency = Math.max(1, opts.concurrency ?? 1);
    this.maxPending = Math.max(1, opts.maxPending ?? 32);
  }

  get stats(): { active: number; pending: number } {
    return { active: this.active, pending: this.waiting.length };
  }

  /**
   * Runs `fn`, or joins the existing run if `key` is already queued or running.
   *
   * The dedup key is the point: a platform retry carries the same message id, so it attaches to
   * the run already in progress and both callers get the same result, rather than the image
   * being converted twice.
   */
  submit<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing.promise as Promise<T>;

    if (this.waiting.length >= this.maxPending) {
      return Promise.reject(new QueueFullError(this.waiting.length));
    }

    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    const entry: Entry<T> = { promise, resolve, reject, run: fn };

    this.inFlight.set(key, entry as Entry<unknown>);
    this.waiting.push({ key, entry: entry as Entry<unknown> });
    // Pumped synchronously, not on a microtask. Deferring it meant a job was still counted as
    // waiting while callers were submitting, so a burst hit maxPending one slot early - the
    // limit measured "submitted since the last tick" rather than "actually waiting".
    this.pump();
    return promise;
  }

  private pump(): void {
    while (this.active < this.concurrency && this.waiting.length) {
      const next = this.waiting.shift()!;
      this.active++;
      // Bookkeeping is undone BEFORE the caller's promise settles. Releasing the key in a
      // .finally() after .then(resolve) let an awaiting caller resume while the key was still
      // registered, so the next submit for that key joined a job that had already finished and
      // never ran at all.
      const settle = (): void => {
        this.inFlight.delete(next.key);
        this.active--;
      };
      next.entry.run().then(
        (v) => { settle(); next.entry.resolve(v); this.pump(); },
        (e) => { settle(); next.entry.reject(e); this.pump(); },
      );
    }
  }
}
