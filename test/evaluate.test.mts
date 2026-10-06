import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isHit, parseTracksCsv, summarise } from "../scripts/evaluate-lib.ts";

test("parseTracksCsv on the example file", () => {
  const rows = parseTracksCsv(readFileSync(join(import.meta.dirname, "..", "eval", "tracks.example.csv"), "utf8"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { artist: "Joy Division", title: "Disorder", durationS: 209, expected: ["post-punk", "new wave"] });
  assert.deepEqual(rows[1].expected, ["ambient", "downtempo", "idm"]);
  assert.equal(rows[1].artist, "Boards of Canada");
});

test("parseTracksCsv handles quoted commas and doubled quotes", () => {
  const rows = parseTracksCsv('artist,title,duration_s,expected_genres\n"A, B","Say ""hi""",200,rock\n');
  assert.deepEqual(rows, [{ artist: "A, B", title: 'Say "hi"', durationS: 200, expected: ["rock"] }]);
});

test("isHit", () => {
  assert.equal(isHit(["Darkwave"], ["darkwave", "synth-pop", "coldwave"]), true);
  assert.equal(isHit(["rock"], ["darkwave"]), false);
});

test("summarise", () => {
  const s = summarise([{ preview: true, hit: true }, { preview: true, hit: false }, { preview: false, hit: false }]);
  assert.ok(Math.abs(s.coveragePct - 66.67) <= 0.01);
  assert.equal(s.hitRatePct, 50);
  assert.deepEqual(summarise([]), { coveragePct: 0, hitRatePct: 0 });
});
