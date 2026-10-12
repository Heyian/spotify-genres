import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, MODEL_VERSION, audioRecheckDays, musicbrainzTtlDays, notFoundTtlDays } from "../module/config.ts";
import { createMemoryStore, type GenreCacheEntry, type GenreCacheStore } from "../module/genre-cache.ts";
import { needsLookup, resolveTrack, type PipelineDeps, type TrackRef } from "../module/genre-pipeline.ts";
import type { GenreFetchOutcome } from "../module/logic.ts";
import type { ScoredGenres } from "../module/labels.ts";
import { DroppedError } from "../module/request-queue.ts";

const NOW = 100 * DAY_MS;
const track: TrackRef = { uri: "spotify:track:a", artist: "Artist", title: "Song", durationS: 200, isLocal: false, isTrack: true };
const HIT: GenreFetchOutcome = { genres: ["rock"], reachable: true };
const MISS: GenreFetchOutcome = { genres: [], reachable: true };
const DOWN: GenreFetchOutcome = { genres: [], reachable: false };
const AUDIO: ScoredGenres = { genres: ["darkwave", "post-punk"], scores: [0.4, 0.2] };

interface Options {
  mb?: GenreFetchOutcome;
  audio?: boolean;
  ready?: boolean;
  preview?: string | null | Error;
  classify?: ScoredGenres | Error;
  store?: GenreCacheStore;
  /** Records the priority each Deezer lookup was called with. */
  previewPriorities?: string[];
}

function setup(o: Options = {}) {
  const calls = { mb: 0, deezer: 0, classify: 0, puts: [] as GenreCacheEntry[] };
  const inner = o.store ?? createMemoryStore();
  let epoch = 0;
  const store: GenreCacheStore = {
    get: (uri) => inner.get(uri),
    getMany: (uris) => inner.getMany(uris),
    put: async (e) => {
      calls.puts.push(e);
      await inner.put(e);
    },
    clear: () => inner.clear(),
  };
  const deps: PipelineDeps = {
    store,
    rules: { musicbrainzTtlDays, audioRecheckDays, notFoundTtlDays, modelVersion: MODEL_VERSION },
    now: () => NOW,
    musicbrainz: async () => (calls.mb++, o.mb ?? MISS),
    audioEnabled: () => o.audio ?? true,
    modelReady: () => o.ready ?? true,
    findPreview: async (_track, priority) => {
      o.previewPriorities?.push(priority);
      calls.deezer++;
      const p = o.preview === undefined ? "https://cdn/p.mp3" : o.preview;
      if (p instanceof Error) throw p;
      return p;
    },
    classifyPreview: async () => {
      calls.classify++;
      const c = o.classify ?? AUDIO;
      if (c instanceof Error) throw c;
      return c;
    },
    cacheEpoch: () => epoch,
  };
  return { deps, calls, inner, bumpEpoch: () => epoch++ };
}

/** `resolveTrack` minus `reachable`, which has its own test. */
const resolveShape = async (...args: Parameters<typeof resolveTrack>) => {
  const { genres, inferred } = await resolveTrack(...args);
  return { genres, inferred };
};

const seeded = async (entry: Omit<GenreCacheEntry, "uri">) => {
  const store = createMemoryStore();
  await store.put({ uri: track.uri, ...entry });
  return store;
};

test("not a catalogue track (AC5)", async () => {
  for (const t of [{ ...track, isLocal: true }, { ...track, isTrack: false }]) {
    const { deps, calls } = setup();
    assert.deepEqual(await resolveShape(t, deps, "current"), { genres: [], inferred: false });
    assert.equal(calls.mb + calls.deezer, 0);
    assert.equal(calls.puts.length, 0);
  }
});

test("serve decision: musicbrainz, none and audio entries (AC7, AC11, AC37)", async () => {
  const cases: Array<[Omit<GenreCacheEntry, "uri">, { genres: string[]; inferred: boolean }]> = [
    [{ genres: ["rock"], source: "musicbrainz", checkedAt: NOW }, { genres: ["rock"], inferred: false }],
    [{ genres: [], source: "none", checkedAt: NOW }, { genres: [], inferred: false }],
    [{ genres: ["darkwave"], scores: [0.3], modelVersion: MODEL_VERSION, source: "audio", checkedAt: NOW }, { genres: ["darkwave"], inferred: true }],
  ];
  for (const [entry, expected] of cases) {
    const { deps, calls } = setup({ store: await seeded(entry) });
    assert.deepEqual(await resolveShape(track, deps, "current"), expected);
    assert.equal(calls.mb + calls.deezer + calls.classify, 0);
    assert.equal(calls.puts.length, 0);
  }
});

test("MB hit (AC4)", async () => {
  const { deps, calls } = setup({ mb: HIT });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: ["rock"], inferred: false });
  assert.equal(calls.deezer, 0);
  assert.deepEqual(calls.puts.map((p) => [p.source, p.genres, p.checkedAt]), [["musicbrainz", ["rock"], NOW]]);
});

test("MB reachable miss, audio off (AC1)", async () => {
  const { deps, calls } = setup({ mb: MISS, audio: false });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.deezer, 0);
  assert.deepEqual(calls.puts.map((p) => p.source), ["none"]);
});

test("MB unreachable, audio off (AC12)", async () => {
  const { deps, calls } = setup({ mb: DOWN, audio: false });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.deezer, 0);
  assert.equal(calls.puts.length, 0);
});

test("MB miss/unreachable, audio on, model not ready (AC6)", async () => {
  for (const mb of [MISS, DOWN]) {
    const { deps, calls } = setup({ mb, ready: false });
    assert.deepEqual(await resolveShape(track, deps, "current"), { genres: [], inferred: false });
    assert.equal(calls.deezer, 0);
    assert.equal(calls.puts.length, 0);
  }
});

test("MB miss/unreachable, audio on + ready, preview classified (AC2, AC3)", async () => {
  for (const mb of [MISS, DOWN]) {
    const { deps, calls } = setup({ mb });
    assert.deepEqual(await resolveShape(track, deps, "current"), { genres: AUDIO.genres, inferred: true });
    assert.equal(calls.deezer, 1);
    assert.equal(calls.classify, 1);
    assert.deepEqual(calls.puts, [
      { uri: track.uri, genres: AUDIO.genres, scores: AUDIO.scores, source: "audio", modelVersion: MODEL_VERSION, checkedAt: NOW },
    ]);
  }
});

test("backfill priority reaches the Deezer lookup (column AC33)", async () => {
  const previewPriorities: string[] = [];
  const { deps, calls } = setup({ previewPriorities });
  await resolveTrack(track, deps, "backfill");
  assert.equal(calls.deezer, 1);
  assert.deepEqual(previewPriorities, ["backfill"]);
});

test("no candidate / no preview, MB reachable miss → none (AC21)", async () => {
  const { deps, calls } = setup({ mb: MISS, preview: null });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.classify, 0);
  assert.deepEqual(calls.puts.map((p) => p.source), ["none"]);
});

test("no candidate / no preview, MB unreachable → no write (AC12, AC21)", async () => {
  const { deps, calls } = setup({ mb: DOWN, preview: null });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.deezer, 1);
  assert.equal(calls.puts.length, 0);
});

test("classify throws → cleared, nothing written (AC36)", async () => {
  const { deps, calls } = setup({ mb: MISS, classify: new Error("decode failed") });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.classify, 1);
  assert.equal(calls.puts.length, 0);
});

test("findPreview failure other than drop → cleared, nothing written", async () => {
  const { deps, calls } = setup({ mb: MISS, preview: new Error("JSONP timed out") });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.puts.length, 0);
});

test("missing duration skips audio and writes no none (Review Focus 2)", async () => {
  const t = { ...track, durationS: null };
  const miss = setup({ mb: MISS });
  assert.deepEqual(await resolveShape(t, miss.deps, "current"), { genres: [], inferred: false });
  assert.equal(miss.calls.mb, 1);
  assert.equal(miss.calls.deezer, 0);
  assert.equal(miss.calls.puts.length, 0);

  const hit = setup({ mb: HIT });
  assert.deepEqual(await resolveShape(t, hit.deps, "current"), { genres: ["rock"], inferred: false });
  assert.deepEqual(hit.calls.puts.map((p) => p.source), ["musicbrainz"]);
});

test("empty artist or title: no lookup at all, nothing written (Review Focus 2, upstream behaviour)", async () => {
  for (const t of [{ ...track, artist: " " }, { ...track, title: "" }]) {
    const { deps, calls } = setup({ mb: HIT });
    assert.deepEqual(await resolveShape(t, deps, "current"), { genres: [], inferred: false });
    assert.equal(calls.mb + calls.deezer, 0);
    assert.equal(calls.puts.length, 0);
  }
});

test("none written while audio was off is retried once audio is on and ready (final review I2)", async () => {
  const off = setup({ mb: MISS, audio: false });
  await resolveTrack(track, off.deps, "current");
  const store = createMemoryStore();
  await store.put(off.calls.puts[0]);

  const stillOff = setup({ mb: MISS, audio: false, store });
  await resolveTrack(track, stillOff.deps, "current");
  assert.equal(stillOff.calls.mb, 0); // served from cache

  const on = setup({ mb: MISS, store });
  assert.deepEqual(await resolveShape(track, on.deps, "current"), { genres: AUDIO.genres, inferred: true });
  assert.equal(on.calls.deezer, 1);
});

test("none written after the audio step ran is served while fresh (AC11, AC21)", async () => {
  const first = setup({ mb: MISS, preview: null });
  await resolveTrack(track, first.deps, "current");
  const store = createMemoryStore();
  await store.put(first.calls.puts[0]);
  const again = setup({ mb: MISS, store });
  await resolveTrack(track, again.deps, "current");
  assert.equal(again.calls.mb + again.calls.deezer, 0);
});

test("audio entries are not shown while the setting is off (AC1, final review)", async () => {
  const fresh = { genres: ["darkwave"], scores: [0.3], modelVersion: MODEL_VERSION, source: "audio" as const, checkedAt: NOW };
  const { deps, calls } = setup({ mb: MISS, audio: false, store: await seeded(fresh) });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.mb, 1);
  assert.equal(calls.deezer, 0);
});

const staleAudio = { genres: ["darkwave"], scores: [0.3], modelVersion: MODEL_VERSION, source: "audio" as const, checkedAt: NOW - audioRecheckDays * DAY_MS };

test("recheck-musicbrainz + MB hit replaces the entry (AC9)", async () => {
  const { deps, calls } = setup({ mb: HIT, store: await seeded(staleAudio) });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: ["rock"], inferred: false });
  assert.equal(calls.deezer, 0);
  assert.deepEqual(calls.puts.map((p) => [p.source, p.genres]), [["musicbrainz", ["rock"]]]);
});

test("recheck-musicbrainz + reachable miss refreshes checkedAt (AC9)", async () => {
  const { deps, calls } = setup({ mb: MISS, store: await seeded(staleAudio) });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: ["darkwave"], inferred: true });
  assert.equal(calls.deezer, 0);
  assert.deepEqual(calls.puts, [{ uri: track.uri, ...staleAudio, checkedAt: NOW }]);
});

test("recheck-musicbrainz + unreachable leaves the entry unchanged (AC9)", async () => {
  const { deps, calls, inner } = setup({ mb: DOWN, store: await seeded(staleAudio) });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: ["darkwave"], inferred: true });
  assert.equal(calls.deezer, 0);
  assert.equal(calls.puts.length, 0);
  assert.equal((await inner.get(track.uri))?.checkedAt, staleAudio.checkedAt);
});

test("findPreview throws DroppedError → rethrown, nothing written", async () => {
  const { deps, calls } = setup({ mb: MISS, preview: new DroppedError("dropped") });
  await assert.rejects(resolveTrack(track, deps, "prefetch"), DroppedError);
  assert.equal(calls.puts.length, 0);
});

test("epoch changed between start and write → no write, result returned (AC38)", async () => {
  const s = setup({ mb: HIT });
  const original = s.deps.musicbrainz;
  s.deps.musicbrainz = async (t, p) => {
    s.bumpEpoch();
    return original(t, p);
  };
  assert.deepEqual(await resolveShape(track, s.deps, "current"), { genres: ["rock"], inferred: false });
  assert.equal(s.calls.puts.length, 0);
});

test("store get/put throwing degrades to no cache (Review Focus 5)", async () => {
  const broken: GenreCacheStore = {
    get: async () => { throw new Error("IDB unavailable"); },
    getMany: async () => { throw new Error("IDB unavailable"); },
    put: async () => { throw new Error("IDB unavailable"); },
    clear: async () => {},
  };
  const { deps, calls } = setup({ mb: HIT, store: broken });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: ["rock"], inferred: false });
  assert.equal(calls.mb, 1);
});

test("expired other-model audio entry triggers a full lookup (AC10)", async () => {
  const { deps, calls } = setup({ mb: MISS, store: await seeded({ ...staleAudio, modelVersion: "old", checkedAt: NOW }) });
  assert.deepEqual(await resolveShape(track, deps, "current"), { genres: AUDIO.genres, inferred: true });
  assert.equal(calls.deezer, 1);
});

const fixtures: Array<[string, GenreCacheEntry | undefined, { audio: boolean; ready: boolean }]> = [
  ["absent", undefined, { audio: true, ready: true }],
  ["mb fresh", { uri: track.uri, genres: ["rock"], source: "musicbrainz", checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
  ["mb expired", { uri: track.uri, genres: ["rock"], source: "musicbrainz", checkedAt: NOW - musicbrainzTtlDays * DAY_MS }, { audio: true, ready: true }],
  ["audio fresh", { uri: track.uri, genres: ["darkwave"], source: "audio", modelVersion: MODEL_VERSION, checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
  ["audio expired", { uri: track.uri, genres: ["darkwave"], source: "audio", modelVersion: MODEL_VERSION, checkedAt: NOW - audioRecheckDays * DAY_MS }, { audio: true, ready: true }],
  ["audio, setting off", { uri: track.uri, genres: ["darkwave"], source: "audio", modelVersion: MODEL_VERSION, checkedAt: NOW - DAY_MS }, { audio: false, ready: false }],
  ["audio, other model", { uri: track.uri, genres: ["darkwave"], source: "audio", modelVersion: "old", checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
  ["none fresh", { uri: track.uri, genres: [], source: "none", audioTried: true, checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
  ["none expired", { uri: track.uri, genres: [], source: "none", audioTried: true, checkedAt: NOW - notFoundTtlDays * DAY_MS }, { audio: true, ready: true }],
  ["none, audio not tried, now ready", { uri: track.uri, genres: [], source: "none", audioTried: false, checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
];
for (const [name, entry, flags] of fixtures) {
  test(`needs_lookup_matches_resolve: ${name} (column AC19)`, async () => {
    const store = createMemoryStore();
    if (entry) await store.put(entry);
    const s = setup({ store, audio: flags.audio, ready: flags.ready, mb: HIT });
    await resolveTrack(track, s.deps, "current");
    assert.equal(needsLookup(entry, NOW, s.deps.rules, flags.audio, flags.ready), s.calls.mb === 1);
  });
}

test("result_carries_reachability", async () => {
  assert.equal((await resolveTrack(track, setup({ mb: DOWN, audio: false }).deps, "current")).reachable, false);
  assert.equal((await resolveTrack(track, setup({ mb: MISS, audio: false }).deps, "current")).reachable, true);
});
