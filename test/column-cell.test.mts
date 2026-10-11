import { test } from "node:test";
import assert from "node:assert/strict";
import { INFERRED_TITLE } from "../module/config.ts";
import type { GenreCacheEntry } from "../module/genre-cache.ts";
import type { TrackRef } from "../module/genre-pipeline.ts";
import { NONE_TEXT, NONE_TITLE, WAITING_TEXT, WAITING_TITLE, cellView } from "../module/column-cell.ts";
import { prettifyGenre } from "../module/logic.ts";

const URI = "spotify:track:a";
const track: TrackRef = { uri: URI, artist: "Artist", title: "Song", durationS: 200, isLocal: false, isTrack: true };
const entry = (source: GenreCacheEntry["source"], genres: string[], checkedAt = Date.now()): GenreCacheEntry => ({ uri: URI, genres, source, checkedAt });
const pretty = (genres: string[]) => genres.map(prettifyGenre).join(", ");
const EMPTY = { state: "empty", text: "", title: "", inferred: false };

test("first_three_prettified_full_title (column AC3)", () => {
  const genres = ["post-punk", "darkwave", "coldwave", "new wave"];
  const view = cellView(URI, track, entry("musicbrainz", genres), true);
  assert.deepEqual(view, { state: "genres", text: pretty(genres.slice(0, 3)), title: pretty(genres), inferred: false });
  assert.ok(view.title.includes(prettifyGenre("new wave")));
  assert.ok(!view.text.includes(prettifyGenre("new wave")));
});

test("audio_inferred_and_hidden_when_off (column AC4)", () => {
  const genres = ["darkwave", "post-punk", "ambient", "drone"];
  const e = entry("audio", genres);
  assert.deepEqual(cellView(URI, track, e, true), {
    state: "genres",
    text: "≈ " + pretty(genres.slice(0, 3)),
    title: pretty(genres) + " — " + INFERRED_TITLE,
    inferred: true,
  });
  assert.deepEqual(cellView(URI, track, e, false), { state: "waiting", text: WAITING_TEXT, title: WAITING_TITLE, inferred: false });
});

test("no_entry_waiting (column AC5)", () => {
  const waiting = { state: "waiting", text: WAITING_TEXT, title: WAITING_TITLE, inferred: false };
  assert.deepEqual(cellView(URI, track, undefined, true), waiting);
  assert.deepEqual(cellView("spotify:track:unlisted", undefined, undefined, true), waiting);
  assert.equal(WAITING_TEXT, "…");
  assert.equal(WAITING_TITLE, "Looking up genres");
});

test("none_dash (column AC6)", () => {
  assert.deepEqual(cellView(URI, track, entry("none", []), true), { state: "none", text: NONE_TEXT, title: NONE_TITLE, inferred: false });
  assert.equal(NONE_TEXT, "—");
  assert.equal(NONE_TITLE, "No genres found");
});

test("empty_for_local_episode_missing_fields (column AC7)", () => {
  const e = entry("musicbrainz", ["rock"]);
  assert.deepEqual(cellView("spotify:local:a:b:c:1", undefined, e, true), EMPTY);
  assert.deepEqual(cellView("spotify:episode:x", undefined, e, true), EMPTY);
  assert.deepEqual(cellView(null, undefined, e, true), EMPTY);
  assert.deepEqual(cellView(URI, { ...track, artist: "" }, e, true), EMPTY);
  assert.deepEqual(cellView(URI, { ...track, title: "" }, e, true), EMPTY);
  assert.deepEqual(cellView(URI, { ...track, isLocal: true }, e, true), EMPTY);
  assert.deepEqual(cellView(URI, { ...track, isTrack: false }, e, true), EMPTY);
});

test("age_ignored (column AC8)", () => {
  for (const [source, genres] of [["musicbrainz", ["rock"]], ["audio", ["darkwave"]], ["none", []]] as const) {
    for (const audioEnabled of [true, false]) {
      assert.deepEqual(cellView(URI, track, entry(source, [...genres], 0), audioEnabled), cellView(URI, track, entry(source, [...genres], Date.now()), audioEnabled));
    }
  }
  assert.equal(cellView(URI, track, entry("audio", ["darkwave"], 0), false).state, "waiting");
});

test("text_is_prettified_input (column AC9)", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const view = cellView(URI, track, entry("musicbrainz", [hostile]), true);
  assert.equal(view.text, prettifyGenre(hostile));
  assert.equal(view.title, prettifyGenre(hostile));
});
