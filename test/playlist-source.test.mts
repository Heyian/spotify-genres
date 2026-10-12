import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listPlaylistTracks, playlistItemToTrackRef } from "../module/playlist-source.ts";

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "playlist-contents.json"), "utf8"));

const item = (n: number, over: Record<string, unknown> = {}) => ({
  type: "track",
  uri: `spotify:track:T${n}`,
  name: `Title ${n}`,
  artists: [{ name: `Artist ${n}` }],
  duration: { milliseconds: 200000 },
  isLocal: false,
  ...over,
});

/** A fake pager over `total` items that records every call. */
const pager = (total: number) => {
  const calls: { uri: string; limit: number; offset: number }[] = [];
  const getContents = async (uri: string, opts: { limit: number; offset: number }) => {
    calls.push({ uri, ...opts });
    const items = [];
    for (let i = opts.offset; i < Math.min(total, opts.offset + opts.limit); i++) items.push(item(i));
    return { items, offset: opts.offset, limit: opts.limit, totalLength: total };
  };
  return { calls, getContents };
};

test("pages_until_total (column AC18)", async () => {
  const p = pager(250);
  const tracks = await listPlaylistTracks(p.getContents, "spotify:playlist:P");
  assert.deepEqual(p.calls.map((c) => c.offset), [0, 100, 200]);
  assert.ok(p.calls.every((c) => c.limit === 100 && c.uri === "spotify:playlist:P"));
  assert.equal(tracks.length, 250);
  assert.equal(tracks[249]?.uri, "spotify:track:T249");
});

test("empty_playlist_single_call", async () => {
  const p = pager(0);
  assert.deepEqual(await listPlaylistTracks(p.getContents, "spotify:playlist:P"), []);
  assert.equal(p.calls.length, 1);
});

test("aborted_listing_stops (Review Focus 1)", async () => {
  const ac = new AbortController();
  const p = pager(250);
  const getContents = async (uri: string, opts: { limit: number; offset: number }) => {
    const r = await p.getContents(uri, opts);
    ac.abort(new Error("left playlist"));
    return r;
  };
  await assert.rejects(listPlaylistTracks(getContents, "spotify:playlist:P", ac.signal), /left playlist/);
  assert.equal(p.calls.length, 1);
});

test("maps_fixture_item", () => {
  assert.deepEqual(playlistItemToTrackRef(fixture.track), {
    uri: fixture.track.uri,
    artist: "Placeholder Artist 1",
    title: "Placeholder Track",
    durationS: 185,
    isLocal: false,
    isTrack: true,
  });
});

test("maps_local_and_episode", () => {
  // No local-file item was found live: the local item is hand-built from the track fixture.
  const local = { ...fixture.track, uri: "spotify:local:Artist:Album:Title:185", isLocal: true };
  assert.deepEqual(playlistItemToTrackRef(local), {
    uri: local.uri,
    artist: "Placeholder Artist 1",
    title: "Placeholder Track",
    durationS: 185,
    isLocal: true,
    isTrack: true,
  });
  const ep = playlistItemToTrackRef(fixture.episode);
  assert.ok(ep);
  assert.equal(ep.isTrack, false);
  assert.equal(ep.uri, fixture.episode.uri);
  assert.equal(ep.artist, "");
});

test("first_artist_used (Review Focus 4)", () => {
  const ref = playlistItemToTrackRef(item(1, { artists: [{ name: "First" }, { name: "Second" }] }));
  assert.equal(ref?.artist, "First");
});

test("unmappable_and_missing_fields", () => {
  assert.equal(playlistItemToTrackRef(undefined), undefined);
  assert.equal(playlistItemToTrackRef({ type: "track", name: "x" }), undefined);
  const ref = playlistItemToTrackRef({ type: "track", uri: "spotify:track:X" });
  assert.deepEqual(ref, { uri: "spotify:track:X", artist: "", title: "", durationS: null, isLocal: false, isTrack: true });
});
