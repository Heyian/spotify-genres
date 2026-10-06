export type Priority = "current" | "prefetch";

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
  /** Nothing waiting, nothing running. */
  isIdle(): boolean;
  /** Fires on each transition to idle; returns unsubscribe. */
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
 * `current` before `prefetch` (FIFO within a priority), and a pause on quota
 * errors that doubles per consecutive error up to `backoffMaxMs`.
 */
export function createRequestQueue(opts: {
  budget: number;
  windowMs: number;
  backoffInitialMs: number;
  backoffMaxMs: number;
  clock?: Clock;
}): RequestQueue {
  const clock = opts.clock ?? realClock;
  const waiting: Job[] = [];
  const starts: number[] = [];
  const idleListeners = new Set<() => void>();
  let running = 0;
  let pausedUntil = 0;
  let nextPause = opts.backoffInitialMs;
  let wakeAt = Infinity;
  let idleNotified = true;

  const isIdle = () => waiting.length === 0 && running === 0;

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
    const index = waiting.findIndex((job) => job.priority === "current");
    return waiting.splice(index === -1 ? 0 : index, 1)[0];
  };

  const start = (job: Job) => {
    starts.push(clock.now());
    running++;
    job.task().then(
      (value) => {
        running--;
        nextPause = opts.backoffInitialMs;
        job.resolve(value);
        pump();
        checkIdle();
      },
      (error) => {
        running--;
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
      start(takeNext()!);
    }
  }

  return {
    enqueue<T>(key: string, priority: Priority, task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        idleNotified = false;
        waiting.push({ key, priority, task, resolve: resolve as (value: unknown) => void, reject });
        pump();
      });
    },
    dropWhere(predicate) {
      for (let i = waiting.length - 1; i >= 0; i--) {
        if (!predicate(waiting[i].key)) continue;
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
