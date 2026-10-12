# Playlist genres column — design

- **Date:** 2026-10-10
- **Branch:** `feat/playlist-genres-column`
- **Status:** Approved design, pending written-spec review
- **Builds on:** `docs/specs/2026-10-06-audio-genre-fallback.md` — the per-track IndexedDB genre cache (§4.1 there), `resolveTrack` (cache → MusicBrainz → audio) in `module/genre-pipeline.ts`, and the per-service request queues in `module/request-queue.ts`. Every rule of that spec still applies; this spec adds a second consumer of the same cache.

## 1. Goal

Show a read-only **Genres** column in Spotify's playlist tracklist. A slow **backfill** works down the open playlist and looks up each uncached track with the same pipeline as the now-playing row. Results are stored in the existing IndexedDB cache, so reopening the playlist after a Spotify restart shows them without new lookups.

**Success:** opening a playlist you have opened before shows its genres at once, and a new playlist fills in at about 600 tracks an hour without slowing the now-playing row.

## 2. Decisions (from the brainstorm)

| # | Decision |
|---|---|
| Purpose | **Read-only column.** Sorting and filtering by genre are out of scope (#7): Spotify's native sort has no slot for a custom column. |
| Technique | **DOM injection** into Spotify's tracklist (header cell, one cell per row, one injected grid rule), as star-ratings and Sort-Play do. The stdlib has no column API; patching xpui via mixins and a separate "Genres" page were rejected. |
| Pages | **Playlist pages only** (`/playlist/<id>`). Liked Songs and albums deferred (#9). |
| Backfill scope | **Whole open playlist, rendered rows first.** Stops on leaving the page; resumes on the next visit because finished tracks are cached. |
| Backfill pace | A backfill MusicBrainz lookup (2 HTTP requests) starts at least `musicbrainzBackfillIntervalMs` (6000) after the previous lookup start, so ≈ 1 request per 3 s, ≈ 6 s per track. Now-playing lookups keep the existing budget and always go first. |
| Audio fallback | **Same chain as now-playing.** The backfill calls `resolveTrack`, so with the audio setting on and the model `Ready`, MusicBrainz misses go to Deezer and the classifier. |
| Cell content | First `columnMaxGenres` (3) genres, title-cased like the now-playing row (`prettifyGenre`), comma-separated, cut with an ellipsis when too wide; tooltip lists all genres. |
| Links | **Plain text.** Clickable genres deferred (#8). |
| Expired entries | Column shows an expired entry's genres until the backfill's refresh replaces them. Now-playing rules unchanged. |
| States | Waiting = faint "…" (tooltip "Looking up genres"); nothing found = "—" (tooltip "No genres found"); local file, podcast episode or a track without artist/title = empty. |
| Toggle | Settings → Genres → "Show genres column in playlists", storage key `showGenre:playlistColumn`, **default on** (absent = on). Off removes the column and stops the backfill. |

## 3. Facts this design relies on

From a read-only survey of the local Spotify install (`/opt/spotify/Apps/xpui/`), the stdlib (`~/.config/spicetify/store/stdlib/1.13.2/`), and the star-ratings and Sort-Play extensions on 2026-10-06:

- The stdlib registers no tracklist-column type, and `mod.ts` exports none of its internal `Tracklist*` components.
- Tracklist selectors: `.main-trackList-trackList`, `.main-trackList-trackListHeaderRow`, `.main-trackList-trackListRow` (`data-testid="tracklist-row"`), `.main-trackList-trackListRowGrid`, `.main-trackList-rowSectionVariable`, `.main-trackList-rowSectionEnd`. Cells carry `aria-colindex` and role `gridcell`/`columnheader`.
- React sets an inline `--grid-template-columns` and `aria-colcount` on the tracklist root. The value has the shape `[index] … [first] … [var1] … [last] …`. The CSS is `.main-trackList-trackListRowGrid { grid-template-columns: var(--grid-template-columns) }`.
- Rows are virtualised: row elements are reused for other tracks as you scroll.
- Row → URI: search the row's `__reactProps$…` recursively for a `spotify:track:` string (depth ≤ 10); fall back to `a[href*="/track/"]`.
- Full track list: `client.platform.PlaylistAPI.getContents(uri, { limit: 100, offset })`, paged until `totalLength`; items carry `uri`, `name`, `artists[].name`, `duration`. Current page: `client.platform.History.location.pathname`, changes via `History.listen`.
- A MusicBrainz lookup (`fetchGenresFromMusicBrainz`) is one queue task making 2 HTTP requests (search, then tags).

**Risk:** the exact `getContents` item shape (duration field name, local-file and episode markers) and the `[last]` line name must be confirmed live before the code depends on them. The first plan task touching each must prove it in Spotify via DevTools.

## 4. Architecture

| Unit | Purpose | Pure? |
|---|---|---|
| `module/tracklist-dom.ts` | The only file with Spotify tracklist selectors. Find tracklists, add/remove header and cells, row → URI, build the grid rule (`withGenresColumn(template)` returns the new template or `null` when the shape check fails), adjust `aria-colcount`/`aria-colindex`. | Grid-rule builder pure; rest browser |
| `module/column-cell.ts` | `cellView(track, entry, flags)` → `{ state: "genres" \| "waiting" \| "none" \| "empty", text, title, inferred }`. | yes |
| `module/backfill.ts` | One run per **visit** (one opening of a playlist page). Picks the next track, calls `resolveTrack` at priority `backfill`, one at a time; tried-set, consecutive-failure stop, abort. | yes (all I/O injected) |
| `module/playlist-column.ts` | Wiring: `History.listen`, playlist listing via `PlaylistAPI.getContents`, MutationObserver (rAF-throttled) for rows and the grid variable, starts/stops visits, renders cells from an in-memory entry map. | browser |
| `module/genre-pipeline.ts` (change) | Extract `needsLookup(entry, now, rules, audioEnabled, modelReady)` from `resolveTrack` and use it there; prefetch idle wait ignores backfill work. | yes |
| `module/request-queue.ts` (change) | Priority `backfill`; `minIntervalMs` option for backfill starts; `dropWhere` never removes backfill jobs; `isIdle({ ignoreBackfill })`. | yes |
| `module/genre-cache.ts` / `genre-cache-idb.ts` (change) | `getMany(uris)` (one transaction), and a `withChangeEvents(store)` wrapper emitting `put(entry)` and `clear()` so the column updates from any writer. Same object store, no IndexedDB version bump. | wrapper pure; adapter browser |
| `module/settings.tsx` (change) | "Show genres column in playlists" toggle. | browser |
| `module/mod.tsx` (change) | Create the wrapped store once, shared by the scheduler and the column; start `playlist-column` when the toggle is on. | browser |
| `module/index.scss` (change) | Column styles: `var(--spice-subtext)`, same size as the album column, ellipsis, italics for inferred, faint "…". | — |

### 4.1 Backfill (one visit)

1. Visit starts when the page is `/playlist/<id>` and the toggle is on. List every track; `getMany` their entries into the in-memory map.
2. Next pick: the first rendered row (on-screen order) whose track is a catalogue track with artist and title, not in the tried set, and `needsLookup` is true. Else the first such track in playlist order. Else the visit is done.
3. Add it to the tried set; `resolveTrack(track, deps, "backfill")`. The cache wrapper's `put` event updates the map and cell.
4. Outcome unreachable (MusicBrainz `reachable: false`) → consecutive-failure count + 1; any other outcome resets it. At `backfillMaxConsecutiveFailures` (3), the visit stops.
5. Abort on page change, toggle off, unload or a new visit. A lookup in flight finishes and caches (subject to the cache epoch); no new pick starts.
6. "Clear genre cache" → map emptied, cells re-render ("…"), tried set and failure count reset, picks restart at step 2.
7. A rendered row whose URI is not in the listed tracks is appended to the list.

`resolveTrack` needs a `TrackRef` (`uri`, `artist`, `title`, `durationS`, `isLocal`, `isTrack`); the listing maps `getContents` items to it (first artist name, as `toTrackRef` does for the player).

### 4.2 Display rule

For display only, the column takes the map's entry at any age:

- `musicbrainz` entry with genres → genres.
- `audio` entry → genres, inferred, only while the audio setting is on; else waiting.
- `none` entry → "—".
- No entry → waiting.

The backfill decides refreshes separately with `needsLookup`.

## 5. Acceptance Criteria

IDs are stable. AC37 and AC38 were added after the 2026-10-10 cross-model critique, and each sits in its topic group.

Column
- **AC1** Given the toggle is on (or `showGenre:playlistColumn` is absent), when a `/playlist/<id>` page shows its tracklist, then the header row has one "Genres" header cell immediately before `.main-trackList-rowSectionEnd`, and every track row has exactly one genres cell in the same position.
- **AC2** Given the column is shown, when the "Genres" header is clicked, then the track order and Spotify's sort indicator do not change.
- **AC3** Given a `musicbrainz` entry with genres `["post-punk", "darkwave", "coldwave", "new wave"]`, then the cell text is the first `columnMaxGenres` (3) passed through `prettifyGenre` and joined with ", ", and its `title` lists all four the same way.
- **AC4** Given an `audio` entry and the audio setting on, then the cell is italic, its text starts with "≈ ", and its `title` is the full genre list followed by " — " and `INFERRED_TITLE`. Given the audio setting off, the same entry renders as waiting.
- **AC5** Given a catalogue track with no entry, then the cell shows "…" with the waiting style and `title="Looking up genres"`.
- **AC6** Given a `none` entry, then the cell shows "—" with `title="No genres found"`.
- **AC7** Given a local file, a non-track item, or a track with an empty artist or title, then the cell is empty with no `title`, and the backfill never picks it.
- **AC8** Given an entry whose age is past its lifetime under the 2026-10-06 rules, then its age alone does not change the cell: AC3–AC7 apply to it as to a fresh entry (so an `audio` entry still shows waiting while the audio setting is off), until a new entry for the track is written or the cache is cleared.
- **AC9** Given a genre string `<img src=x onerror=alert(1)>`, then the cell's text content equals `prettifyGenre` of that string, and no child element is created from it.
- **AC10** Given a row element reused for a different track, then after the next observer pass its cell shows the new track's display and never the previous track's.
- **AC11** Given a cell is rendered, when an entry for its track is written by the backfill or by the now-playing lookup, then the cell updates without a page reload.
- **AC12** Given Spotify's loading placeholder rows, then each has one empty genres cell.
- **AC13** Given a `--grid-template-columns` value containing the line name `[last]`, then `withGenresColumn` returns the value with `minmax(120px, 2fr)` inserted before `[last]`. The injected rule applies it to marked tracklists only. `aria-colcount` is Spotify's value + 1, and each `.main-trackList-rowSectionEnd` cell's `aria-colindex` is Spotify's value + 1. When Spotify rewrites the variable, the rule is rebuilt from the new value.
- **AC14** Given a `--grid-template-columns` value without `[last]`, then `withGenresColumn` returns `null`. No header, cell, style rule or attribute is added, and one warning is logged per visit.
- **AC15** When the toggle is turned off or the extension unloads, then every genres cell, the header cell, the style tag and the tracklist marker attribute are removed. `aria-colcount` and the end cells' `aria-colindex` return to Spotify's values, and no further backfill lookup starts.
- **AC16** Given the toggle is turned on while a playlist page is open, then the column appears and a visit starts without reloading Spotify.
- **AC17** Given any page other than `/playlist/<id>` (Liked Songs, album, artist, search), then no column is added and no backfill runs.
- **AC37** Genres cells contain no `<a>` element and no click handler; clicking a cell does not navigate.
- **AC38** (live check) A cell's text stays on one line and ends with an ellipsis when it does not fit; its colour is `var(--spice-subtext)` and its font size equals the Album column's.

Backfill
- **AC18** When a visit starts, then `PlaylistAPI.getContents` is called with `limit: 100` and increasing `offset` until `totalLength` items are listed, and their entries are read with one `getMany` call.
- **AC19** `needsLookup(entry, now, rules, audioEnabled, modelReady)` is true exactly when `resolveTrack` would make a MusicBrainz request for that entry under the same inputs. A test runs both over the same fixtures (absent; each source fresh and expired; audio entry with the setting off; `none` with `audioTried: false` with audio on and ready; other `modelVersion`).
- **AC20** The next pick is the first rendered row, in on-screen order, whose track is a catalogue track not yet tried this visit and for which `needsLookup` is true. When there is none, it is the first such track in playlist order.
- **AC21** Across all visits, at most one backfill `resolveTrack` call is outstanding at any time. A new visit waits for the previous visit's outstanding call to finish before starting its first lookup.
- **AC22** The MusicBrainz queue starts a `backfill` job only when no `current` or `prefetch` job is waiting and at least `musicbrainzBackfillIntervalMs` (6000) has passed since the previous job start of any priority (tested with an injected clock). `current`/`prefetch` jobs keep the existing `musicbrainzBudget` per `musicbrainzWindowMs`.
- **AC23** Given a `backfill` job waiting, when a `current` or `prefetch` job is enqueued, then the new job starts first.
- **AC24** Given a `backfill` job waiting, when the song changes, then the job is not dropped.
- **AC25** Given backfill work waiting or running, when the current track's lookup resolves, then the next-track prefetch still runs (the scheduler's idle wait ignores backfill work).
- **AC26** Given a quota error pause on a queue, then no `backfill` job starts on it until the pause ends.
- **AC27** When the page changes, the toggle is turned off or the extension unloads, then no new backfill pick starts. A backfill `resolveTrack` call that has already begun finishes its whole chain, including its queue jobs still waiting, and its cache write follows the existing rules (including the cache epoch).
- **AC28** Given a visit on playlist A, when playlist B opens, then A's visit stops and B's visit starts.
- **AC29** Given a track whose backfill lookup ended without a cache write (MusicBrainz unreachable, or a Deezer/decode/classify failure), then it is not picked again in the same visit. A new visit to the playlist may pick it again.
- **AC30** Given `backfillMaxConsecutiveFailures` (3) backfill lookups in a row with MusicBrainz unreachable, then the visit stops. A reachable outcome in between resets the count.
- **AC31** When "Clear genre cache" runs during a visit, then every cell of a catalogue track with a nonempty artist and title shows waiting, AC7 cells stay empty, lookups begun before the clear write nothing, and the visit starts picking again under AC20 with an empty tried set and a consecutive-failure count of 0.
- **AC32** Given a rendered row whose track URI is not in the visit's listed tracks, then that track is added to the end of the list.
- **AC33** Given a backfill track whose cache decision is a full lookup (not `recheck-musicbrainz`), a known duration, the audio setting on, the model `Ready` and a MusicBrainz miss, then the Deezer search is enqueued at priority `backfill`, and the result is cached with the same rules as the now-playing row. Audio-entry rechecks and tracks with unknown duration keep the existing rules that skip the audio step.

Settings, now-playing and build
- **AC34** The Genres settings section shows a "Show genres column in playlists" toggle stored under `showGenre:playlistColumn`, on when the key is absent.
- **AC35** Every acceptance criterion of `docs/specs/2026-10-06-audio-genre-fallback.md` still holds: the existing `genre-pipeline`, `genre-scheduler`, `request-queue` and `genre-cache` tests pass unchanged, except where a test asserts that a song change drops a waiting job, which now holds for `current`/`prefetch` jobs only.
- **AC36** README has a "## Playlist column" section, placed right after "## Audio fallback", stating that the column is on by default, that it can be turned off in Settings → Genres, that the backfill sends each track's artist and title to MusicBrainz (and to Deezer when the audio fallback is on), and that the first fill runs at about 600 tracks an hour. README's "## Previews" section mentions the column. CONTRIBUTING has a note naming `module/tracklist-dom.ts` as the home of the tracklist selectors and pointing to §5.1 of this spec as the check to run after a Spotify update. `bun run check`, `bun run test` and `bun run build` pass.

### 5.1 Live check (manual, in Spotify)

AC1, AC2, AC10, AC12, AC13, AC15–AC17, AC28 and AC38 depend on Spotify's real DOM, so they are confirmed live after unit tests pass:

1. Open a 100+ track playlist: the column is aligned with the header at the default window width and at a narrow width (sidebar open, window ≈ 900 px).
2. Scroll quickly to the end and back: no cell shows another row's genres.
3. Play a track from the playlist: the now-playing row and that track's cell agree.
4. Switch to another playlist, then to an album page and Liked Songs: the column follows playlists only.
5. Toggle off and on in Settings: the column disappears and returns without reload, and no stray cells remain.
6. Restart Spotify and reopen the first playlist: tracks looked up before show their genres at once.

## 6. Deferred Items

- #7 — Sort or filter a playlist by genre
- #8 — Make genres in the playlist column link to their playlists
- #9 — Show the genres column on Liked Songs and albums

## 7. Glossary Updates & ADRs

None — the repo has no `CONTEXT.md`. Terms used in this spec: **column**, **backfill**, **visit** (one opening of a playlist page). No ADR: DOM injection is surprising but cheap to reverse (one module, behind a toggle), so the gate fails on "hard to reverse".

## 8. Config & Infrastructure Impact

| File | Change |
|---|---|
| `module/config.ts` | Add `musicbrainzBackfillIntervalMs = 6000`, `backfillMaxConsecutiveFailures = 3`, `columnMaxGenres = 3`, `PLAYLIST_COLUMN_STORAGE_KEY = "showGenre:playlistColumn"`. |
| `module/index.scss` | Column header and cell styles (§4). |
| `module/genre-cache-idb.ts` | `getMany`. No `indexedDB.open` version change; the object store is unchanged. |
| `module/metadata.json` | No change (`test/repo-invariants.test.mts` pins identity fields). |
| `package.json` / `bun.lock` | No change; no new dependency (`node --test` covers the pure units). |
| `tsconfig*.json` | No change. |
| `.forgejo/workflows/publish.yml` | No change (must stay identical to `main`, AC42 of the 2026-10-06 spec). |
| CI / env vars / containers / IaC | None — the extension reads no environment and the repo has no GitHub workflow. |

## 9. Manual Operator Steps

1. **Install the build in Spotify** (after the column wiring lands): start Spotify with `spotify --remote-debugging-port=9229` (`install` pushes into the running client over that port and fails with `fetch failed` if Spotify is closed), then run `bun run build && bunx spicetify-kit install dist/spotify-genres@*` (add `--port <n>` for another port). To let the agent run the live check (§5.1) itself, start Spotify with DevTools remote debugging as in the 2026-10-06 live probes; otherwise run §5.1 yourself and report what fails.

## 10. Documentation Updates

| Doc | Change |
|---|---|
| `README.md` | New "## Playlist column" section per AC36, placed after "## Audio fallback". Add a short line to "Previews" mentioning the column. |
| `CONTRIBUTING.md` | Short "Checking the playlist column" note: DOM selectors live in `module/tracklist-dom.ts`; after a Spotify update, run the live check in §5.1 of this spec. |

## 11. Implementation Plan Guidance

> **For the plan author (`superpowers:writing-plans`):**
>
> Before writing tasks, read the repo's agent index (`CLAUDE.md`/`AGENTS.md`) for architecture, commands, and conventions.
>
> The plan must include the tasks described under **Required Tasks** below, AND must apply every rule under **Per-Task Policies** to every implementation task.
>
> ---
>
> ### Required Tasks (each item produces explicit numbered tasks in the plan)
>
> 1. **Isolated workspace** — IF the session is not already isolated, add as the first task: *"Create an isolated workspace via `superpowers:using-git-worktrees`."*
> 2. **Glossary application** — IF the spec's "Glossary Updates & ADRs" section lists new or changed terms, add an early task: *"Apply terms to `CONTEXT.md` (using the existing file's format) before any code, test, issue title, or commit message references them."* Code must use the canonical terms; never the synonyms listed under `_Avoid_`.
> 3. **ADR creation** — FOR EACH ADR listed in the spec, add a task: *"Create `docs/adr/NNNN-<slug>.md` following sequential numbering (start at `0001-` if the directory is empty)."* IF the spec lists ADR conflicts surfaced, also add a task: *"Update the conflicting ADR's status (superseded / amended) and link to the new ADR."*
> 4. **Deferred-item verification** — Add a task: *"Confirm every issue referenced in the 'Deferred Items' section exists and has all four required body sections (Context, Required, Integration Points, Priority)."* Run `gh issue view <#> --json body | jq -r .body` and grep for the four headings.
> 5. **Config file tasks** — FOR EACH file listed in the spec's "Config & Infrastructure Impact" section, add one explicit task: *"Update `<path>`."*
> 6. **Manual Operator Steps** — IF the spec's "Manual Operator Steps" section is non-empty, add a task ahead of every task that depends on those values existing: *"Hand the operator the Manual Operator Steps and wait for confirmation; if a wizard-generation skill is available, generate the script first."* The agent never performs these steps itself and never substitutes a placeholder credential to unblock itself.
> 7. **Docs update tasks** — FOR EACH entry in the spec's "Documentation Updates" section, add one explicit task: *"Update `<doc-path>`."* Design content goes in the docs dir, not the agent index; the index gets at most a 1-line pointer, a ≤3-sentence area summary, or a 1-line command/env-var entry.
> 8. **Post-implementation check** — Add as the second-to-last task: *"Verify every Required Task above was actually executed — config files updated, docs written, glossary entries applied, ADRs created."* Read the diff; don't trust plan markings.
> 9. **Final build task** — Add as the last task: *"Run `bun run build` and fix any issues until it builds successfully."* Non-negotiable — type-checks and tests alone do not catch all build-time failures.
>
> ---
>
> ### Per-Task Policies (apply to every implementation task)
>
> These are not separate tasks; they are rules every task must follow.
>
> - **Testing (TDD)** — Follow `superpowers:test-driven-development`, using the repo's test runner and file-name conventions.
> - **Verification before completion** — Before claiming a task done, invoke `superpowers:verification-before-completion`. Do not rely on type-checks alone for UI features.
> - **Commit hygiene** — One focused commit per task, matching the commit-message convention visible in this repo's history. Commit frequently.
> - **Pre-commit verification (mandatory)** — Before EVERY `git commit`, dispatch a verification subagent that runs `bun run check && bun run test` from the repo root and reports `STATUS: PASS` or `STATUS: FAIL` with a terse per-issue list (no raw output). Wait for `STATUS: PASS` before committing; if FAIL, fix in the current task and re-run. Never use `git commit --no-verify`.
>
> ---
>
> ### Before finishing the branch (advisory cross-model review)
>
> After the final build passes — and before wrapping up via `superpowers:finishing-a-development-branch` — if a cross-model review helper is available (e.g. the Codex plugin's adversarial review), run it with focus: *"Judge correctness against the spec's acceptance criteria (AC1–ACn) only. Do not flag anything outside the stated criteria — no design alternatives, hardening, or scope the spec did not claim."*
>
> This **never gates a merge** — the gate stays `bun run check && bun run test` plus `bun run build`; the review only flags what deserves a second look. If no helper is available, finish the branch without it.

Notes on the block for this repo:
- Task 1: work happens on branch `feat/playlist-genres-column` in the main checkout; a worktree is optional.
- Tasks 2 and 3 do not apply: no `CONTEXT.md`, no ADRs (§7).
- The repo has no agent index; read this spec and `docs/specs/2026-10-06-audio-genre-fallback.md` instead.
- Commit convention (from history): Conventional Commits, e.g. `feat(column): …`, `docs: …`. No AI-attribution lines.
- Tests live in `test/<unit>.test.mts`, run by `node --test`.
- Order: pure units first (`needsLookup` extraction, queue `backfill` priority, cache `getMany` + change events, `column-cell`, grid-rule builder, `backfill`), then a live DevTools probe confirming §3's risks (`getContents` item shape, `[last]` line name) before `tracklist-dom.ts` and `playlist-column.ts`, then settings, docs, and the §5.1 live check after Manual Operator Step 1.
