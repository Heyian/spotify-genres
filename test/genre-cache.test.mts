import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, MODEL_VERSION, audioRecheckDays, musicbrainzTtlDays, notFoundTtlDays } from "../module/config.ts";
import { createMemoryStore, decideCacheAction, withChangeEvents, type CacheRules, type GenreCacheChange, type GenreCacheEntry } from "../module/genre-cache.ts";

const rules: CacheRules = { musicbrainzTtlDays, audioRecheckDays, notFoundTtlDays, modelVersion: MODEL_VERSION };
const now = 100 * DAY_MS;
const entry = (source: GenreCacheEntry["source"], age: number, extra: Partial<GenreCacheEntry> = {}): GenreCacheEntry => ({
  uri: "spotify:track:a",
  genres: source === "none" ? [] : ["rock"],
  source,
  checkedAt: now - age,
  ...(source === "audio" ? { modelVersion: MODEL_VERSION, scores: [0.5] } : {}),
  ...extra,
});

test("decideCacheAction_absent_lookup", () => assert.deepEqual(decideCacheAction(undefined, now, rules), { kind: "lookup" }));

test("musicbrainz_fresh_serves (AC7)", () => {
  const e = entry("musicbrainz", musicbrainzTtlDays * DAY_MS - 1);
  assert.deepEqual(decideCacheAction(e, now, rules), { kind: "serve", entry: e });
});

test("musicbrainz_at_ttl_lookups (AC8)", () =>
  assert.deepEqual(decideCacheAction(entry("musicbrainz", musicbrainzTtlDays * DAY_MS), now, rules), { kind: "lookup" }));

test("audio_fresh_serves (AC37)", () => {
  const e = entry("audio", audioRecheckDays * DAY_MS - 1);
  assert.deepEqual(decideCacheAction(e, now, rules), { kind: "serve", entry: e });
});

test("audio_at_recheck (AC9)", () => {
  const e = entry("audio", audioRecheckDays * DAY_MS);
  assert.deepEqual(decideCacheAction(e, now, rules), { kind: "recheck-musicbrainz", entry: e });
});

test("audio_other_model_absent (AC10)", () =>
  assert.deepEqual(decideCacheAction(entry("audio", 0, { modelVersion: "old" }), now, rules), { kind: "lookup" }));

test("none_fresh_serves (AC11)", () => {
  const e = entry("none", notFoundTtlDays * DAY_MS - 1);
  assert.deepEqual(decideCacheAction(e, now, rules), { kind: "serve", entry: e });
});

test("none_at_ttl_lookups (AC11)", () =>
  assert.deepEqual(decideCacheAction(entry("none", notFoundTtlDays * DAY_MS), now, rules), { kind: "lookup" }));

test("memory_store_roundtrip_and_clear", async () => {
  const store = createMemoryStore();
  const e = entry("musicbrainz", 0);
  await store.put(e);
  assert.deepEqual(await store.get(e.uri), e);
  await store.clear();
  assert.equal(await store.get(e.uri), undefined);
});

test("getmany_returns_present_only", async () => {
  const store = createMemoryStore();
  await store.put(entry("musicbrainz", 0, { uri: "spotify:track:a" }));
  await store.put(entry("musicbrainz", 0, { uri: "spotify:track:b" }));
  const found = await store.getMany(["spotify:track:a", "spotify:track:b", "spotify:track:c"]);
  assert.equal(found.size, 2);
  assert.equal(found.has("spotify:track:c"), false);
});

test("change_events_put_and_clear", async () => {
  const store = withChangeEvents(createMemoryStore());
  const seen: GenreCacheChange[] = [];
  const off = store.subscribe((c) => void seen.push(c));
  const e = entry("musicbrainz", 0);
  await store.put(e);
  await store.clear();
  assert.deepEqual(seen, [{ kind: "put", entry: e }, { kind: "clear" }]);
  off();
  await store.put(e);
  await store.clear();
  assert.equal(seen.length, 2);
});

test("failed_put_emits_nothing", async () => {
  const inner = createMemoryStore();
  const store = withChangeEvents({ ...inner, put: async () => { throw new Error("quota"); } });
  const seen: GenreCacheChange[] = [];
  store.subscribe((c) => void seen.push(c));
  await assert.rejects(store.put(entry("musicbrainz", 0)), /quota/);
  assert.equal(seen.length, 0);
});
