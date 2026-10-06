# Audio-based genre fallback — design

- **Date:** 2026-10-06
- **Branch:** `feat/audio-genre-fallback`
- **Status:** Approved design, pending written-spec review
- **Builds on:** upstream `genres` by Mikkel ALMONTE--RINGAUD (Vexcited) at `05e0e33` (MusicBrainz lookup through the hosted CORS proxy, "The Sound of <genre>" playlist links); research in `docs/research/2026-10-06-research-audio-genre-classification.md` and its `-notes/` folder. Where the research report's draft order (iTunes, Deezer, Last.fm) differs from this spec, this spec wins.

## 1. Goal

When MusicBrainz has no genre for the playing Spotify catalogue track (or cannot be reached), show up to three genres inferred from the track's audio, clearly marked as inferred, instead of an empty row. Inference runs locally inside the extension; no daemon, no hosted inference.

**Audience:** personal use (installed from a local build). Marketplace publication is deferred (#2).

**Success:** most obscure tracks the user listens to get a plausible label, measured on a hand-labelled evaluation set of about 50 tracks (§9).

## 2. Decisions (from the brainstorm)

| # | Decision |
|---|---|
| Audio source | **Deezer 30 s MP3 previews only.** iTunes deferred (#4): Spotify's Chromium has no AAC decoder. Spotify's own stream is excluded (DRM, and Spotify's terms forbid ingesting its content into an ML model). Local files deferred (#6). |
| Deezer transport | **JSONP** (`<script>` with `output=jsonp&callback=…`) straight to `api.deezer.com` — no CORS proxy, so the per-IP quota is not shared with other Spicetify users. Preview MP3s are fetched directly (CDN sends `Access-Control-Allow-Origin: *`). |
| Model | MTG **Discogs-EffNet** (`discogs-effnet-bsdynamic-1.onnx`, 18,027,718 bytes; input `melspectrogram [batch,128,96]`, output `activations [batch,400]`). Labels from `genre_discogs400-discogs-effnet-1.json` `classes`. |
| Runtime | **onnxruntime-web 1.30.0**, WASM, single-threaded, in a Web Worker created from a Blob URL. Runtime files loaded from jsDelivr, pinned. |
| Model hosting | **Public Hugging Face model repo owned by the user** (placeholder `<hf-user>/discogs-effnet-onnx`), pinned to a commit SHA. essentia.upf.edu timed out and failed from inside Spotify on 2026-10-06. Weights are CC BY-NC-SA 4.0 and are **never committed** to this MIT repo. |
| Fallback order | Cache → MusicBrainz → audio (opt-in). Spotify artist genres / "Discovered On" skipped (#5). Last.fm deferred (#1). |
| Trigger | Audio fallback runs when MusicBrainz returns no genres **or** is unreachable, and only when the setting is on. **Off by default.** |
| Queues | One rate-limited queue per service (Deezer, MusicBrainz). **Latest wins** plus **prefetch** of the next track in the Spotify play queue. |
| Matching | Normalised artist/title (version suffixes dropped) **and** duration within ±5 s. |
| Display | Up to 3 styles ≥ `audioMinConfidence` (0.15), else strongest parent genre. Italics, "≈" prefix, tooltip with MTG credit. Lowercased style name; existing playlist search reused (mapping table deferred, #3). |
| Cache | Per-track, keyed by Spotify URI, in IndexedDB, with per-source lifetimes (§4.1). |
| Identity | `metadata.json` → `name: "spotify-genres"`, `authors: ["Vexcited", "Heyian"]`, `repository: "https://github.com/Heyian/spotify-genres"`. LICENSE untouched. `.forgejo/` untouched. |
| Tests | `node --test` on `test/*.test.mts` (upstream's last setup), bun for installs, `scripts/evaluate.mts` for the evaluation set. |

## 3. Live-probe findings this design relies on

Run on 2026-10-06 against Spotify 1.2.96.518 (Linux, CEF Chromium 146) with Spicetify CLI 3.0.0-beta.19, via the DevTools protocol.

- No CSP violations: jsDelivr fetch, Blob-URL Worker, `WebAssembly.compile` in page and worker, `importScripts` from jsDelivr inside the worker all work.
- `crossOriginIsolated === false`, no `SharedArrayBuffer` → single-threaded WASM only.
- `fetch` to essentia.upf.edu failed; `curl` to it timed out after 90 s.
- Deezer API: direct `fetch` fails (no CORS header); JSONP works; via `cors-proxy.spicetify.app` works.
- Deezer MP3 preview: decode 35 ms, resample to 16 kHz in 6 ms (30 s clip). iTunes `.m4a`: `EncodingError`; `AudioDecoder` reports `mp4a.40.2` unsupported.
- `Spicetify.Player.data.nextItems` lists upcoming track URIs.
- Spotify Web API through Cosmos returned HTTP 429; no ISRC available for the playing track → Deezer lookup is by text search, not ISRC.
- Cache Storage and IndexedDB available.

## 4. Architecture

New units, each with one purpose and injectable dependencies so the pure ones run under `node --test`:

| Unit | Purpose | Pure? |
|---|---|---|
| `module/config.ts` | Named settings: `audioMinConfidence`, `audioTopK`, `durationToleranceS`, `musicbrainzTtlDays`, `audioRecheckDays`, `notFoundTtlDays`, `deezerBudget`, `musicbrainzBudget`, `backoffInitialMs` (5000), `backoffMaxMs` (60000), `MODEL_REPO`, `MODEL_REVISION`, `MODEL_SHA256`, `ORT_VERSION`, `MODEL_VERSION` | yes |
| `module/genre-cache.ts` | Cache entry type, expiry rules (`decideCacheAction`), IndexedDB adapter | rules pure; adapter browser |
| `module/request-queue.ts` | Per-service rate-limited queue: budget window, priorities (current > prefetch), latest-wins cancellation, exponential backoff | yes (clock injected) |
| `module/match.ts` | Artist/title normalisation and candidate selection with duration check | yes |
| `module/deezer.ts` | JSONP search, quota-error detection, preview URL | transport injected |
| `module/audio-decode.ts` | MP3 bytes → 16 kHz mono `Float32Array` (`decodeAudioData` + `OfflineAudioContext`) | browser |
| `module/mel.ts` | Essentia-compatible mel front-end → patches `[n,128,96]` | yes |
| `module/labels.ts` | Average activations, top-K above threshold, parent fallback, display name (`Parent---Style` → `style`) | yes |
| `module/model-store.ts` | Download model/labels/runtime with progress, SHA-256 check, Cache Storage under versioned keys | browser |
| `module/classifier-worker.ts` | Worker body: load ORT + model once, run mel + inference, post activations | worker |
| `module/genre-pipeline.ts` | Orchestrates cache → MusicBrainz → audio for one track URI; used for current and prefetch | yes (all I/O injected) |
| `module/settings.tsx` | Stdlib `settingsSection` "Genres": toggle, status row, clear-cache action | browser |

`mod.tsx` keeps DOM injection and playlist resolution; `updateGenres` delegates to `genre-pipeline.ts` and renders the result (with the inferred marker when `source === "audio"`).

### 4.1 Cache entry and lifetimes

```ts
type GenreSource = "musicbrainz" | "audio" | "none";
interface GenreCacheEntry {
  uri: string;                 // spotify:track:…
  genres: string[];            // display names, already normalised
  source: GenreSource;
  scores?: number[];           // audio only, parallel to genres
  modelVersion?: string;       // audio only
  checkedAt: number;           // ms epoch of the last lookup that produced/confirmed this entry
}
```

| Source | Rule |
|---|---|
| `musicbrainz` | Served while younger than `musicbrainzTtlDays` (30); then full re-lookup. |
| `audio` | Served while `modelVersion === MODEL_VERSION`. After `audioRecheckDays` (14), MusicBrainz is queried again (audio not re-run); a MusicBrainz hit replaces the entry; a reachable miss refreshes `checkedAt`; an unreachable response leaves the entry unchanged. Different `modelVersion` → treated as absent. |
| `none` | "Nothing found anywhere"; served (row cleared) while younger than `notFoundTtlDays` (7). Never written when MusicBrainz was unreachable, nor when the audio step failed or was skipped because the model is not `Ready`. |

### 4.2 Data flow (one track)

1. `songchange` → pipeline for current URI at priority `current`; any queued work for URIs that are neither current nor next is cancelled.
2. Cache lookup → decision per §4.1.
3. MusicBrainz via its queue (existing `fetchGenresFromMusicBrainz` and hosted-proxy fetch).
4. If no genres (or unreachable) and setting on and model ready: Deezer search via its queue → `match.ts` → fetch preview → decode → worker → `labels.ts` → cache write `source: "audio"`.
5. Render if the URI is still current (existing `updateToken` guard).
6. When idle, the same pipeline runs for `Player.data.nextItems[0]` at priority `prefetch` (cache write only, no render).

### 4.3 Mel front-end (port of Essentia `TensorflowInputMusiCNN`)

16 kHz mono → frames of 512 samples, hop 256 → window (Essentia default; Hann expected, **confirm against Essentia source/output in the parity test**), `normalized=false` → magnitude spectrum, 257 bins → 96 mel bands, `slaneyMel`, `unit_tri`, linear weighting, 0–8000 Hz → `log10(1 + 10000·x)` → patches of 128 frames, hop 62, last partial patch dropped → `[n,128,96]`. Activations averaged across patches.

### 4.4 Worker loading

The worker source is bundled as a string and started from a Blob URL. Inside, `importScripts` loads `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.wasm.min.js`; `ort.env.wasm.wasmPaths` points at the same pinned jsDelivr path; `ort.env.wasm.numThreads = 1`. Model bytes are passed from the page (read from Cache Storage) via transfer. **Risk:** how `spicetify-kit` bundles a second entry/string for the worker is unverified; the first plan task touching the worker must prove it builds.

### 4.5 Settings and first run

Toggle "Infer genres from audio previews when MusicBrainz has none" (storage key `showGenre:audioFallback`, default off). Turning it on starts the download of model + labels (from Hugging Face, pinned revision) and the ORT WASM; status row shows `Not downloaded` / `Downloading n%` / `Ready` / `Failed — Retry`. While not `Ready`, the audio step is skipped. Action "Clear genre cache" empties the IndexedDB store.

## 5. Acceptance Criteria

IDs are stable. AC36–AC43 were added after the 2026-10-06 cross-model critique, and each sits in its topic group.

Fallback chain
- **AC1** Given the audio fallback setting is off, when MusicBrainz returns no genres, then no Deezer request is made and the genres row is cleared (today's behaviour).
- **AC2** Given the setting is on and the model is `Ready`, when MusicBrainz returns no genres for a catalogue track, then the pipeline queries Deezer and, on a matched preview that is fetched, decoded and classified, renders audio-inferred genres and writes an `audio` entry.
- **AC3** Given the setting is on and the model is `Ready`, when MusicBrainz is unreachable (`reachable: false`), then the audio step runs as in AC2.
- **AC4** Given MusicBrainz returns genres, then no Deezer request is made and the row shows the MusicBrainz genres without the inferred marker.
- **AC5** Given a local track (`is_local === "true"`) or a non-track item, then neither MusicBrainz nor Deezer is queried and the row is cleared.
- **AC6** Given no usable cache entry, the setting on and the model not `Ready`, when MusicBrainz returns no genres or is unreachable, then the audio step is skipped, the row is cleared and no `none` entry is written.
- **AC36** Given a matched Deezer preview, when fetching, decoding or classifying it fails, then the row is cleared and no cache entry is written (the next play retries).

Cache
- **AC7** Given a `musicbrainz` entry younger than `musicbrainzTtlDays`, then no MusicBrainz, Deezer or preview request is made for that track and the cached genres render; playlist-link resolution keeps its existing behaviour.
- **AC8** Given a `musicbrainz` entry whose age is ≥ `musicbrainzTtlDays`, then MusicBrainz is queried again.
- **AC9** Given an `audio` entry with the current `MODEL_VERSION` whose age is ≥ `audioRecheckDays`, then MusicBrainz is queried and Deezer is not. A MusicBrainz hit replaces the entry with `source: "musicbrainz"`. A reachable miss keeps the audio genres and sets `checkedAt` to now. An unreachable response leaves the entry unchanged, `checkedAt` included.
- **AC37** Given an `audio` entry with the current `MODEL_VERSION` younger than `audioRecheckDays`, then no MusicBrainz, Deezer or preview request is made and the cached genres render with the inferred marker.
- **AC10** Given an `audio` entry whose `modelVersion` differs from `MODEL_VERSION`, then it is treated as absent.
- **AC11** Given a `none` entry younger than `notFoundTtlDays`, then no MusicBrainz, Deezer or preview request is made and the row is cleared; at age ≥ `notFoundTtlDays`, a full lookup runs.
- **AC12** Given MusicBrainz was unreachable, then no `none` entry is written, whatever the audio fallback setting and whatever the Deezer outcome.
- **AC13** "Clear genre cache" removes every cache entry; the next play of any track performs a full lookup.
- **AC38** Given a lookup that started before "Clear genre cache", when it finishes after the clear, then it writes no cache entry.

Queues
- **AC14** The Deezer queue never starts more than `deezerBudget` (40) requests in any 5 s window; the MusicBrainz queue never more than `musicbrainzBudget` (1) per second (tested with an injected clock).
- **AC15** Given a Deezer response with HTTP 429 or a body `error.code === 4`, then that queue pauses for `backoffInitialMs`; each further quota error in a row doubles the pause, capped at `backoffMaxMs`; the first successful response resets the next pause to `backoffInitialMs`; the other queue is unaffected.
- **AC16** Given queued work for a URI that is neither the current nor the next track, when the song changes, then that work is dropped before it sends a request.
- **AC17** Given work at priority `current` and `prefetch` both waiting, then `current` is sent first.
- **AC18** Given the queues are idle after the current track resolved, when `Player.data.nextItems[0]` is a catalogue track, then the pipeline runs for it under the same cache-write rules and does not change the rendered row; when the play queue is empty or the next item is a local track or a non-track item, nothing runs.
- **AC39** Given a lookup in flight for track A, when the song changes to track B before it finishes, then A's result is not rendered.
- **AC40** Deezer search requests go to `https://api.deezer.com/` as JSONP (`output=jsonp`) and never through `cors-proxy.spicetify.app`.

Matching
- **AC19** Normalisation first drops these version suffixes, case-insensitively, and no others: a trailing `(…)` or `[…]` group whose text starts with `feat.`, `remaster`, `remastered` or `radio edit`; a trailing ` - ` tail that is `live` or starts with `remaster`/`remastered`. It then lowercases, removes diacritics, replaces each punctuation character with a space, collapses whitespace runs to one space and trims. E.g. `"Creep - Remastered 2011"` and `"Creep"` normalise equal; `"Post-Punk"` normalises to `"post punk"`.
- **AC20** A Deezer candidate matches only if normalised artist and normalised title (or `title_short`) equal the Spotify track's, and `|deezer.duration − spotify.duration_s| ≤ durationToleranceS` (5); the first matching candidate wins.
- **AC21** Given no candidate matches or the match has no `preview`, then no preview is fetched, and a `none` entry is written only if MusicBrainz was reachable and returned no genres.

Audio and classifier
- **AC22** `mel.ts` output for the reference fixture matches Essentia's `TensorflowInputMusiCNN`-based output within max absolute error 1e-3 per value, with the same patch count.
- **AC23** A 30 s 16 kHz input yields 29 patches.
- **AC24** Given averaged activations, `labels.ts` returns at most `audioTopK` (3) styles with score ≥ `audioMinConfidence`, ordered by score; if none qualify, it returns the single parent genre with the highest summed activation.
- **AC25** Display names: `Electronic---Darkwave` → `darkwave`; parent fallback `Electronic` → `electronic`.
- **AC26** The downloaded model is accepted only if its SHA-256 equals `MODEL_SHA256`; otherwise status is `Failed` and nothing is cached.
- **AC27** Model and runtime files are cached under keys containing `MODEL_VERSION` / `ORT_VERSION`; a second enable after `Ready`, in the same session or after restarting Spotify, makes no network request for them while `MODEL_VERSION` and `ORT_VERSION` are unchanged.
- **AC28** Preview audio is never written to Cache Storage, IndexedDB or storage.

Display and settings
- **AC29** Audio-sourced genres render in italics, preceded by "≈", with `title="Inferred from audio (MTG Discogs-EffNet, CC BY-NC-SA 4.0)"`; MusicBrainz genres render without either.
- **AC30** Each audio-inferred genre links to its "The Sound of <genre>" playlist when one resolves, else renders as a non-navigable item (existing behaviour).
- **AC31** The settings section shows the toggle (default off), the model status (`Not downloaded` / `Downloading n%` / `Ready` / `Failed — Retry`), and "Clear genre cache".
- **AC41** Given status `Not downloaded`, when the toggle is turned on, then the model, labels and runtime download starts and status shows `Downloading n%`; given status `Failed`, when `Retry` is activated, then the download starts again.

Identity and docs
- **AC32** `module/metadata.json` has `name: "spotify-genres"`, `authors: ["Vexcited", "Heyian"]`, `repository: "https://github.com/Heyian/spotify-genres"`; `bun run build` produces `dist/spotify-genres@<version>`.
- **AC33** README credits Vexcited with a link to the original repo, credits MTG/Essentia for the model with its CC BY-NC-SA 4.0 licence and Hugging Face mirror link, and has an "Audio fallback" section stating that it is opt-in, that artist and title are sent to Deezer, and that previews are downloaded. CONTRIBUTING lists `bun install`, `bun run build`, `bun run test`, `bun run check`, has no `ant` commands, and documents the evaluation workflow and mel fixture regeneration. The research report's first line points to this spec. No model weights are tracked in git (`git ls-files '*.onnx'` is empty).
- **AC42** `git diff main -- LICENSE .forgejo ant.lockb` is empty, `module/metadata.json`'s `preview` value is unchanged, and `git check-ignore eval/tracks.csv` succeeds.
- **AC43** `scripts/prepare-model-mirror.sh <out>` writes `discogs-effnet-bsdynamic-1.onnx`, `genre_discogs400-discogs-effnet-1.json`, `README.md` (model card with `license: cc-by-nc-sa-4.0`) and `LICENSE` into `<out>` and prints the model's SHA-256; if the model is not 18,027,718 bytes, it exits non-zero without printing a SHA-256.

Evaluation
- **AC34** `bun run evaluate eval/tracks.csv` prints, per row: preview found (y/n), top-3 styles with scores, hit/miss against `expected_genres`; and a summary with preview coverage % (rows with a preview ÷ all rows) and top-3 hit rate % (hits ÷ rows with a preview). A row is a hit when at least one lowercased `expected_genres` label equals one of its top-3 style names. Playlist-link resolution is not measured here (Node has no Spotify session).
- **AC35** `bun run test` passes and `bun run check` passes.

## 6. Deferred Items

- #1 — Add Last.fm tags as a genre source (user-supplied key)
- #2 — Publish to the Spicetify Marketplace and port CI to GitHub Actions
- #3 — Map Discogs styles to Spotify genre names if playlist links often miss
- #4 — Add iTunes previews as a second audio source (needs WASM AAC decoder)
- #5 — Revisit Spotify artist genres as a genre source
- #6 — Classify Spotify local files from a user-picked music folder

## 7. Glossary Updates & ADRs

None — the repo has no `CONTEXT.md`. No ADR: every decision here is cheap to reverse (sources, hosting and thresholds are constants), so the three-criteria gate fails on "hard to reverse".

## 8. Config & Infrastructure Impact

| File | Change |
|---|---|
| `package.json` | Scripts: `test` (`node --test "test/*.test.mts"`), `check` (`tsc && spicetify-kit check module`), `evaluate` (`node scripts/evaluate.mts`). devDependencies: `onnxruntime-node`, `onnxruntime-web` (types; runtime comes from jsDelivr), `@types/node`, `happy-dom` only if a DOM test needs it. Keep `build`/`dev`. |
| `bun.lock` | New (bun install). `ant.lockb` left untouched for upstream merges. |
| `.gitignore` | Add `eval/tracks.csv` (personal listening data). |
| `eval/tracks.example.csv` | New: header `artist,title,duration_s,expected_genres` + 2 example rows. |
| `module/metadata.json` | `name`, `authors`, `repository` per AC32. `preview` image left as is. |
| `module/config.ts` | New: constants listed in §4, including `MODEL_REPO`, `MODEL_REVISION`, `MODEL_SHA256` filled from Manual Operator Steps. |
| `scripts/prepare-model-mirror.sh` | New: downloads model + labels from essentia.upf.edu with retries, checks size 18,027,718, prints SHA-256, writes model card + LICENSE into an output folder outside the repo. |
| `scripts/essentia-reference.py` | New: generates the mel parity fixture with `essentia-tensorflow` (`uv run --python 3.11 --with essentia-tensorflow`). |
| `test/fixtures/` | New: synthetic 3 s test signal and Essentia mel reference (no copyrighted audio). |
| `tsconfig.json` | Add `"node"` to `types` for `test/` and `scripts/` (or a separate `tsconfig` for them) so `tsc` passes. |
| `.forgejo/workflows/publish.yml` | No change (inert on GitHub; port tracked in #2). |
| CI / env vars / containers | None — no GitHub workflow, no env vars; the extension reads no environment. |

## 9. Manual Operator Steps

Done by the user, in order. The agent never handles the Hugging Face credential.

### Step 1 — Prepare the mirror folder (after the plan's `prepare-model-mirror.sh` task lands)

```sh
cd ~/DEV/spicetify/spotify-genres
bash scripts/prepare-model-mirror.sh ~/.cache/spotify-genres/mirror
```

- It retries essentia.upf.edu (slow, sometimes down). If it keeps failing, retry later; nothing else depends on the host.
- Output folder contains: `discogs-effnet-bsdynamic-1.onnx`, `genre_discogs400-discogs-effnet-1.json`, `README.md` (model card: `license: cc-by-nc-sa-4.0`, MTG credit, citation, source URLs, "unmodified mirror"), `LICENSE` (CC BY-NC-SA 4.0 notice).
- **Capture:** the SHA-256 the script prints. Paste it to the agent (it is not a secret).

### Step 2 — Hugging Face account

1. If you have none, sign up at https://huggingface.co/join and verify your email.
2. **Capture:** your username (shown at https://huggingface.co/settings/profile). It replaces `<hf-user>` below. Not a secret.

### Step 3 — Log in from the terminal (in your own terminal, not through the agent)

```sh
uvx --from huggingface_hub hf auth login
```

- Choose the browser login when offered. If it asks for a token instead: open https://huggingface.co/settings/tokens → **Create new token** → type **Write** (or Fine-grained with write access to your own repos) → name it `spotify-genres-mirror` → copy it and paste it at the hidden prompt. Answer **No** to "add token as git credential".
- The token is stored in `~/.cache/huggingface/token`. Never paste it into the agent chat.
- Check: `uvx --from huggingface_hub hf auth whoami` prints your username.

### Step 4 — Create the public model repo and upload

```sh
uvx --from huggingface_hub hf repos create <hf-user>/discogs-effnet-onnx --type model --public
uvx --from huggingface_hub hf upload <hf-user>/discogs-effnet-onnx ~/.cache/spotify-genres/mirror . --commit-message "Mirror MTG Discogs-EffNet (unmodified, CC BY-NC-SA 4.0)"
```

- Open `https://huggingface.co/<hf-user>/discogs-effnet-onnx` and check the four files are listed and the licence badge reads `cc-by-nc-sa-4.0`.

### Step 5 — Hand the pin to the agent

```sh
curl -s https://huggingface.co/api/models/<hf-user>/discogs-effnet-onnx | python3 -c 'import sys,json; print(json.load(sys.stdin)["sha"])'
```

- **Capture:** the commit SHA printed, plus `<hf-user>`. Give both to the agent; they land in `module/config.ts` as `MODEL_REPO` and `MODEL_REVISION` (with `MODEL_SHA256` from Step 1). The agent then verifies the files download with `Access-Control-Allow-Origin` from an `Origin: https://xpui.app.spotify.com` request.

### Step 6 — Optional: drop the write token

If you used a token in Step 3, revoke it at https://huggingface.co/settings/tokens once uploaded (`uvx --from huggingface_hub hf auth logout` also removes the local copy). Future model updates need a new one.

### Step 7 — Build the evaluation set (any time before tuning)

1. `cp eval/tracks.example.csv eval/tracks.csv` (git-ignored).
2. Add about 50 rows of obscure tracks you listen to, ideally ones where the current extension shows no genre:
   `artist,title,duration_s,expected_genres`
   - `duration_s`: track length in seconds as Spotify shows it (e.g. 3:41 → `221`).
   - `expected_genres`: your own labels, separated by `;`, written like Discogs styles where possible (`darkwave;post-punk`). The evaluator lowercases and compares against the style part of the top 3.
3. Tell the agent when it is ready; `bun run evaluate eval/tracks.csv` produces the report used to tune `audioMinConfidence` and to decide #3 and #4.

### Step 8 — Install and enable in Spotify

```sh
bun run build
bunx spicetify-kit install dist/spotify-genres@*
```

Then restart Spotify, open Settings → **Genres**, turn on "Infer genres from audio previews…", wait for **Ready**. If the upstream `genres` package is also installed, remove it to avoid two rows.

## 10. Documentation Updates

| Doc | Change |
|---|---|
| `README.md` | Credits section (done); add "Audio fallback" section: what it does, opt-in, what leaves the machine (artist/title to Deezer, preview download), model credit and CC BY-NC-SA 4.0 notice with the Hugging Face link; install from local build with the new name. |
| `CONTRIBUTING.md` | Replace `ant` commands with bun (`bun install`, `bun run build`, `bun run test`, `bun run check`), new clone URL, `dist/spotify-genres@*`, evaluation workflow, how to regenerate the mel fixture. |
| `docs/research/2026-10-06-research-audio-genre-classification.md` | Add one line at the top pointing to this spec as the superseding decision record. |

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
- Task 1: the work already happens on branch `feat/audio-genre-fallback` in the main checkout; a worktree is optional.
- Tasks 2 and 3 do not apply: no `CONTEXT.md`, no ADRs (§7).
- The repo has no agent index (`CLAUDE.md`/`AGENTS.md`); read this spec and `docs/research/` instead.
- Commit convention (from history): Conventional Commits, e.g. `feat(audio): …`, `chore(ci): …`, `docs: …`. No AI-attribution lines.
- Plan the `scripts/prepare-model-mirror.sh` task early so Manual Operator Steps 1–5 can run in parallel with the mel/queue/cache work; only `model-store.ts` wiring and the end-to-end check wait for the Hugging Face pin.
