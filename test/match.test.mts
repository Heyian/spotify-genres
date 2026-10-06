import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise, pickCandidate, type DeezerCandidate } from "../module/match.ts";

test("remaster dash suffix normalises equal (AC19)", () => assert.equal(normalise("Creep - Remastered 2011"), normalise("Creep")));

test("each listed suffix is dropped, case-insensitively (AC19)", () => {
  for (const t of ["Song (Remastered)", "Song (feat. X)", "Song [feat. X]", "Song (Radio Edit)", "Song - Live", "Song - Remaster", "Song (FEAT. X)"]) {
    assert.equal(normalise(t), "song", t);
  }
});

test("unlisted suffixes stay (AC19, Review Focus 4)", () => {
  assert.equal(normalise("Song (Acoustic)"), "song acoustic");
  assert.equal(normalise("Song - 2011 Remaster"), "song 2011 remaster");
});

test("punctuation, diacritics and whitespace (AC19)", () => {
  assert.equal(normalise("Post-Punk"), "post punk");
  assert.equal(normalise("Beyoncé"), "beyonce");
  assert.equal(normalise("  A   B "), "a b");
});

const cand = (title: string, duration: number, extra: Partial<DeezerCandidate> = {}): DeezerCandidate => ({
  title, duration, preview: `https://cdn/${title}-${duration}.mp3`, artist: { name: "Artist" }, ...extra,
});
const track = { artist: "Artist", title: "Song", durationS: 200 };

test("duration within tolerance matches, beyond does not (AC20)", () => {
  assert.equal(pickCandidate(track, [cand("Song", 205)], 5)?.duration, 205);
  assert.equal(pickCandidate(track, [cand("Song", 206)], 5), null);
});

test("title_short matches when title differs (AC20)", () => {
  const c = cand("Song (Deluxe Version Mix)", 200, { title_short: "Song" });
  assert.equal(pickCandidate(track, [c], 5), c);
});

test("first matching candidate wins (AC20)", () => {
  const a = cand("Song", 201), b = cand("Song", 200);
  assert.equal(pickCandidate(track, [cand("Other", 200), a, b], 5), a);
});

test("artist mismatch does not match (AC20)", () =>
  assert.equal(pickCandidate(track, [cand("Song", 200, { artist: { name: "Someone Else" } })], 5), null));

test("feat_in_spotify_title_matches (Review Focus 3)", () => {
  const c = cand("Song", 200);
  assert.equal(pickCandidate({ ...track, title: "Song (feat. X)" }, [c], 5), c);
});
