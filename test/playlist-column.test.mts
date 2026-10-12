import { test } from "node:test";
import assert from "node:assert/strict";
import { startPlaylistColumn, playlistUriFromPath, type PlaylistColumnDeps } from "../module/playlist-column.ts";
import { createMemoryStore } from "../module/genre-cache.ts";
import { DAY_MS, MODEL_VERSION, audioRecheckDays, musicbrainzTtlDays, notFoundTtlDays } from "../module/config.ts";
import type { TrackRef } from "../module/genre-pipeline.ts";

test("path_to_playlist_uri (column AC17)", () => {
  assert.equal(playlistUriFromPath("/playlist/abc"), "spotify:playlist:abc");
  for (const path of ["/collection/tracks", "/album/x", "/artist/x", "/search/x", "/playlist/", "/playlist"]) {
    assert.equal(playlistUriFromPath(path), null, path);
  }
});

/** Runs `body` with just the browser globals startPlaylistColumn touches; an empty document has no tracklist. */
async function withBrowserStubs(body: () => Promise<void>): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  const saved = ["document", "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame"].map((k) => [k, g[k]] as const);
  const empty = { querySelectorAll: () => [], getElementById: () => null, body: {} };
  g.document = empty;
  g.MutationObserver = class {
    observe(): void {}
    disconnect(): void {}
  };
  g.requestAnimationFrame = () => 1;
  g.cancelAnimationFrame = () => {};
  try {
    await body();
  } finally {
    for (const [k, v] of saved) g[k] = v;
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function columnSetup(initialPath: string) {
  const listed: string[] = [];
  const visits = { started: 0, stopped: 0 };
  const listeners: ((location: { pathname: string }) => void)[] = [];
  const history = {
    location: { pathname: initialPath },
    listen(cb: (location: { pathname: string }) => void) {
      listeners.push(cb);
      return () => {};
    },
  };
  const track: TrackRef = { uri: "spotify:track:a", artist: "A", title: "T", durationS: 1, isLocal: false, isTrack: true };
  const deps: PlaylistColumnDeps = {
    store: { ...createMemoryStore(), subscribe: () => () => {} },
    backfill: {
      startVisit: () => {
        visits.started++;
        return { stop: () => void visits.stopped++, addTracks() {}, restart() {} };
      },
    },
    history,
    listTracks: async (uri) => (listed.push(uri), [track]),
    audioEnabled: () => false,
    modelReady: () => false,
    now: () => 100 * DAY_MS,
    rules: { musicbrainzTtlDays, audioRecheckDays, notFoundTtlDays, modelVersion: MODEL_VERSION },
    log: () => {},
  };
  const navigate = (pathname: string) => listeners.forEach((cb) => cb({ pathname }));
  return { deps, listed, visits, navigate };
}

test("a history event for the playlist already shown keeps the visit (column AC28, AC29)", async () => {
  await withBrowserStubs(async () => {
    const { deps, listed, visits, navigate } = columnSetup("/playlist/abc");
    const column = startPlaylistColumn(deps);
    await flush();
    assert.deepEqual(listed, ["spotify:playlist:abc"]);
    assert.equal(visits.started, 1);

    navigate("/playlist/abc");
    await flush();
    assert.deepEqual(listed, ["spotify:playlist:abc"], "not listed again");
    assert.equal(visits.started, 1);
    assert.equal(visits.stopped, 0, "visit kept");
    column.stop();
  });
});

test("a history event for a different playlist restarts the visit (column AC28)", async () => {
  await withBrowserStubs(async () => {
    const { deps, listed, visits, navigate } = columnSetup("/playlist/abc");
    const column = startPlaylistColumn(deps);
    await flush();

    navigate("/playlist/xyz");
    await flush();
    assert.deepEqual(listed, ["spotify:playlist:abc", "spotify:playlist:xyz"]);
    assert.equal(visits.stopped, 1);
    assert.equal(visits.started, 2);

    navigate("/album/q");
    assert.equal(visits.stopped, 2, "leaving for a non-playlist page tears the visit down");
    column.stop();
  });
});
