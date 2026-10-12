import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SELECTORS, columnStyleText, ensureRowCell, installColumn, withGenresColumn } from "../module/tracklist-dom.ts";

const grid = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/tracklist-grid.json"), "utf8")) as { wide: string };

test("list_selector_matches_only_the_playlists_own_tracklist (column AC1)", () => {
  // Live (1.2.96.518): the playlist grid is data-testid="playlist-tracklist"; the Recommended grid is "track-list".
  assert.equal(SELECTORS.list, '.main-trackList-trackList[data-testid="playlist-tracklist"]');
  assert.ok(!SELECTORS.list.includes('"track-list"'));
  const css = columnStyleText([{ id: "1", template: withGenresColumn(grid.wide) as string }]);
  assert.ok(
    css.startsWith(`${SELECTORS.list}[data-genres-col="1"] { --grid-template-columns: `),
    css,
  );
});
