import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GENRES_TRACK, columnStyleText, findRowUri, withGenresColumn } from "../module/tracklist-dom.ts";

const grid = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/tracklist-grid.json"), "utf8")) as { wide: string; narrow: string };

test("inserts_before_last (column AC13)", () => {
  for (const template of [grid.wide, grid.narrow]) {
    const out = withGenresColumn(template);
    assert.ok(out?.includes("[genres] minmax(120px, 2fr) [last]"));
    assert.equal(out?.replace("[genres] " + GENRES_TRACK + " ", ""), template);
  }
});

test("null_without_last (column AC14)", () => {
  assert.equal(withGenresColumn("[index] 16px [first] 4fr"), null);
});

test("idempotent_with_genres", () => {
  const once = withGenresColumn(grid.wide) as string;
  assert.equal(withGenresColumn(once), once);
});

test("find_row_uri_shallowest_first", () => {
  const props = { props: { item: { uri: "spotify:track:A", album: { uri: "spotify:album:X" } } } };
  assert.equal(findRowUri(props), "spotify:track:A");
  assert.equal(findRowUri({ a: { b: { uri: "spotify:album:X" } } }), null);
  assert.equal(findRowUri({ a: { uri: "spotify:local:x" } }), "spotify:local:x");
  const loop: Record<string, unknown> = { uri: "nope" };
  loop.self = loop;
  assert.equal(findRowUri(loop), null);
  assert.equal(findRowUri({ a: { b: { c: { uri: "spotify:track:D" } } } }, 2), null);
  assert.equal(findRowUri(null), null);
});

test("style_text_keeps_one_rule_per_list", () => {
  const wide = withGenresColumn(grid.wide) as string;
  const narrow = withGenresColumn(grid.narrow) as string;
  const both = columnStyleText([{ id: "1", template: wide }, { id: "2", template: narrow }]);
  assert.ok(both.includes(`[data-genres-col="1"] { --grid-template-columns: ${wide} !important; }`));
  assert.ok(both.includes(`[data-genres-col="2"] { --grid-template-columns: ${narrow} !important; }`));
  const rebuilt = columnStyleText([{ id: "1", template: narrow }, { id: "2", template: narrow }]);
  assert.ok(rebuilt.includes(`[data-genres-col="1"] { --grid-template-columns: ${narrow} !important; }`));
  assert.ok(rebuilt.includes(`[data-genres-col="2"] { --grid-template-columns: ${narrow} !important; }`));
});
