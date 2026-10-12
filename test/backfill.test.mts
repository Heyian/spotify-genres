import { test } from "node:test";
import assert from "node:assert/strict";
import { createBackfill, type VisitDeps } from "../module/backfill.ts";
import type { GenreResult, TrackRef } from "../module/genre-pipeline.ts";

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

const track = (id: string, over: Partial<TrackRef> = {}): TrackRef => ({
  uri: `spotify:track:${id}`,
  artist: "A",
  title: `T${id}`,
  durationS: 100,
  isLocal: false,
  isTrack: true,
  ...over,
});
const uri = (id: string) => `spotify:track:${id}`;

const OK: GenreResult = { genres: ["rock"], inferred: false, reachable: true };
const DOWN: GenreResult = { genres: [], inferred: false, reachable: false };

function setup(max = 3) {
  const calls: string[] = [];
  const pending: Array<{ uri: string; resolve(r: GenreResult): void; reject(e: unknown): void }> = [];
  const bf = createBackfill({
    maxConsecutiveFailures: max,
    resolve: (t) =>
      new Promise<GenreResult>((resolve, reject) => {
        calls.push(t.uri);
        pending.push({ uri: t.uri, resolve, reject });
      }),
  });
  /** Settle the oldest unsettled call, then let the loop run. */
  const settle = async (r: GenreResult = OK) => {
    pending.shift()!.resolve(r);
    await flush();
  };
  return { bf, calls, pending, settle };
}

const deps = (over: Partial<VisitDeps> = {}): VisitDeps => ({ needsLookup: () => true, renderedUris: () => [], ...over });

test("picks_rendered_first (column AC20)", async () => {
  const { bf, calls } = setup();
  bf.startVisit([track("1"), track("2"), track("3")], deps({ renderedUris: () => [uri("3"), uri("2")] }));
  await flush();
  assert.deepEqual(calls, [uri("3")]);
});

test("then_playlist_order (column AC20)", async () => {
  const { bf, calls, settle } = setup();
  bf.startVisit([track("1"), track("2"), track("3")], deps({ renderedUris: () => [uri("3")] }));
  await flush();
  await settle();
  await settle();
  await settle();
  assert.deepEqual(calls, [uri("3"), uri("1"), uri("2")]);
});

test("skips_ineligible (column AC7)", async () => {
  const { bf, calls, settle } = setup();
  bf.startVisit(
    [
      track("1", { isLocal: true }),
      track("2", { isTrack: false }),
      track("3", { artist: "  " }),
      track("4", { title: "" }),
      track("5"),
      track("6"),
    ],
    deps({ needsLookup: (t) => t.uri !== uri("6"), renderedUris: () => [uri("1"), uri("6")] }),
  );
  await flush();
  await settle();
  assert.deepEqual(calls, [uri("5")]);
});

test("one_outstanding_across_visits (column AC21)", async () => {
  const { bf, calls, settle } = setup();
  bf.startVisit([track("1")], deps());
  await flush();
  bf.startVisit([track("2")], deps());
  await flush();
  assert.deepEqual(calls, [uri("1")]);
  await settle();
  assert.deepEqual(calls, [uri("1"), uri("2")]);
});

test("stop_lets_outstanding_finish_no_new_picks (column AC27)", async () => {
  const { bf, calls, pending, settle } = setup();
  const v = bf.startVisit([track("1"), track("2")], deps());
  await flush();
  v.stop();
  await flush();
  assert.equal(pending.length, 1);
  await settle();
  assert.deepEqual(calls, [uri("1")]);
  v.addTracks([track("3")]);
  v.restart();
  await flush();
  assert.deepEqual(calls, [uri("1")]);
});

test("new_visit_stops_old (column AC28)", async () => {
  const { bf, calls, settle } = setup();
  bf.startVisit([track("1"), track("2")], deps());
  await flush();
  bf.startVisit([track("9")], deps());
  await flush();
  await settle();
  await settle();
  assert.deepEqual(calls, [uri("1"), uri("9")]);
});

test("tried_once_per_visit (column AC29)", async () => {
  const { bf, calls, pending } = setup();
  bf.startVisit([track("1")], deps());
  await flush();
  pending.shift()!.reject(new Error("boom"));
  await flush();
  assert.deepEqual(calls, [uri("1")]);
  bf.startVisit([track("1")], deps());
  await flush();
  assert.deepEqual(calls, [uri("1"), uri("1")]);
});

test("stops_after_consecutive_unreachable (column AC30)", async () => {
  const { bf, calls, settle } = setup(2);
  bf.startVisit([track("1"), track("2"), track("3")], deps());
  await flush();
  await settle(DOWN);
  await settle(DOWN);
  await flush();
  assert.deepEqual(calls, [uri("1"), uri("2")]);
});

test("reachable_resets_failure_count (column AC30)", async () => {
  const { bf, calls, pending, settle } = setup(2);
  bf.startVisit([track("1"), track("2"), track("3"), track("4"), track("5")], deps());
  await flush();
  await settle(DOWN);
  await settle(OK);
  await settle(DOWN);
  assert.equal(calls.length, 4);
  await settle(OK);
  assert.equal(calls.length, 5);
  assert.equal(pending.length, 1);
});

test("rejected_counts_as_neither (column AC30)", async () => {
  const { bf, calls, pending, settle } = setup(2);
  bf.startVisit([track("1"), track("2"), track("3"), track("4")], deps());
  await flush();
  await settle(DOWN);
  pending.shift()!.reject(new Error("x"));
  await flush();
  assert.equal(calls.length, 3);
  await settle(DOWN);
  await flush();
  assert.equal(calls.length, 3);
});

test("restart_clears_tried_and_failures (column AC31)", async () => {
  const { bf, calls, settle } = setup(1);
  const v = bf.startVisit([track("1"), track("2")], deps());
  await flush();
  await settle(DOWN);
  await flush();
  assert.deepEqual(calls, [uri("1")]);
  v.restart();
  await flush();
  assert.deepEqual(calls, [uri("1"), uri("1")]);
  await settle(OK);
  assert.deepEqual(calls, [uri("1"), uri("1"), uri("2")]);
});

test("add_tracks_appends_and_wakes (column AC32)", async () => {
  const { bf, calls, settle } = setup();
  const v = bf.startVisit([track("1")], deps());
  await flush();
  await settle();
  await flush();
  assert.deepEqual(calls, [uri("1")]);
  v.addTracks([track("2"), track("1")]);
  await flush();
  assert.deepEqual(calls, [uri("1"), uri("2")]);
});

test("addTracks does not resume a failure stop", async () => {
  const { bf, calls, settle } = setup(1);
  const v = bf.startVisit([track("1")], deps());
  await flush();
  await settle(DOWN);
  v.addTracks([track("2")]);
  await flush();
  assert.deepEqual(calls, [uri("1")]);
});

test("duplicate_uri_once (Review Focus 2)", async () => {
  const { bf, calls, settle } = setup();
  bf.startVisit([track("1"), track("1"), track("2")], deps({ renderedUris: () => [uri("1"), uri("1")] }));
  await flush();
  await settle();
  await settle();
  await flush();
  assert.deepEqual(calls, [uri("1"), uri("2")]);
});

test("needs_lookup_read_at_pick_time (Review Focus 5)", async () => {
  const { bf, calls, settle } = setup();
  let skip2 = false;
  bf.startVisit([track("1"), track("2"), track("3")], deps({ needsLookup: (t) => !(skip2 && t.uri === uri("2")) }));
  await flush();
  skip2 = true;
  await settle();
  assert.deepEqual(calls, [uri("1"), uri("3")]);
});
