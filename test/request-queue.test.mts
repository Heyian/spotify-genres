import { test } from "node:test";
import assert from "node:assert/strict";
import { DroppedError, QuotaError, createRequestQueue, type Clock } from "../module/request-queue.ts";

/** Event-driven fake clock: runs timers in due order and flushes promise jobs between them. */
class FakeClock implements Clock {
  t = 0;
  private timers: Array<{ at: number; seq: number; fn: () => void }> = [];
  private seq = 0;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    this.timers.push({ at: this.t + Math.max(0, ms), seq: this.seq++, fn });
    return undefined;
  };
  private async flush() {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  }
  private popDue(limit: number) {
    this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    return this.timers[0] && this.timers[0].at <= limit ? this.timers.shift() : undefined;
  }
  async advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      await this.flush();
      const next = this.popDue(target);
      if (!next) break;
      this.t = next.at;
      next.fn();
    }
    this.t = target;
    await this.flush();
  }
  async runAll() {
    await this.advance(10 * 60_000);
  }
}

const opts = (clock: Clock, budget = 40, windowMs = 5000) => ({ budget, windowMs, backoffInitialMs: 5000, backoffMaxMs: 60000, clock });

test("budget_window_deezer (AC14)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(opts(clock));
  const starts: number[] = [];
  const all = Array.from({ length: 100 }, (_, i) => q.enqueue(`k${i}`, "current", async () => void starts.push(clock.now())));
  await clock.runAll();
  await Promise.all(all);
  assert.equal(starts.length, 100);
  for (const s of starts) assert.ok(starts.filter((x) => x >= s && x < s + 5000).length <= 40);
  assert.ok(starts[40] >= 5000);
});

test("budget_window_musicbrainz (AC14)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(opts(clock, 1, 1000));
  const starts: number[] = [];
  const all = Array.from({ length: 5 }, (_, i) => q.enqueue(`k${i}`, "current", async () => void starts.push(clock.now())));
  await clock.runAll();
  await Promise.all(all);
  assert.deepEqual(starts, [0, 1000, 2000, 3000, 4000]);
});

test("current_before_prefetch (AC17)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(opts(clock, 1, 1000));
  const order: string[] = [];
  const blocker = q.enqueue("blocker", "current", async () => void order.push("blocker"));
  const a = q.enqueue("a", "prefetch", async () => void order.push("A"));
  const b = q.enqueue("b", "current", async () => void order.push("B"));
  await clock.runAll();
  await Promise.all([blocker, a, b]);
  assert.deepEqual(order, ["blocker", "B", "A"]);
});

test("quota_backoff_doubles_and_resets (AC15)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(opts(clock));
  const attempts: number[] = [];
  const first = q.enqueue("x", "current", async () => {
    attempts.push(clock.now());
    if (attempts.length <= 3) throw new QuotaError("429");
    return "ok";
  });
  await clock.runAll();
  assert.equal(await first, "ok");
  assert.deepEqual(attempts.slice(1).map((t, i) => t - attempts[i]), [5000, 10000, 20000]);

  const later: number[] = [];
  const second = q.enqueue("y", "current", async () => {
    later.push(clock.now());
    if (later.length === 1) throw new QuotaError("429");
    return "ok";
  });
  await clock.runAll();
  assert.equal(await second, "ok");
  assert.equal(later[1] - later[0], 5000);
});

test("quota_backoff_capped (AC15)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(opts(clock));
  const attempts: number[] = [];
  const p = q.enqueue("x", "current", async () => {
    attempts.push(clock.now());
    if (attempts.length <= 6) throw new QuotaError("429");
  });
  await clock.runAll();
  await p;
  const gaps = attempts.slice(1).map((t, i) => t - attempts[i]);
  assert.deepEqual(gaps, [5000, 10000, 20000, 40000, 60000, 60000]);
  assert.ok(gaps.every((g) => g <= 60000));
});

test("drop_rejects_waiting_never_starts (AC16)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(opts(clock, 1, 1000));
  const blocker = q.enqueue("blocker", "current", async () => {});
  let calls = 0;
  const x = q.enqueue("x", "current", async () => void calls++);
  q.dropWhere((k) => k === "x");
  await assert.rejects(x, DroppedError);
  await clock.runAll();
  await blocker;
  assert.equal(calls, 0);
});

test("backoff_does_not_block_other_queue (AC15)", async () => {
  const clock = new FakeClock();
  const a = createRequestQueue(opts(clock));
  const b = createRequestQueue(opts(clock, 1, 1000));
  let failures = 0;
  void a.enqueue("x", "current", async () => {
    if (failures++ < 5) throw new QuotaError("429");
  });
  await clock.advance(5000 + 10000 + 20000 + 40000 + 1); // A is now in its 60 s pause
  const before = clock.now();
  let doneAt = -1;
  const p = b.enqueue("y", "current", async () => void (doneAt = clock.now()));
  await clock.advance(0);
  await p;
  assert.equal(doneAt, before);
  await clock.runAll();
});

test("drop_during_backoff (Review Focus 1)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(opts(clock));
  let calls = 0;
  const x = q.enqueue("x", "current", async () => {
    calls++;
    throw new QuotaError("429");
  });
  await clock.advance(1);
  assert.equal(calls, 1);
  q.dropWhere((k) => k === "x");
  await assert.rejects(x, DroppedError);
  await clock.runAll();
  assert.equal(calls, 1);
});

test("onIdle_fires_after_last_task", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(opts(clock, 1, 1000));
  let idle = 0;
  q.onIdle(() => idle++);
  assert.equal(q.isIdle(), true);
  const p1 = q.enqueue("a", "current", async () => {});
  const p2 = q.enqueue("b", "current", async () => {});
  assert.equal(q.isIdle(), false);
  await clock.advance(0);
  assert.equal(idle, 0);
  await clock.runAll();
  await Promise.all([p1, p2]);
  assert.equal(q.isIdle(), true);
  assert.equal(idle, 1);
});

const bopts = (clock: Clock) => ({ ...opts(clock, 1, 1000), backfillMinIntervalMs: 6000 });

test("backfill_spaced_by_interval (column AC22)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(bopts(clock));
  const starts: number[] = [];
  const all = Array.from({ length: 3 }, (_, i) => q.enqueue(`k${i}`, "backfill", async () => void starts.push(clock.now())));
  await clock.runAll();
  await Promise.all(all);
  assert.deepEqual(starts, [0, 6000, 12000]);
});

test("backfill_interval_counts_any_priority (column AC22)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(bopts(clock));
  const starts: Record<string, number> = {};
  const c = q.enqueue("c", "current", async () => void (starts.c = clock.now()));
  const b = q.enqueue("b", "backfill", async () => void (starts.b = clock.now()));
  await clock.runAll();
  await Promise.all([c, b]);
  assert.deepEqual(starts, { c: 0, b: 6000 });
});

test("current_budget_unchanged_while_backfill_waits (column AC22)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(bopts(clock));
  const starts: Record<string, number> = {};
  const rec = (name: string) => async () => void (starts[name] = clock.now());
  const all = [q.enqueue("b1", "backfill", rec("b1"))];
  await clock.advance(0);
  all.push(q.enqueue("b2", "backfill", rec("b2")));
  for (const n of ["c1", "c2", "c3"]) all.push(q.enqueue(n, "current", rec(n)));
  await clock.runAll();
  await Promise.all(all);
  assert.deepEqual(starts, { b1: 0, c1: 1000, c2: 2000, c3: 3000, b2: 9000 });
});

test("foreground_before_backfill (column AC23)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(bopts(clock));
  const order: string[] = [];
  const rec = (name: string) => async () => void order.push(name);
  const all = [
    q.enqueue("blocker", "current", rec("blocker")),
    q.enqueue("x", "backfill", rec("X")),
    q.enqueue("a", "prefetch", rec("A")),
    q.enqueue("b", "current", rec("B")),
  ];
  await clock.runAll();
  await Promise.all(all);
  assert.deepEqual(order, ["blocker", "B", "A", "X"]);
});

test("drop_skips_backfill (column AC24)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(bopts(clock));
  const blocker = q.enqueue("blocker", "current", async () => {});
  const cur = q.enqueue("c", "current", async () => {});
  const pre = q.enqueue("p", "prefetch", async () => {});
  let ran = false;
  const back = q.enqueue("b", "backfill", async () => void (ran = true));
  q.dropWhere(() => true);
  await assert.rejects(cur, DroppedError);
  await assert.rejects(pre, DroppedError);
  await clock.runAll();
  await Promise.all([blocker, back]);
  assert.equal(ran, true);
});

test("idle_ignores_backfill (column AC25)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue(bopts(clock));
  let idle = 0;
  q.onIdle(() => idle++);
  const b1 = q.enqueue("b1", "backfill", async () => {});
  const b2 = q.enqueue("b2", "backfill", async () => {});
  await clock.advance(0); // b1 done, b2 waiting for its interval
  assert.equal(q.isIdle(), true);
  let release!: () => void;
  const c = q.enqueue("c", "current", () => new Promise<void>((r) => (release = r)));
  await clock.advance(1000);
  assert.equal(q.isIdle(), false);
  const b3 = q.enqueue("b3", "backfill", async () => {});
  release();
  await clock.advance(0);
  await c;
  assert.equal(q.isIdle(), true);
  assert.equal(idle, 1);
  await clock.runAll();
  await Promise.all([b1, b2, b3]);
  assert.equal(idle, 1);
});

test("quota_pause_holds_backfill (column AC26)", async () => {
  const clock = new FakeClock();
  const q = createRequestQueue({ ...bopts(clock), backfillMinIntervalMs: 0 });
  let failed = false;
  const c = q.enqueue("c", "current", async () => {
    if (!failed) {
      failed = true;
      throw new QuotaError("429");
    }
  });
  let bAt = -1;
  const b = q.enqueue("b", "backfill", async () => void (bAt = clock.now()));
  await clock.runAll();
  await Promise.all([c, b]);
  assert.ok(bAt >= 5000);
});
