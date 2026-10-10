# Playlist Genres Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Genres" column to Spotify playlist pages, filled by a slow backfill that reuses the existing cache → MusicBrainz → audio pipeline and its IndexedDB cache.

**Architecture:** Pure, dependency-injected units tested with `node --test`:
- `effectiveCacheDecision`/`needsLookup`, the extended request queue and the observable cache wrapper;
- `column-cell`, `backfill`, `playlist-source`, and the pure helpers of `tracklist-dom`.

Browser-only code (tracklist DOM injection, `playlist-column` wiring, settings, `mod.tsx`) is verified live in Spotify.

**Tech Stack:** TypeScript (type-stripped `.ts` under Node 22), `@spicetify/kit` 0.3.1, stdlib v3 (`/modules/stdlib/...`), bun for installs and scripts. No new dependency.

**Spec:** `docs/specs/2026-10-10-playlist-genres-column.md` (AC1–AC38). It builds on `docs/specs/2026-10-06-audio-genre-fallback.md`, whose ACs reuse the same numbers. In this plan, "AC n" means the 2026-10-10 spec. Test names cite it as `(column ACn)`.

## Global Constraints

- **Pages:** playlist pages only (`/playlist/<id>`). No column and no backfill anywhere else (AC17).
- **Settings:** `musicbrainzBackfillIntervalMs` 6000, `backfillMaxConsecutiveFailures` 3, `columnMaxGenres` 3. Code reads them from `module/config.ts`, never from literals.
- **Toggle:** storage key `showGenre:playlistColumn` (`PLAYLIST_COLUMN_STORAGE_KEY`), on when absent. Label "Show genres column in playlists".
- **Copy:** waiting "…" with `title="Looking up genres"`; nothing found "—" with `title="No genres found"`; header text "Genres"; inferred tooltip suffix `" — " + INFERRED_TITLE`.
- **Grid track:** `minmax(120px, 2fr)`, inserted before the `[last]` line name. Without `[last]`, add nothing (AC14).
- **Rendering:** genre text goes into the DOM via `textContent` only. No `innerHTML`, no `<a>`, no click handlers in column code (AC9, AC37).
- **Selectors:** every Spotify tracklist selector lives in `module/tracklist-dom.ts`.
- **Unchanged files:** `.forgejo/`, `LICENSE`, `ant.lockb`, `module/metadata.json`, `package.json`, `tsconfig*.json`. `test/repo-invariants.test.mts` checks part of this.
- **Test imports:** test files import modules with the `.ts` extension. Modules imported by tests must not import `/modules/stdlib/...`, and must not use enums, namespaces or parameter properties.
- **Commits:** Conventional Commits (`feat(column): …`, `test: …`, `docs: …`). No AI-attribution lines.
- **Pre-commit gate:** before every commit, a verification subagent runs `bun run check && bun run test` from the repo root and reports `STATUS: PASS` or `STATUS: FAIL`. Commit only on PASS. Never `--no-verify`.
- **Workspace:** work happens on branch `feat/playlist-genres-column` in the main checkout. No worktree needed (spec §11 note).

## Review Focus

1. **Huge playlists (5,000+ tracks) and leaving mid-listing.** Listing pages through `getContents` must stop when the visit is aborted, and must not start a backfill for a page you already left. Test in Task 7.
2. **The same track twice in one playlist.** It should be looked up once, and both rows should update. Test in Task 6.
3. **`getContents` failing (offline, API change).** Cells should still render whatever the cache holds for the rows on screen, with no unhandled rejection and no backfill. Covered in Task 9's design, and checked in the live check (Task 12).
4. **Tracks with several artists.** Use the first artist, as the now-playing row does (`artist_name`), so the column and the row hit the same cache result. Test in Task 7.
5. **Audio setting toggled during a visit.** `needsLookup` must read the setting at each pick, not once at visit start, and audio cells must switch between genres and waiting at the next render. Test in Task 6, plus `cellView` cases in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `module/config.ts` (modify) | New named settings and storage key. |
| `module/genre-pipeline.ts` (modify) | `effectiveCacheDecision`, `needsLookup`, `GenreResult.reachable`, `GenreScheduler.resolveBackfill`. |
| `module/request-queue.ts` (modify) | `backfill` priority, `backfillMinIntervalMs`, drop/idle rules. |
| `module/genre-cache.ts` (modify) | `getMany` on the store interface, memory store, `withChangeEvents`. |
| `module/genre-cache-idb.ts` (modify) | `getMany` in one transaction. |
| `module/column-cell.ts` (new) | `cellView`: what a cell shows (pure). |
| `module/backfill.ts` (new) | Visits, picking, one-at-a-time, stop/restart (pure). |
| `module/playlist-source.ts` (new) | `getContents` pager and item → `TrackRef` mapping (pure). |
| `module/tracklist-dom.ts` (new) | Selectors, grid-rule builder, row URI, cell/header injection and removal. |
| `module/playlist-column.ts` (new) | Wiring: page changes, entry map, observer, visits. |
| `module/settings.tsx`, `module/mod.tsx`, `module/index.scss` (modify) | Toggle, wiring, styles. |
| `test/*.test.mts` | One test file per pure unit. |

---

### Task 1: Settings, `needsLookup` and reachability (AC19; supports AC30)

**Files:**
- Modify: `module/config.ts`, `module/genre-pipeline.ts`
- Test: `test/genre-pipeline.test.mts`, `test/config.test.mts`

**Interfaces:**
- Produces in `config.ts`:
  - `musicbrainzBackfillIntervalMs = 6000`
  - `backfillMaxConsecutiveFailures = 3`
  - `columnMaxGenres = 3`
  - `PLAYLIST_COLUMN_STORAGE_KEY = "showGenre:playlistColumn"`
- Produces in `genre-pipeline.ts`:
  - `effectiveCacheDecision(entry: GenreCacheEntry | undefined, now: number, rules: CacheRules, audioEnabled: boolean, modelReady: boolean): CacheDecision` — `decideCacheAction` plus the two overrides currently inline in `resolveTrack`. `resolveTrack` must call it.
  - `needsLookup(...same params): boolean`, which is `effectiveCacheDecision(...).kind !== "serve"`.
  - `GenreResult` gains `reachable?: boolean`: `mb.reachable` on every return after the MusicBrainz call, absent when served from cache or skipped before it.

- [ ] **Step 1: Write the failing tests** in `test/genre-pipeline.test.mts`, using the file's existing `setup`, `NOW` and fixtures:

```ts
const fixtures: Array<[string, GenreCacheEntry | undefined, { audio: boolean; ready: boolean }]> = [
  ["absent", undefined, { audio: true, ready: true }],
  ["mb fresh", { uri: track.uri, genres: ["rock"], source: "musicbrainz", checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
  ["mb expired", { uri: track.uri, genres: ["rock"], source: "musicbrainz", checkedAt: NOW - musicbrainzTtlDays * DAY_MS }, { audio: true, ready: true }],
  ["audio fresh", { uri: track.uri, genres: ["darkwave"], source: "audio", modelVersion: MODEL_VERSION, checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
  ["audio expired", { uri: track.uri, genres: ["darkwave"], source: "audio", modelVersion: MODEL_VERSION, checkedAt: NOW - audioRecheckDays * DAY_MS }, { audio: true, ready: true }],
  ["audio, setting off", { uri: track.uri, genres: ["darkwave"], source: "audio", modelVersion: MODEL_VERSION, checkedAt: NOW - DAY_MS }, { audio: false, ready: false }],
  ["audio, other model", { uri: track.uri, genres: ["darkwave"], source: "audio", modelVersion: "old", checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
  ["none fresh", { uri: track.uri, genres: [], source: "none", audioTried: true, checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
  ["none expired", { uri: track.uri, genres: [], source: "none", audioTried: true, checkedAt: NOW - notFoundTtlDays * DAY_MS }, { audio: true, ready: true }],
  ["none, audio not tried, now ready", { uri: track.uri, genres: [], source: "none", audioTried: false, checkedAt: NOW - DAY_MS }, { audio: true, ready: true }],
];
for (const [name, entry, flags] of fixtures) {
  test(`needs_lookup_matches_resolve: ${name} (column AC19)`, async () => {
    const store = createMemoryStore();
    if (entry) await store.put(entry);
    const s = setup({ store, audio: flags.audio, ready: flags.ready, mb: HIT });
    await resolveTrack(track, s.deps, "current");
    assert.equal(needsLookup(entry, NOW, s.deps.rules, flags.audio, flags.ready), s.calls.mb === 1);
  });
}

test("result_carries_reachability", async () => {
  assert.equal((await resolveTrack(track, setup({ mb: DOWN, audio: false }).deps, "current")).reachable, false);
  assert.equal((await resolveTrack(track, setup({ mb: MISS, audio: false }).deps, "current")).reachable, true);
});
```

Adapt to the names `setup` actually returns (`s.calls`, `s.deps`). In `test/config.test.mts`, add one assertion per new constant, with the values above.

- [ ] **Step 2: Run the tests and confirm they fail.** Run: `node --test test/genre-pipeline.test.mts test/config.test.mts`. Expected: FAIL (`needsLookup` is not exported).
- [ ] **Step 3: Implement it.** Add the constants, extract `effectiveCacheDecision` from `resolveTrack` (lines 61–68 today), add `needsLookup` and set `reachable` on the results. Existing behaviour must not change.
- [ ] **Step 4: Run all tests and confirm they pass.** Run: `bun run test`. Expected: PASS, including every existing pipeline and scheduler test.
- [ ] **Step 5: Commit.** `git commit -m "feat(column): share the cache-lookup rule and report reachability"`

### Task 2: Queue `backfill` priority (AC22–AC26)

**Files:**
- Modify: `module/request-queue.ts`
- Test: `test/request-queue.test.mts`

**Interfaces:**
- Produces: `type Priority = "current" | "prefetch" | "backfill"`.
- `createRequestQueue` options gain `backfillMinIntervalMs?: number` (default 0).
- Order: `current`, then `prefetch`, then `backfill`, FIFO within each.
- A `backfill` job starts only when no `current`/`prefetch` job is waiting, and when `now ≥ lastStart + backfillMinIntervalMs`. `lastStart` is the previous start of any priority. The budget window still applies to every start.
- `dropWhere` never removes `backfill` jobs.
- `isIdle()`/`onIdle` count only `current`/`prefetch` jobs, waiting or running. Update the doc comments to say so.

- [ ] **Step 1: Write the failing tests**, using the file's `FakeClock` and `opts`:

```ts
const bopts = (clock: Clock) => ({ ...opts(clock, 1, 1000), backfillMinIntervalMs: 6000 });

test("backfill_spaced_by_interval (column AC22)", async () => {
  // three backfill jobs → starts [0, 6000, 12000]
});
test("backfill_interval_counts_any_priority (column AC22)", async () => {
  // current at t=0, backfill enqueued at t=0 → backfill starts at 6000
});
test("current_budget_unchanged_while_backfill_waits (column AC22)", async () => {
  // backfill b1 (starts 0), then three currents at t=0 → starts 1000, 2000, 3000; b2 → 9000
});
test("foreground_before_backfill (column AC23)", async () => {
  // blocker(current), X(backfill), A(prefetch), B(current) → order blocker, B, A, X
});
test("drop_skips_backfill (column AC24)", async () => {
  // dropWhere(() => true) rejects waiting current/prefetch with DroppedError; the waiting backfill job still runs
});
test("idle_ignores_backfill (column AC25)", async () => {
  // with only backfill work waiting or running: isIdle() === true; onIdle fires when the last current job ends while backfill waits
});
test("quota_pause_holds_backfill (column AC26)", async () => {
  // a current job throws QuotaError at t=0 → no backfill start before 5000
});
```

Each test asserts the start times or order named in its comment.

- [ ] **Step 2: Run the tests and confirm they fail.** Run: `node --test test/request-queue.test.mts`. Expected: the new tests FAIL. The type error on `"backfill"` counts.
- [ ] **Step 3: Implement it** in `request-queue.ts`. Keep a separate count of running foreground jobs for `isIdle`. `pump` schedules `wakeLater(lastStart + backfillMinIntervalMs)` when only backfill work waits.
- [ ] **Step 4: Run all tests and confirm they pass.** Run: `bun run test`. Expected: PASS, and the existing AC14–AC17 queue tests are unchanged.
- [ ] **Step 5: Commit.** `git commit -m "feat(column): add a paced backfill priority to request queues"`

### Task 3: Bulk cache reads, change events and `resolveBackfill` (supports AC11, AC31, AC33)

**Files:**
- Modify: `module/genre-cache.ts`, `module/genre-cache-idb.ts`, `module/genre-pipeline.ts`
- Test: `test/genre-cache.test.mts`, `test/genre-scheduler.test.mts`. Also update the store fakes in `test/genre-pipeline.test.mts` to forward `getMany`.

**Interfaces:**
- `GenreCacheStore.getMany(uris: string[]): Promise<Map<string, GenreCacheEntry>>`. Only present entries; IndexedDB does it in one read transaction.
- `type GenreCacheChange = { kind: "put"; entry: GenreCacheEntry } | { kind: "clear" }`
- `interface ObservableGenreStore extends GenreCacheStore { subscribe(listener: (change: GenreCacheChange) => void): () => void }`
- `withChangeEvents(store: GenreCacheStore): ObservableGenreStore` emits after the inner write resolves. A rejected write emits nothing and rethrows.
- `GenreScheduler.resolveBackfill(track: TrackRef): Promise<GenreResult>` runs `resolveTrack(track, pipeline, "backfill")` with the scheduler's cache epoch, so "Clear genre cache" also voids backfill writes.

- [ ] **Step 1: Write the failing tests:**
  - `getmany_returns_present_only`: put a and b, then `getMany([a, b, c])` gives a map of size 2.
  - `change_events_put_and_clear`: a listener receives `{kind:"put", entry}`, then `{kind:"clear"}`, and receives nothing after unsubscribing.
  - `failed_put_emits_nothing`: the inner `put` rejects, the wrapper rejects, and the listener is not called.
  - `resolve_backfill_uses_backfill_priority (column AC33)`: in the scheduler test `setup`, record the `priority` the `musicbrainz` dep receives; `resolveBackfill(ref("a"))` gives `"backfill"`.
  - `resolve_backfill_after_clear_writes_nothing (column AC31)`: hold track a's MusicBrainz result with `holds`, call `clearCache()`, release it, then `store.get(a)` is `undefined`.
- [ ] **Step 2: Run the tests and confirm they fail.** Run: `node --test test/genre-cache.test.mts test/genre-scheduler.test.mts`. Expected: FAIL.
- [ ] **Step 3: Implement** `getMany` (memory and IndexedDB, no `indexedDB.open` version change), `withChangeEvents`, and `resolveBackfill`.
- [ ] **Step 4: Run all tests and confirm they pass.** Run: `bun run test && bun run check`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(column): add bulk cache reads, change events and backfill resolution"`

### Task 4: `column-cell.ts` (AC3–AC9 view, AC31 view)

**Files:**
- Create: `module/column-cell.ts`
- Test: `test/column-cell.test.mts`

**Interfaces:**
- Produces: `type CellState = "genres" | "waiting" | "none" | "empty"`.
- Produces: `interface CellView { state: CellState; text: string; title: string; inferred: boolean }`.
- Produces: `cellView(uri: string | null, track: TrackRef | undefined, entry: GenreCacheEntry | undefined, audioEnabled: boolean): CellView`.
- Exports the copy constants `WAITING_TEXT`, `WAITING_TITLE`, `NONE_TEXT`, `NONE_TITLE`.

Rules, in order:

| Case | Cell |
|---|---|
| `uri` null or not `spotify:track:`; or the known `track` is local, not a track, or has an empty artist or title | `empty` (text `""`, title `""`) |
| `audio` entry | `genres` and inferred when `audioEnabled`, else `waiting` |
| `musicbrainz` entry with genres | `genres` |
| `none` entry | `none` |
| no entry (including a catalogue `uri` whose `track` is not listed yet) | `waiting` |

The view never looks at the entry's age (AC8). Text is the first `columnMaxGenres` genres through `prettifyGenre`, joined with ", ", with `"≈ "` in front when inferred. The title is all genres the same way, plus `" — " + INFERRED_TITLE` when inferred.

- [ ] **Step 1: Write the failing tests**, one per AC:
  - `first_three_prettified_full_title (column AC3)`: `["post-punk","darkwave","coldwave","new wave"]` gives text `"Post-Punk, Darkwave, Coldwave"`, and the title has all four.
  - `audio_inferred_and_hidden_when_off (column AC4)`
  - `no_entry_waiting (column AC5)`, also for an unlisted catalogue URI
  - `none_dash (column AC6)`
  - `empty_for_local_episode_missing_fields (column AC7)`: a `spotify:local:` URI, a `spotify:episode:` URI, `null`, and a track with an empty artist
  - `age_ignored (column AC8)`: entries with `checkedAt: 0` give the same view as fresh ones, including audio with the setting off
  - `text_is_prettified_input (column AC9)`: `text === prettifyGenre("<img src=x onerror=alert(1)>")`

  Assert exact expected strings computed with `prettifyGenre`, never hand-typed casing.
- [ ] **Step 2: Run the tests and confirm they fail.** Run: `node --test test/column-cell.test.mts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `cellView`** in `module/column-cell.ts`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run: `node --test test/column-cell.test.mts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(column): add cell view rules"`

### Task 5: Operator gate and live probe of Spotify's tracklist (spec §3 risk)

The DOM and listing code depend on shapes that must be confirmed live first.

- [ ] **Step 1: Hand the operator this step and wait for confirmation.** "Start Spotify with DevTools available. Either launch `spotify --remote-debugging-port=9222` so the agent can attach through the DevTools protocol, as in the 2026-10-06 probes, or open DevTools yourself (`spicetify enable-devtools`, then Ctrl+Shift+I) and paste the outputs back. Then open a playlist of 20+ tracks. If you have one that holds a local file or a podcast episode, open it too."
- [ ] **Step 2: Run these snippets** in the page context and capture the output:

```js
const P = Spicetify.Platform, id = P.History.location.pathname.split("/")[2];
const r = await P.PlaylistAPI.getContents(`spotify:playlist:${id}`, { limit: 2, offset: 0 });
JSON.stringify({ keys: Object.keys(r), totalLength: r.totalLength, item: r.items[0] }, null, 1);
const list = document.querySelector(".main-trackList-trackList");
[list?.style.getPropertyValue("--grid-template-columns"), list?.getAttribute("aria-colcount")];
const row = document.querySelector(".main-trackList-trackListRow");
[Object.keys(row).filter((k) => k.startsWith("__react")), row.querySelectorAll("[aria-colindex]").length];
```

Repeat the grid snippet with the window about 900 px wide, and the `getContents` snippet on a local-file or episode item if one exists.
- [ ] **Step 3: Record the results.**
  - Write `test/fixtures/playlist-contents.json` with one track item, plus a local item and an episode item if found. Replace names with placeholders and keep field names and types.
  - Write `test/fixtures/tracklist-grid.json` as `{ "wide": "<value>", "narrow": "<value>" }`.
  - Add a dated note at the top of `module/tracklist-dom.ts` later (Task 8) quoting the Spotify version.
- [ ] **Step 4: Check the assumptions.** If neither grid value contains `[last]`, or the item has no URI or artist names, STOP and report to the user: spec §3 does not hold, and AC13/AC18 need revisiting.
- [ ] **Step 5: Commit.** `git commit -m "test: record live tracklist and playlist-contents fixtures"`

### Task 6: `backfill.ts` (AC20, AC21, AC27–AC32)

**Files:**
- Create: `module/backfill.ts`
- Test: `test/backfill.test.mts`

**Interfaces:**
- Consumes: `TrackRef`, `isCatalogueTrack`, `GenreResult` (with `reachable`) from `genre-pipeline.ts`.
- Produces:

```ts
export interface VisitDeps { needsLookup(track: TrackRef): boolean; renderedUris(): string[] }
export interface Visit { stop(): void; addTracks(tracks: TrackRef[]): void; restart(): void }
export interface Backfill { startVisit(tracks: TrackRef[], deps: VisitDeps): Visit }
export function createBackfill(deps: { resolve(track: TrackRef): Promise<GenreResult>; maxConsecutiveFailures: number }): Backfill
```

**Picking.** A track is eligible when it is a catalogue track, has a nonempty artist and title, hasn't been tried this visit, and `needsLookup(track)` is true at pick time. The pick is the first eligible track among `renderedUris()` in on-screen order, else the first eligible in list order. Tracks are deduplicated by URI.

**Running:**
- **One at a time:** a backfill controller has at most one outstanding `resolve` across all its visits.
- **Starting a visit:** `startVisit` stops the previous visit, and the new visit's first pick waits for any outstanding call.
- **Nothing to pick:** the visit parks until `addTracks` or `restart`.

**Results:**
- **Unreachable:** `reachable === false` adds one to the failure count. At `maxConsecutiveFailures`, the visit stops picking.
- **Reachable:** `reachable === true` resets the failure count.
- **Rejected:** a rejected `resolve` counts as neither.

**`restart`** clears the tried set and the failure count, and resumes picking even after a failure stop. **`stop`** is final: the outstanding call finishes, and no new pick starts.

- [ ] **Step 1: Write the failing tests.** Use a fake `resolve` that records URIs and returns deferreds you settle by hand. Use a `flush()` helper that awaits `setImmediate` 20 times, as `FakeClock.flush` does.
  - `picks_rendered_first (column AC20)`
  - `then_playlist_order (column AC20)`
  - `skips_ineligible (column AC7)`
  - `one_outstanding_across_visits (column AC21)`: visit A's call is pending, `startVisit(B)` makes no call until A settles
  - `stop_lets_outstanding_finish_no_new_picks (column AC27)`
  - `new_visit_stops_old (column AC28)`
  - `tried_once_per_visit (column AC29)`: a failing track is not re-picked, and a new visit picks it again
  - `stops_after_consecutive_unreachable (column AC30)`, and `reachable_resets_failure_count (column AC30)`
  - `restart_clears_tried_and_failures (column AC31)`
  - `add_tracks_appends_and_wakes (column AC32)`
  - `duplicate_uri_once (Review Focus 2)`
  - `needs_lookup_read_at_pick_time (Review Focus 5)`: flip the predicate mid-visit, and the next pick follows it
- [ ] **Step 2: Run the tests and confirm they fail.** Run: `node --test test/backfill.test.mts`. Expected: FAIL.
- [ ] **Step 3: Implement `createBackfill`** in `module/backfill.ts`, as one async loop per visit guarded by a shared `outstanding` promise.
- [ ] **Step 4: Run the tests and confirm they pass.** Run: `node --test test/backfill.test.mts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(column): add playlist backfill visits"`

### Task 7: `playlist-source.ts` (AC18)

**Files:**
- Create: `module/playlist-source.ts`
- Test: `test/playlist-source.test.mts`, using `test/fixtures/playlist-contents.json` from Task 5

**Interfaces:**
- `type GetContents = (uri: string, opts: { limit: number; offset: number }) => Promise<unknown>`
- `listPlaylistTracks(getContents: GetContents, uri: string, signal?: AbortSignal): Promise<TrackRef[]>`. Pages with `limit: 100` from `offset: 0` until `totalLength` items are seen or a page comes back empty. Throws `signal.reason` when aborted between pages.
- `playlistItemToTrackRef(item: unknown): TrackRef | undefined`. Maps uri, first artist name, name, duration in seconds (null when missing), and the local and track flags. Use the field names the Task 5 fixture shows.

- [ ] **Step 1: Write the failing tests:**
  - `pages_until_total (column AC18)`: total 250 gives calls with offsets `[0, 100, 200]` and `limit: 100`, and 250 tracks
  - `empty_playlist_single_call`
  - `aborted_listing_stops (Review Focus 1)`: abort after the first page; it rejects and makes no further call
  - `maps_fixture_item`, `maps_local_and_episode` (if the fixture has them)
  - `first_artist_used (Review Focus 4)`
- [ ] **Step 2: Run the tests and confirm they fail.** Run: `node --test test/playlist-source.test.mts`. Expected: FAIL.
- [ ] **Step 3: Implement it** in `module/playlist-source.ts`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run: `node --test test/playlist-source.test.mts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(column): list playlist tracks through PlaylistAPI"`

### Task 8: `tracklist-dom.ts` (AC13, AC14 builder; AC9, AC37 guard)

**Files:**
- Create: `module/tracklist-dom.ts`
- Test: `test/tracklist-dom.test.mts`, `test/repo-invariants.test.mts` (add a test)

**Interfaces.** Pure, importable by tests (no DOM access at import time):
- `GENRES_TRACK = "minmax(120px, 2fr)"`
- `withGenresColumn(template: string): string | null`. Inserts `"[genres] " + GENRES_TRACK + " "` before `[last]`. Returns `null` without `[last]`, and returns the input unchanged if it already holds `[genres]`.
- `findRowUri(props: unknown, maxDepth = 10): string | null`. A breadth-first search for a `uri` property whose value matches `^spotify:(track|episode|local):`, skipping cycles.

Browser functions:
- `SELECTORS` (spec §3 classes)
- `rowUri(row: HTMLElement): string | null`. Checks the `__reactProps$*` key with `findRowUri`, then `a[href*="/track/"]`, which gives `spotify:track:<id>`.
- `installColumn(list: HTMLElement): boolean`. Marks the tracklist with `data-genres-col`, writes the rule into `<style id="spotify-genres-column-style">`, sets `aria-colcount` to Spotify's value + 1 (Spotify's own value kept in `data-genres-native-colcount` and refreshed whenever React rewrites it), and adds the header cell (`role="columnheader"`, text "Genres"). Returns false and changes nothing when `withGenresColumn` returns null.
- `ensureRowCell(row: HTMLElement): HTMLElement`. Inserts one `role="gridcell"` cell before `.main-trackList-rowSectionEnd` and bumps that cell's `aria-colindex`.
- `renderCell(cell: HTMLElement, view: CellView, uri: string | null): void`. Uses `textContent`, `title`, classes `spotify-genres-cell--{state}` and `--inferred`, and `data-genres-uri`.
- `uninstallColumn(doc: Document): void`. Reverses everything (AC15).

- [ ] **Step 1: Write the failing tests:**
  - `inserts_before_last (column AC13)`: for both fixture strings, the result contains `"[genres] minmax(120px, 2fr) [last]"`, and the rest is unchanged
  - `null_without_last (column AC14)`
  - `idempotent_with_genres`
  - `find_row_uri_shallowest_first`: nested `{props:{item:{uri:"spotify:track:A", album:{uri:"spotify:album:X"}}}}` gives A; cycles terminate
  - In `repo-invariants`, `column_code_renders_text_only (column AC9, AC37)`: `tracklist-dom.ts`, `playlist-column.ts` and `column-cell.ts` contain none of `innerHTML`, `insertAdjacentHTML`, `createElement("a")`, `"click"`
- [ ] **Step 2: Run the tests and confirm they fail.** Run: `node --test test/tracklist-dom.test.mts test/repo-invariants.test.mts`. Expected: FAIL.
- [ ] **Step 3: Implement it** in `module/tracklist-dom.ts`. Quote the Spotify version from Task 5 in a header comment.
- [ ] **Step 4: Run all tests and confirm they pass.** Run: `bun run test && bun run check`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(column): add tracklist column DOM helpers"`

### Task 9: `playlist-column.ts` and styles (AC1, AC10–AC12, AC14 warning, AC15–AC17, AC28, AC31, AC38)

**Files:**
- Create: `module/playlist-column.ts`
- Modify: `module/index.scss`
- Test: `test/playlist-column.test.mts` (pure helper only)

**Interfaces:**
- Consumes:
  - Task 3: `ObservableGenreStore`, `GenreScheduler.resolveBackfill`
  - Task 4: `cellView`
  - Task 6: `Backfill`
  - Task 7: `listPlaylistTracks`
  - Task 8: `SELECTORS`, `rowUri`, `installColumn`, `ensureRowCell`, `renderCell`, `uninstallColumn`
  - Task 1: `needsLookup`
- Produces:

```ts
export function playlistUriFromPath(pathname: string): string | null   // "/playlist/abc" → "spotify:playlist:abc", else null
export interface PlaylistColumnDeps {
  store: ObservableGenreStore;
  backfill: Backfill;
  history: { location: { pathname: string }; listen(cb: (location: { pathname: string }) => void): () => void };
  listTracks(playlistUri: string, signal: AbortSignal): Promise<TrackRef[]>;
  audioEnabled(): boolean; modelReady(): boolean; now(): number; rules: CacheRules;
  log(level: "warn" | "debug", ...args: unknown[]): void;
}
export function startPlaylistColumn(deps: PlaylistColumnDeps): { stop(): void }
```

Behaviour:
- **Page changes:** on start and on each `history.listen` change, abort the previous visit (its `AbortController` and `visit.stop()`) and clear the entry map. If the path is a playlist, start a new one.
- **One observer:** a `MutationObserver` on `document.body` (`childList`, `subtree`, `attributes` filtered to `style` and `aria-colcount`), throttled to one pass per animation frame.
- **Each pass:**
  - `installColumn` on each unmarked tracklist. On `false`, log one warning per visit and stop processing that tracklist.
  - Rebuild the rule when the grid variable changed.
  - `ensureRowCell` plus `renderCell(cellView(...))` for each row, including loading placeholder rows (empty view).
  - Collect URIs missing from the map, `getMany` them in one batch, and re-render. This also covers a failed listing (Review Focus 3).
- **Starting the backfill:** after `listTracks` resolves (and has not been aborted), `getMany` its URIs into the map, then call `backfill.startVisit(tracks, { needsLookup: (t) => needsLookup(map.get(t.uri), now(), rules, audioEnabled(), modelReady()), renderedUris })`. If listing fails, log a warning and run no visit.
- **Unknown tracks:** a rendered `spotify:track:` URI that isn't in the listed tracks triggers a re-list debounced to 2000 ms, and the new tracks go to `visit.addTracks` (AC32).
- **Store events:** `put` updates the map and re-renders cells with that URI. `clear` empties the map, re-renders, and calls `visit.restart()` (AC31).
- **Stop:** `stop()` unsubscribes, disconnects, stops the visit, and calls `uninstallColumn(document)`.

Styles in `index.scss`, scoped under `[data-genres-col]`:
- one line, `overflow: hidden`, `text-overflow: ellipsis`, `color: var(--spice-subtext)`, and the Album column's font size (AC38);
- `--inferred` italic;
- `--waiting` at reduced opacity.

- [ ] **Step 1: Write the failing test.** `path_to_playlist_uri (column AC17)`: `/playlist/abc` gives `spotify:playlist:abc`; `/collection/tracks`, `/album/x`, `/artist/x`, `/search/x` and `/playlist/` give `null`.
- [ ] **Step 2: Run the test and confirm it fails.** Run: `node --test test/playlist-column.test.mts`. Expected: FAIL.
- [ ] **Step 3: Implement** `module/playlist-column.ts` and the styles.
- [ ] **Step 4: Run all tests and confirm they pass.** Run: `bun run test && bun run check`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(column): wire the playlist genres column"`

### Task 10: Settings toggle and `mod.tsx` wiring (AC16, AC34; AC22 in production)

**Files:**
- Modify: `module/settings.tsx`, `module/mod.tsx`

**Interfaces:**
- `GenreSettingsDeps` gains `getColumnEnabled(): boolean` and `setColumnEnabled(v: boolean): void`. A `SettingsToggleRow` labelled "Show genres column in playlists" sits above the audio toggle.

Wiring in `mod.tsx`:
- **Store:** `const store = withChangeEvents(openIndexedDbStore())`, shared by the scheduler and the column.
- **MusicBrainz queue:** gets `backfillMinIntervalMs: musicbrainzBackfillIntervalMs`. The Deezer queue keeps the default 0.
- **Backfill:** `createBackfill({ resolve: (t) => scheduler.resolveBackfill(t), maxConsecutiveFailures: backfillMaxConsecutiveFailures })`, created once.
- **Toggle state:** `columnEnabled = () => client.storage.get(PLAYLIST_COLUMN_STORAGE_KEY) !== "false"`.
- **Start/stop:** while enabled, `startPlaylistColumn` runs with `history: client.platform.History` and `listTracks: (u, s) => listPlaylistTracks((uri, o) => client.platform.PlaylistAPI.getContents(uri, o), u, s)`. `setColumnEnabled` writes the key, then starts or stops it (AC16, AC15).
- **Unload:** `ctx.defer` stops it.

- [ ] **Step 1: Implement** the toggle and the wiring.
- [ ] **Step 2: Verify.** Run: `bun run check && bun run test && bun run build`. Expected: all PASS, and `dist/spotify-genres@0.1.0/index.js` exists.
- [ ] **Step 3: Commit.** `git commit -m "feat(column): add the column toggle and wire it into the module"`

### Task 11: Documentation (AC36)

**Files:**
- Modify: `README.md`, `CONTRIBUTING.md`
- Test: `test/repo-invariants.test.mts`

- [ ] **Step 1: Write the failing test.** `readme_playlist_column (column AC36)`:
  - `## Playlist column` comes right after the `## Audio fallback` section;
  - the section mentions "Settings", "MusicBrainz", "Deezer" and "600";
  - the `## Previews` section mentions "column";
  - `CONTRIBUTING.md` includes `module/tracklist-dom.ts` and `2026-10-10-playlist-genres-column.md`.
- [ ] **Step 2: Run the test and confirm it fails.** Run: `node --test test/repo-invariants.test.mts`. Expected: FAIL.
- [ ] **Step 3: Write the README section and the CONTRIBUTING note** with the content AC36 lists.
- [ ] **Step 4: Run the test and confirm it passes.** Run: `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "docs: document the playlist genres column"`

### Task 12: Operator gate and live check (spec §5.1; AC1, AC2, AC10, AC12, AC13, AC15–AC17, AC28, AC34, AC38)

- [ ] **Step 1: Hand the operator Manual Operator Step 1** from spec §9 (build, install, restart Spotify with DevTools access as in Task 5) and wait for confirmation.
- [ ] **Step 2: Run the six live checks in spec §5.1**, plus these:
  - **AC34:** the toggle shows in Settings → Genres, on when `showGenre:playlistColumn` is absent.
  - **AC2:** click the "Genres" header; the order doesn't change.
  - **AC12:** the column stays aligned while a playlist loads.
  - **AC38:** check the cell's computed `color`, `font-size` (compare with the Album cell), `text-overflow` and `white-space`.
  - **Review Focus 3:** with the network offline, open a playlist. Cached rows still show, and the console has no unhandled rejection.
- [ ] **Step 3: Report** each check as pass or fail, with a screenshot or console output. Fix failures in `tracklist-dom.ts` or `playlist-column.ts`, then re-run the affected checks.
- [ ] **Step 4: Commit any fixes.** `git commit -m "fix(column): <what the live check found>"`

### Task 13: Deferred-item verification

- [ ] **Step 1: Check the deferred issues.** For each of #7, #8, #9, run `gh issue view <n> --json body | jq -r .body | grep -c '^## \(Context\|Required\|Integration Points\|Priority\)$'`. Expected: `4` for each.

### Task 14: Post-implementation check

- [ ] **Step 1: Confirm each item against `git diff main --stat` and the files themselves**, not against plan checkboxes:
  - `module/config.ts` has the four new settings;
  - `module/index.scss` has the column styles;
  - `module/genre-cache-idb.ts` has `getMany` with no version bump;
  - README and CONTRIBUTING are updated;
  - `git diff main -- .forgejo LICENSE ant.lockb module/metadata.json package.json` is empty;
  - the deferred items are verified.

### Task 15: Final build

- [ ] **Step 1: Build.** Run `bun run build` and fix any issues until it builds successfully. Expected: `dist/spotify-genres@0.1.0/` is regenerated without errors.

---

## Before finishing the branch

After Task 15, if the Codex plugin is available, run its adversarial review with this focus: *"Judge correctness against the spec's acceptance criteria (AC1–AC38 of docs/specs/2026-10-10-playlist-genres-column.md) only. Do not flag anything outside the stated criteria — no design alternatives, hardening, or scope the spec did not claim."* It is advisory and never gates the merge. Then use `superpowers:finishing-a-development-branch`.
