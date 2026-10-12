import { test } from "node:test";
import assert from "node:assert/strict";
import { playlistUriFromPath } from "../module/playlist-column.ts";

test("path_to_playlist_uri (column AC17)", () => {
  assert.equal(playlistUriFromPath("/playlist/abc"), "spotify:playlist:abc");
  for (const path of ["/collection/tracks", "/album/x", "/artist/x", "/search/x", "/playlist/", "/playlist"]) {
    assert.equal(playlistUriFromPath(path), null, path);
  }
});
