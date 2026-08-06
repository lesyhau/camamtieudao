import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkQueue, QueueFullError } from "./queue.ts";

const defer = () => {
  let resolve!: (v?: unknown) => void;
  const promise = new Promise((r) => { resolve = r as () => void; });
  return { promise, resolve };
};

test("a repeat submission joins the run in progress instead of starting a second", () => {
  // This is the whole point: a platform retry carries the same message id and must not convert
  // the same image twice on a 2-vCPU box.
  const q = new WorkQueue();
  let runs = 0;
  const gate = defer();
  const job = async () => { runs++; await gate.promise; return "done"; };

  const a = q.submit("m1", job);
  const b = q.submit("m1", job);
  assert.equal(a, b, "the same promise is handed back");
  gate.resolve();
  return Promise.all([a, b]).then(([x, y]) => {
    assert.equal(runs, 1);
    assert.deepEqual([x, y], ["done", "done"]);
  });
});

test("the same key can run again once the first has settled", async () => {
  const q = new WorkQueue();
  let runs = 0;
  await q.submit("m1", async () => { runs++; });
  await q.submit("m1", async () => { runs++; });
  assert.equal(runs, 2);
});

test("concurrency is capped", async () => {
  const q = new WorkQueue({ concurrency: 2 });
  let peak = 0, now = 0;
  const gate = defer();
  const jobs = Array.from({ length: 5 }, (_, i) => q.submit(`k${i}`, async () => {
    now++; peak = Math.max(peak, now);
    await gate.promise;
    now--;
  }));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(peak, 2, "never more than two at once");
  gate.resolve();
  await Promise.all(jobs);
});

test("a burst past the pending limit fails fast rather than piling up", async () => {
  const q = new WorkQueue({ concurrency: 1, maxPending: 2 });
  const gate = defer();
  const started = q.submit("a", async () => { await gate.promise; });
  const queued = [q.submit("b", async () => {}), q.submit("c", async () => {})];
  await assert.rejects(() => q.submit("d", async () => {}), QueueFullError);
  gate.resolve();
  await Promise.all([started, ...queued]);
});

test("a failing job rejects its callers and frees the slot", async () => {
  const q = new WorkQueue({ concurrency: 1 });
  await assert.rejects(() => q.submit("x", async () => { throw new Error("boom"); }), /boom/);
  assert.deepEqual(q.stats, { active: 0, pending: 0 });
  assert.equal(await q.submit("x", async () => "ok"), "ok");
});
