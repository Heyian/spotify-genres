import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_VERSION, audioRecheckDays, musicbrainzTtlDays, notFoundTtlDays } from "../module/config.ts";
import { createMemoryStore } from "../module/genre-cache.ts";
import { createGenreScheduler, type GenreResult, type SchedulerDeps, type TrackRef } from "../module/genre-pipeline.ts";
import type { GenreFetchOutcome } from "../module/logic.ts";
import type { RequestQueue } from "../module/request-queue.ts";

const ref = (id: string, extra: Partial<TrackRef> = {}): TrackRef => ({
  uri: `spotify:track:${id}`, artist: "Artist", title: id, durationS: 200, isLocal: false, isTrack: true, ...extra,
});

function fakeQueue() {
  const predicates: Array<(key: string) => boolean> = [];
  let idle = true;
  const listeners = new Set<() => void>();
  const queue: RequestQueue = {
    enqueue: (_key, _priority, task) => task(),
    dropWhere: (p) => void predicates.push(p),
    isIdle: () => idle,
    onIdle: (l) => (listeners.add(l), () => listeners.delete(l)),
  };
  return {
    queue,
    predicates,
    setBusy: () => void (idle = false),
    becomeIdle: () => {
      idle = true;
      for (const l of [...listeners]) l();
    },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(next?: TrackRef) {
  const store = createMemoryStore();
  const q = fakeQueue();
  const renders: GenreResult[] = [];
  const shown = () => renders.filter((r) => r.genres[0] !== "<invalidated>");
  const mbCalls: string[] = [];
  const holds = new Map<string, Promise<GenreFetchOutcome>>();
  let nextTrack = next;
  const deps: SchedulerDeps = {
    store,
    rules: { musicbrainzTtlDays, audioRecheckDays, notFoundTtlDays, modelVersion: MODEL_VERSION },
    now: () => 1_000_000,
    musicbrainz: async (t) => {
      mbCalls.push(t.uri);
      return holds.get(t.uri) ?? { genres: [t.title], reachable: true };
    },
    audioEnabled: () => false,
    modelReady: () => false,
    findPreview: async () => null,
    classifyPreview: async () => ({ genres: [], scores: [] }),
    queues: [q.queue],
    render: (r) => void renders.push(r),
    invalidate: () => void renders.push({ genres: ["<invalidated>"], inferred: false }),
    nextTrack: () => nextTrack,
  };
  return { deps, store, q, renders, shown, mbCalls, holds, setNext: (t: TrackRef | undefined) => void (nextTrack = t) };
}

test("drops_unrelated_work_on_songchange (AC16)", async () => {
  const s = setup(ref("b"));
  await createGenreScheduler(s.deps).songChanged(ref("a"));
  const [drop] = s.q.predicates;
  assert.equal(drop("spotify:track:old"), true);
  assert.equal(drop("spotify:track:a"), false);
  assert.equal(drop("spotify:track:b"), false);
});

test("stale_lookup_not_rendered (AC39)", async () => {
  const s = setup();
  const held = deferred<GenreFetchOutcome>();
  s.holds.set("spotify:track:a", held.promise);
  const scheduler = createGenreScheduler(s.deps);
  const first = scheduler.songChanged(ref("a"));
  await new Promise((r) => setImmediate(r));
  await scheduler.songChanged(ref("b"));
  held.resolve({ genres: ["late"], reachable: true });
  await first;
  assert.deepEqual(s.shown(), [{ genres: ["b"], inferred: false, reachable: true }]);
});

test("prefetch_after_idle_no_render (AC18)", async () => {
  const s = setup(ref("next"));
  s.q.setBusy();
  const done = createGenreScheduler(s.deps).songChanged(ref("a"));
  await new Promise((r) => setImmediate(r));
  assert.equal(await s.store.get("spotify:track:next"), undefined);
  s.q.becomeIdle();
  await done;
  assert.equal(s.shown().length, 1);
  assert.deepEqual((await s.store.get("spotify:track:next"))?.genres, ["next"]);
});

test("prefetch_skips_local_nontrack_empty (AC18)", async () => {
  for (const next of [undefined, ref("local", { isLocal: true }), ref("episode", { isTrack: false })]) {
    const s = setup(next);
    await createGenreScheduler(s.deps).songChanged(ref("a"));
    assert.deepEqual(s.mbCalls, ["spotify:track:a"]);
  }
});

test("clear_then_next_play_full_lookup (AC13)", async () => {
  const s = setup();
  const scheduler = createGenreScheduler(s.deps);
  await scheduler.songChanged(ref("a"));
  await scheduler.songChanged(ref("a"));
  assert.equal(s.mbCalls.length, 1); // second play served from cache
  await scheduler.clearCache();
  assert.equal(await s.store.get("spotify:track:a"), undefined);
  await scheduler.songChanged(ref("a"));
  assert.equal(s.mbCalls.length, 2);
});

test("lookup_started_before_clear_writes_nothing (AC38)", async () => {
  const s = setup();
  const held = deferred<GenreFetchOutcome>();
  s.holds.set("spotify:track:a", held.promise);
  const scheduler = createGenreScheduler(s.deps);
  const pending = scheduler.songChanged(ref("a"));
  await new Promise((r) => setImmediate(r));
  await scheduler.clearCache();
  held.resolve({ genres: ["rock"], reachable: true });
  await pending;
  assert.equal(await s.store.get("spotify:track:a"), undefined);
  assert.deepEqual(s.shown(), [{ genres: ["rock"], inferred: false, reachable: true }]);
});

test("no current track clears the row", async () => {
  const s = setup();
  await createGenreScheduler(s.deps).songChanged(undefined);
  assert.deepEqual(s.shown(), [{ genres: [], inferred: false }]);
  assert.equal(s.mbCalls.length, 0);
});

test("song change invalidates the previous render before any lookup (final review I1)", async () => {
  const s = setup();
  const held = deferred<GenreFetchOutcome>();
  s.holds.set("spotify:track:b", held.promise);
  const scheduler = createGenreScheduler(s.deps);
  await scheduler.songChanged(ref("a"));
  const pending = scheduler.songChanged(ref("b"));
  assert.deepEqual(s.renders.map((r) => r.genres[0]), ["<invalidated>", "a", "<invalidated>"]);
  held.resolve({ genres: ["b"], reachable: true });
  await pending;
});
