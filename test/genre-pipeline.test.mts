import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, MODEL_VERSION, audioRecheckDays, musicbrainzTtlDays, notFoundTtlDays } from "../module/config.ts";
import { createMemoryStore, type GenreCacheEntry, type GenreCacheStore } from "../module/genre-cache.ts";
import { resolveTrack, type PipelineDeps, type TrackRef } from "../module/genre-pipeline.ts";
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
}

function setup(o: Options = {}) {
  const calls = { mb: 0, deezer: 0, classify: 0, puts: [] as GenreCacheEntry[] };
  const inner = o.store ?? createMemoryStore();
  let epoch = 0;
  const store: GenreCacheStore = {
    get: (uri) => inner.get(uri),
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
    findPreview: async () => {
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

const seeded = async (entry: Omit<GenreCacheEntry, "uri">) => {
  const store = createMemoryStore();
  await store.put({ uri: track.uri, ...entry });
  return store;
};

test("not a catalogue track (AC5)", async () => {
  for (const t of [{ ...track, isLocal: true }, { ...track, isTrack: false }]) {
    const { deps, calls } = setup();
    assert.deepEqual(await resolveTrack(t, deps, "current"), { genres: [], inferred: false });
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
    assert.deepEqual(await resolveTrack(track, deps, "current"), expected);
    assert.equal(calls.mb + calls.deezer + calls.classify, 0);
    assert.equal(calls.puts.length, 0);
  }
});

test("MB hit (AC4)", async () => {
  const { deps, calls } = setup({ mb: HIT });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: ["rock"], inferred: false });
  assert.equal(calls.deezer, 0);
  assert.deepEqual(calls.puts.map((p) => [p.source, p.genres, p.checkedAt]), [["musicbrainz", ["rock"], NOW]]);
});

test("MB reachable miss, audio off (AC1)", async () => {
  const { deps, calls } = setup({ mb: MISS, audio: false });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.deezer, 0);
  assert.deepEqual(calls.puts.map((p) => p.source), ["none"]);
});

test("MB unreachable, audio off (AC12)", async () => {
  const { deps, calls } = setup({ mb: DOWN, audio: false });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.deezer, 0);
  assert.equal(calls.puts.length, 0);
});

test("MB miss/unreachable, audio on, model not ready (AC6)", async () => {
  for (const mb of [MISS, DOWN]) {
    const { deps, calls } = setup({ mb, ready: false });
    assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: [], inferred: false });
    assert.equal(calls.deezer, 0);
    assert.equal(calls.puts.length, 0);
  }
});

test("MB miss/unreachable, audio on + ready, preview classified (AC2, AC3)", async () => {
  for (const mb of [MISS, DOWN]) {
    const { deps, calls } = setup({ mb });
    assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: AUDIO.genres, inferred: true });
    assert.equal(calls.deezer, 1);
    assert.equal(calls.classify, 1);
    assert.deepEqual(calls.puts, [
      { uri: track.uri, genres: AUDIO.genres, scores: AUDIO.scores, source: "audio", modelVersion: MODEL_VERSION, checkedAt: NOW },
    ]);
  }
});

test("no candidate / no preview, MB reachable miss → none (AC21)", async () => {
  const { deps, calls } = setup({ mb: MISS, preview: null });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.classify, 0);
  assert.deepEqual(calls.puts.map((p) => p.source), ["none"]);
});

test("no candidate / no preview, MB unreachable → no write (AC12, AC21)", async () => {
  const { deps, calls } = setup({ mb: DOWN, preview: null });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.deezer, 1);
  assert.equal(calls.puts.length, 0);
});

test("classify throws → cleared, nothing written (AC36)", async () => {
  const { deps, calls } = setup({ mb: MISS, classify: new Error("decode failed") });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.classify, 1);
  assert.equal(calls.puts.length, 0);
});

test("findPreview failure other than drop → cleared, nothing written", async () => {
  const { deps, calls } = setup({ mb: MISS, preview: new Error("JSONP timed out") });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: [], inferred: false });
  assert.equal(calls.puts.length, 0);
});

test("missing duration or empty artist skips audio and writes no none (Review Focus 2)", async () => {
  for (const t of [{ ...track, durationS: null }, { ...track, artist: " " }]) {
    const miss = setup({ mb: MISS });
    assert.deepEqual(await resolveTrack(t, miss.deps, "current"), { genres: [], inferred: false });
    assert.equal(miss.calls.mb, 1);
    assert.equal(miss.calls.deezer, 0);
    assert.equal(miss.calls.puts.length, 0);

    const hit = setup({ mb: HIT });
    assert.deepEqual(await resolveTrack(t, hit.deps, "current"), { genres: ["rock"], inferred: false });
    assert.deepEqual(hit.calls.puts.map((p) => p.source), ["musicbrainz"]);
  }
});

const staleAudio = { genres: ["darkwave"], scores: [0.3], modelVersion: MODEL_VERSION, source: "audio" as const, checkedAt: NOW - audioRecheckDays * DAY_MS };

test("recheck-musicbrainz + MB hit replaces the entry (AC9)", async () => {
  const { deps, calls } = setup({ mb: HIT, store: await seeded(staleAudio) });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: ["rock"], inferred: false });
  assert.equal(calls.deezer, 0);
  assert.deepEqual(calls.puts.map((p) => [p.source, p.genres]), [["musicbrainz", ["rock"]]]);
});

test("recheck-musicbrainz + reachable miss refreshes checkedAt (AC9)", async () => {
  const { deps, calls } = setup({ mb: MISS, store: await seeded(staleAudio) });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: ["darkwave"], inferred: true });
  assert.equal(calls.deezer, 0);
  assert.deepEqual(calls.puts, [{ uri: track.uri, ...staleAudio, checkedAt: NOW }]);
});

test("recheck-musicbrainz + unreachable leaves the entry unchanged (AC9)", async () => {
  const { deps, calls, inner } = setup({ mb: DOWN, store: await seeded(staleAudio) });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: ["darkwave"], inferred: true });
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
  assert.deepEqual(await resolveTrack(track, s.deps, "current"), { genres: ["rock"], inferred: false });
  assert.equal(s.calls.puts.length, 0);
});

test("store get/put throwing degrades to no cache (Review Focus 5)", async () => {
  const broken: GenreCacheStore = {
    get: async () => { throw new Error("IDB unavailable"); },
    put: async () => { throw new Error("IDB unavailable"); },
    clear: async () => {},
  };
  const { deps, calls } = setup({ mb: HIT, store: broken });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: ["rock"], inferred: false });
  assert.equal(calls.mb, 1);
});

test("expired other-model audio entry triggers a full lookup (AC10)", async () => {
  const { deps, calls } = setup({ mb: MISS, store: await seeded({ ...staleAudio, modelVersion: "old", checkedAt: NOW }) });
  assert.deepEqual(await resolveTrack(track, deps, "current"), { genres: AUDIO.genres, inferred: true });
  assert.equal(calls.deezer, 1);
});
