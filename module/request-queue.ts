export type Priority = "current" | "prefetch" | "backfill";

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
}

/** Thrown by a task to signal a quota error (HTTP 429, Deezer `error.code === 4`). */
export class QuotaError extends Error {
  name = "QuotaError";
}

/** Rejection of a waiting task removed by `dropWhere`. */
export class DroppedError extends Error {
  name = "DroppedError";
}

export interface RequestQueue {
  enqueue<T>(key: string, priority: Priority, task: () => Promise<T>): Promise<T>;
  dropWhere(predicate: (key: string) => boolean): void;
  /** No `current`/`prefetch` job waiting or running; `backfill` jobs are ignored. */
  isIdle(): boolean;
  /** Fires on each transition to idle (`current`/`prefetch` work only); returns unsubscribe. */
  onIdle(listener: () => void): () => void;
}

interface Job {
  key: string;
  priority: Priority;
  task: () => Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

const realClock: Clock = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms) };

/**
 * Per-service queue: at most `budget` task starts in any `windowMs` window,
 * `current` before `prefetch` before `backfill` (FIFO within a priority), and a
 * pause on quota errors that doubles per consecutive error up to `backoffMaxMs`.
 * A `backfill` job starts only when no `current`/`prefetch` job waits and at
 * least `backfillMinIntervalMs` has passed since the previous start of any
 * priority. `dropWhere` never removes `backfill` jobs.
 */
export function createRequestQueue(opts: {
  budget: number;
  windowMs: number;
  backoffInitialMs: number;
  backoffMaxMs: number;
  backfillMinIntervalMs?: number;
  clock?: Clock;
}): RequestQueue {
  const backfillMinIntervalMs = opts.backfillMinIntervalMs ?? 0;
  const clock = opts.clock ?? realClock;
  const waiting: Job[] = [];
  const starts: number[] = [];
  const idleListeners = new Set<() => void>();
  let runningForeground = 0;
  let lastStart = -Infinity;
  let pausedUntil = 0;
  let nextPause = opts.backoffInitialMs;
  let wakeAt = Infinity;
  let idleNotified = true;

  const isIdle = () => runningForeground === 0 && !waiting.some((job) => job.priority !== "backfill");

  const checkIdle = () => {
    if (!isIdle() || idleNotified) return;
    idleNotified = true;
    for (const listener of [...idleListeners]) listener();
  };

  const wakeLater = (at: number) => {
    if (at >= wakeAt) return;
    wakeAt = at;
    clock.setTimeout(() => {
      if (wakeAt === at) wakeAt = Infinity;
      pump();
    }, at - clock.now());
  };

  const takeNext = (): Job | undefined => {
    for (const priority of ["current", "prefetch"] as const) {
      const index = waiting.findIndex((job) => job.priority === priority);
      if (index !== -1) return waiting.splice(index, 1)[0];
    }
    return undefined;
  };

  const start = (job: Job) => {
    lastStart = clock.now();
    starts.push(lastStart);
    const foreground = job.priority !== "backfill";
    if (foreground) runningForeground++;
    job.task().then(
      (value) => {
        if (foreground) runningForeground--;
        nextPause = opts.backoffInitialMs;
        job.resolve(value);
        pump();
        checkIdle();
      },
      (error) => {
        if (foreground) runningForeground--;
        if (error instanceof QuotaError) {
          pausedUntil = clock.now() + nextPause;
          nextPause = Math.min(nextPause * 2, opts.backoffMaxMs);
          // Back to the front of its priority: retried first once the pause ends.
          waiting.unshift(job);
        } else {
          job.reject(error);
        }
        pump();
        checkIdle();
      },
    );
  };

  function pump() {
    while (waiting.length) {
      const now = clock.now();
      if (now < pausedUntil) return wakeLater(pausedUntil);
      while (starts.length && starts[0] <= now - opts.windowMs) starts.shift();
      if (starts.length >= opts.budget) return wakeLater(starts[0] + opts.windowMs);
      let job = takeNext();
      if (!job) {
        const readyAt = lastStart + backfillMinIntervalMs;
        if (now < readyAt) return wakeLater(readyAt);
        job = waiting.shift()!;
      }
      start(job);
    }
  }

  return {
    enqueue<T>(key: string, priority: Priority, task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (priority !== "backfill") idleNotified = false;
        waiting.push({ key, priority, task, resolve: resolve as (value: unknown) => void, reject });
        pump();
      });
    },
    dropWhere(predicate) {
      for (let i = waiting.length - 1; i >= 0; i--) {
        if (waiting[i].priority === "backfill" || !predicate(waiting[i].key)) continue;
        const [job] = waiting.splice(i, 1);
        job.reject(new DroppedError(`Dropped ${job.key}`));
      }
      checkIdle();
    },
    isIdle,
    onIdle(listener) {
      idleListeners.add(listener);
      return () => idleListeners.delete(listener);
    },
  };
}
