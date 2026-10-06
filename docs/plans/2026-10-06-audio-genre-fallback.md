# Audio Genre Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When MusicBrainz has no genre for the playing Spotify track, show up to three genres inferred locally from the track's Deezer preview, marked as inferred.

**Architecture:** Pure, dependency-injected units (`config`, `genre-cache` rules, `request-queue`, `match`, `deezer`, `mel`, `labels`, `genre-pipeline`) tested with `node --test`. Browser-only adapters around them (IndexedDB store, JSONP transport, audio decode, model store, classifier worker, settings UI) and `mod.tsx` wiring. Inference runs onnxruntime-web (WASM, single thread) in a Blob-URL Web Worker.

**Tech Stack:** TypeScript (type-stripped `.ts` under Node 22.23), `@spicetify/kit` 0.3.1 (rolldown bundler), stdlib v3 (`/modules/stdlib/...`), onnxruntime-web 1.30.0 (jsDelivr), onnxruntime-node (evaluation only), bun 1.4 for installs and scripts, Python 3.11 + `essentia-tensorflow` via `uv` (fixture generation only), ffmpeg (evaluation decode only).

**Spec:** `docs/specs/2026-10-06-audio-genre-fallback.md` (ACs AC1–AC43). Read it before starting any task; criteria are cited by id below.

## Global Constraints

- Audio source is Deezer 30 s MP3 previews only. Deezer API calls use JSONP straight to `https://api.deezer.com/` and never go through `cors-proxy.spicetify.app` (AC40).
- Model: `discogs-effnet-bsdynamic-1.onnx`, 18,027,718 bytes, input `melspectrogram [batch,128,96]`, output `activations [batch,400]`. Labels: `classes` of `genre_discogs400-discogs-effnet-1.json`.
- Model weights are never committed (`git ls-files '*.onnx'` stays empty). Preview audio is never persisted (AC28).
- Runtime: `onnxruntime-web` `1.30.0`, WASM, `numThreads = 1`, loaded from `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/`.
- Settings, with the values given in spec §4: `audioMinConfidence` 0.15, `audioTopK` 3, `durationToleranceS` 5, `musicbrainzTtlDays` 30, `audioRecheckDays` 14, `notFoundTtlDays` 7, `deezerBudget` 40 per 5 s, `musicbrainzBudget` 1 per 1 s, `backoffInitialMs` 5000, `backoffMaxMs` 60000. Code reads them from `module/config.ts`, never from literals.
- Storage key for the toggle: `showGenre:audioFallback`, default off.
- Inferred display: italics, "≈" prefix, `title="Inferred from audio (MTG Discogs-EffNet, CC BY-NC-SA 4.0)"`.
- LICENSE, `.forgejo/`, `ant.lockb` and the `preview` value in `module/metadata.json` stay unchanged (AC42).
- Tests: `node --test "test/*.test.mts"`. Test files import modules with the `.ts` extension (`allowImportingTsExtensions` is on). Modules imported by tests must not import `/modules/stdlib/...` and must not use enums, namespaces or parameter properties, since Node strips types and does not transform them.
- Commits: Conventional Commits (`feat(audio): …`, `test: …`, `docs: …`, `chore: …`). No AI-attribution lines.
- Before every commit, a verification subagent runs `bun run check && bun run test` from the repo root and reports `STATUS: PASS` or `STATUS: FAIL`. Commit only on PASS. Never use `--no-verify`.

## Review Focus

1. **A song change while Deezer is backing off.** A quota pause of up to 60 s must not hold up the current track's MusicBrainz lookup, and dropped work must not run when the pause ends. Test added in Task 5.
2. **Metadata missing duration or artist.** Spotify items with no `duration` or an empty `artist_name` should skip the audio step (no Deezer call, no `none` written) and keep today's behaviour. Tests added in Tasks 6 and 10.
3. **Featured artists in the Spotify title.** If `artist_name` holds only the primary artist while the Spotify title carries `(feat. X)` and Deezer's title does not, the two should still match. Test added in Task 6.
4. **Spotify's `- 2011 Remaster` suffix form.** AC19's fixed suffix list does not drop it, so such tracks fall back to Deezer's `title_short`. A test in Task 6 pins today's (non-)match so any change is deliberate.
5. **IndexedDB or Cache Storage unavailable or failing.** A thrown `get` or `put` must degrade to "no cache" (do the lookup, render the result) rather than leave the row stale. Test added in Task 10.

---

## File Structure

| File | Responsibility |
|---|---|
| `module/config.ts` | All named settings and pinned versions (pure constants). |
| `module/genre-cache.ts` | `GenreCacheEntry` type, `decideCacheAction` rules (pure), `GenreCacheStore` interface, in-memory store (tests). |
| `module/genre-cache-idb.ts` | IndexedDB adapter implementing `GenreCacheStore` (browser). |
| `module/request-queue.ts` | Per-service rate-limited queue with priorities, drop, quota backoff (pure, clock injected). |
| `module/match.ts` | Title/artist normalisation and Deezer candidate selection (pure). |
| `module/deezer.ts` | Search URL builder, quota detection, `findPreview` over an injected transport (pure). |
| `module/jsonp.ts` | JSONP transport over an injected `document` (browser, testable with a fake document). |
| `module/mel.ts` | Essentia-compatible mel front-end (pure). |
| `module/labels.ts` | Activation averaging, top-K, parent fallback, display names (pure). |
| `module/genre-pipeline.ts` | Cache → MusicBrainz → audio orchestration for one track, plus the scheduler for songchange, prefetch and clear (pure, all I/O injected). |
| `module/audio-decode.ts` | MP3 bytes → 16 kHz mono `Float32Array` (browser). |
| `module/classifier-worker.ts` | Self-contained worker body plus page-side client (browser). |
| `module/model-store.ts` | Model, labels and runtime download, SHA-256 check, Cache Storage, status (fetch, caches and digest injected). |
| `module/settings.tsx` | "Genres" settings section (browser). |
| `module/mod.tsx` | DOM injection, playlist resolution, wiring (modified). |
| `module/index.scss` | Inferred-genre style (modified). |
| `scripts/prepare-model-mirror.sh` | Builds the Hugging Face mirror folder. |
| `scripts/essentia-reference.py` | Generates the mel parity fixture. |
| `scripts/evaluate.mts` | Evaluation report over `eval/tracks.csv`. |
| `test/*.test.mts` | Unit tests, one file per pure unit. |
| `test/fixtures/` | Synthetic signal and Essentia mel reference. |

**Deviation from spec §4, decided here:** mel runs on the page and the worker only runs ORT inference. Why: kit's rolldown config bundles a leaf module as one chunk and has no raw-text import, so the worker source is produced with `Function.prototype.toString()` on a self-contained function, and that function cannot import `mel.ts`. Mel on a 30 s clip is a few tens of milliseconds of plain JS. No AC depends on where mel runs.

---

### Task 1: Tooling — bun, test runner, type-check

**Files:**
- Modify: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `bun.lock` (generated), `test/smoke.test.mts`, `tsconfig.node.json`

**Interfaces:**
- Produces: `bun run test`, `bun run check`, `bun run evaluate`, `bun run build`.

- [ ] **Step 1:** Add the `package.json` scripts: `"test": "node --test \"test/*.test.mts\""`, `"check": "tsc -p tsconfig.json && tsc -p tsconfig.node.json && spicetify-kit check module"`, `"evaluate": "node scripts/evaluate.mts"`. Keep `build` and `dev`. Add devDependencies `@types/node@^22`, `onnxruntime-node@1.30.0`, `onnxruntime-web@1.30.0`.
- [ ] **Step 2:** Run `bun install`. Expected: `bun.lock` created, `ant.lockb` untouched (`git status -s ant.lockb` prints nothing).
- [ ] **Step 3:** Split type-checking. In `tsconfig.json` set `"include": ["module/**/*"]`. Create `tsconfig.node.json`, which extends it with `"include": ["test/**/*", "scripts/**/*", "module/**/*.ts"]`, `"exclude": ["module/mod.tsx", "module/index.ts", "module/settings.tsx"]` and `"types": ["node"]`.
- [ ] **Step 4:** Add `eval/tracks.csv` to `.gitignore`.
- [ ] **Step 5: Write `test/smoke.test.mts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../module/logic.ts";
test("type-stripped module import works", () => assert.equal(escapeHtml("<a>"), "&lt;a&gt;"));
```

- [ ] **Step 6:** Run `bun run test && bun run check && bun run build`. Expected: 1 test passes, `tsc` reports no errors, and `dist/genres@0.1.0/` is built (renaming comes in Task 16). Fix anything `tsc` flags in existing `module/` files before moving on.
- [ ] **Step 7: Commit** `chore: switch to bun with node test runner and type-check scripts`

---

### Task 2: `scripts/prepare-model-mirror.sh` (AC43)

Planned early so the operator can run Manual Operator Steps 1–5 while Tasks 3–10 proceed.

**Files:**
- Create: `scripts/prepare-model-mirror.sh`, `test/prepare-model-mirror.test.mts`

**Interfaces:**
- Produces: `bash scripts/prepare-model-mirror.sh <out>`. Env `MIRROR_BASE_URL` (default `https://essentia.upf.edu/models/feature-extractors/discogs-effnet/` for the model and `https://essentia.upf.edu/models/classification-heads/genre_discogs400/` for the labels; one override for both, so the test can serve local files).

- [ ] **Step 1: Write the failing test.** It creates a temp dir with a fake 18,027,718-byte `.onnx` and a labels JSON, serves it with `node:http` on an ephemeral port, runs the script with `MIRROR_BASE_URL` pointing there, and asserts:
  - exit 0, `<out>` contains exactly `discogs-effnet-bsdynamic-1.onnx`, `genre_discogs400-discogs-effnet-1.json`, `README.md`, `LICENSE`;
  - `README.md` contains `license: cc-by-nc-sa-4.0` in YAML front matter;
  - stdout's last line is a 64-hex SHA-256 equal to `crypto.createHash("sha256")` of the fake model.
  
  A second case serves a 100-byte model and asserts a non-zero exit and that no 64-hex line was printed.
- [ ] **Step 2:** Run `node --test test/prepare-model-mirror.test.mts`. Expected: FAIL (script missing).
- [ ] **Step 3: Implement the script.** `set -euo pipefail`. Use `curl --fail --retry 5 --retry-delay 10 --retry-all-errors --max-time 600` for each file. Check the size with `stat -c %s`. Write the README model card: front matter `license: cc-by-nc-sa-4.0`, `library_name: onnx`, `tags: [audio-classification, music]`; a body with the MTG credit, the citation (Alonso-Jiménez et al., "Efficient supervised training of audio transformers for music representation learning", ISMIR 2023), the source URLs, and "Unmodified mirror". Write a LICENSE with the CC BY-NC-SA 4.0 notice and a link to `https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode`. Print the hash last with `sha256sum | cut -d' ' -f1`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add model mirror preparation script`

---

### Task 3: `module/config.ts`

**Files:**
- Create: `module/config.ts`, `test/config.test.mts`

**Interfaces:**
- Produces:

```ts
export const audioMinConfidence = 0.15, audioTopK = 3, durationToleranceS = 5;
export const musicbrainzTtlDays = 30, audioRecheckDays = 14, notFoundTtlDays = 7;
export const deezerBudget = 40, deezerWindowMs = 5000, musicbrainzBudget = 1, musicbrainzWindowMs = 1000;
export const backoffInitialMs = 5000, backoffMaxMs = 60000;
export const MODEL_REPO = "<hf-user>/discogs-effnet-onnx";   // filled after Manual Operator Step 5
export const MODEL_REVISION = "";                             // HF commit SHA, Step 5
export const MODEL_SHA256 = "";                               // Step 1
export const MODEL_VERSION = "discogs-effnet-bsdynamic-1";
export const ORT_VERSION = "1.30.0";
export const AUDIO_FALLBACK_STORAGE_KEY = "showGenre:audioFallback";
export const INFERRED_TITLE = "Inferred from audio (MTG Discogs-EffNet, CC BY-NC-SA 4.0)";
export const DAY_MS = 86_400_000;
export const modelPinned = (): boolean => MODEL_REVISION !== "" && MODEL_SHA256 !== "";
```

- [ ] **Step 1:** Test that `modelPinned()` is `false` while `MODEL_REVISION` is empty, and that `ORT_VERSION === "1.30.0"`.
- [ ] **Step 2:** Run it. Expected: FAIL (module missing).
- [ ] **Step 3:** Create `config.ts` as above.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add named settings module`

---

### Task 4: Cache rules — `module/genre-cache.ts` (AC7–AC12, AC37)

**Files:**
- Create: `module/genre-cache.ts`, `test/genre-cache.test.mts`

**Interfaces:**
- Produces:

```ts
export type GenreSource = "musicbrainz" | "audio" | "none";
export interface GenreCacheEntry { uri: string; genres: string[]; source: GenreSource; scores?: number[]; modelVersion?: string; checkedAt: number }
export interface CacheRules { musicbrainzTtlDays: number; audioRecheckDays: number; notFoundTtlDays: number; modelVersion: string }
export type CacheDecision =
  | { kind: "serve"; entry: GenreCacheEntry }
  | { kind: "recheck-musicbrainz"; entry: GenreCacheEntry }  // audio entry, age ≥ audioRecheckDays
  | { kind: "lookup" };                                      // absent, expired, or other model version
export function decideCacheAction(entry: GenreCacheEntry | undefined, now: number, rules: CacheRules): CacheDecision;
export interface GenreCacheStore { get(uri: string): Promise<GenreCacheEntry | undefined>; put(entry: GenreCacheEntry): Promise<void>; clear(): Promise<void> }
export function createMemoryStore(): GenreCacheStore;
```

- [ ] **Step 1: Write failing tests**, with `rules` built from `config.ts` and `now = 100 * DAY_MS`:
  - `decideCacheAction_absent_lookup`: `undefined` → `{kind:"lookup"}`.
  - `musicbrainz_fresh_serves` (AC7): age `musicbrainzTtlDays*DAY_MS - 1` → `serve`.
  - `musicbrainz_at_ttl_lookups` (AC8): age exactly `musicbrainzTtlDays*DAY_MS` → `lookup`.
  - `audio_fresh_serves` (AC37): current `modelVersion`, age `audioRecheckDays*DAY_MS - 1` → `serve`.
  - `audio_at_recheck` (AC9): age exactly `audioRecheckDays*DAY_MS` → `recheck-musicbrainz`.
  - `audio_other_model_absent` (AC10): `modelVersion: "old"` at age 0 → `lookup`.
  - `none_fresh_serves` / `none_at_ttl_lookups` (AC11): ages `notFoundTtlDays*DAY_MS - 1` and `notFoundTtlDays*DAY_MS`.
  - `memory_store_roundtrip_and_clear`: `put` then `get` returns the entry; `clear` then `get` → `undefined`.
- [ ] **Step 2:** Run `node --test test/genre-cache.test.mts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Age = `now - entry.checkedAt`. Each comparison is `age >= ttlDays * DAY_MS`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add genre cache entry and expiry rules`

---

### Task 5: `module/request-queue.ts` (AC14–AC17)

**Files:**
- Create: `module/request-queue.ts`, `test/request-queue.test.mts`

**Interfaces:**
- Produces:

```ts
export type Priority = "current" | "prefetch";
export interface Clock { now(): number; setTimeout(fn: () => void, ms: number): unknown }
export class QuotaError extends Error {}    // thrown by a task to signal 429 / Deezer error.code 4
export class DroppedError extends Error {}  // rejection of a task removed by dropWhere
export interface RequestQueue {
  enqueue<T>(key: string, priority: Priority, task: () => Promise<T>): Promise<T>;
  dropWhere(predicate: (key: string) => boolean): void;
  isIdle(): boolean;                        // nothing waiting, nothing running
  onIdle(listener: () => void): () => void; // fires on each transition to idle; returns unsubscribe
}
export function createRequestQueue(opts: { budget: number; windowMs: number; backoffInitialMs: number; backoffMaxMs: number; clock?: Clock }): RequestQueue;
```

The behaviour the tests pin:
- A sliding window: never more than `budget` task starts within any `windowMs` (AC14).
- `current` before `prefetch`, FIFO within a priority (AC17).
- A task that throws `QuotaError` goes back to the front of its priority. The queue pauses for `backoffInitialMs`, and each further `QuotaError` in a row doubles the pause, capped at `backoffMaxMs`. The first task that resolves resets the next pause to `backoffInitialMs` (AC15).
- `dropWhere` removes waiting tasks, which reject with `DroppedError` and are never started (AC16). It does not touch a running task.

- [ ] **Step 1: Write failing tests** with `t.mock.timers.enable({ apis: ["setTimeout", "Date"] })` and `clock = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms) }`:
  - `budget_window_deezer`: 100 instant tasks, `budget: 40, windowMs: 5000`. Record start times; for every start `s`, `starts.filter(x => x >= s && x < s + 5000).length <= 40`. Also assert the 41st starts at ≥ 5000 ms.
  - `budget_window_musicbrainz`: `budget: 1, windowMs: 1000`, 5 tasks → starts at 0, 1000, 2000, 3000, 4000.
  - `current_before_prefetch`: with the queue blocked, enqueue prefetch A then current B → B starts before A.
  - `quota_backoff_doubles_and_resets`: the task throws `QuotaError` 3 times then succeeds → gaps between attempts are 5000, 10000, 20000. A later task that throws `QuotaError` once is retried after 5000 (reset).
  - `quota_backoff_capped`: 6 consecutive `QuotaError`s → no gap above 60000.
  - `drop_rejects_waiting_never_starts`: block the queue, enqueue key `"x"`, `dropWhere(k => k === "x")` → the promise rejects with `DroppedError` and the task spy has 0 calls.
  - `backoff_does_not_block_other_queue` (AC15, Review Focus 1): two queues; queue A in a 60 s pause; a task on queue B resolves within 0 ms of mock time.
  - `drop_during_backoff` (Review Focus 1): a dropped task waiting behind a pause never starts after the pause ends.
  - `onIdle_fires_after_last_task`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `createRequestQueue`. Keep the start timestamps of the last `budget` starts. When at the limit, schedule the pump at `oldest + windowMs`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add rate-limited request queue with backoff`

---

### Task 6: `module/match.ts` (AC19, AC20)

**Files:**
- Create: `module/match.ts`, `test/match.test.mts`

**Interfaces:**
- Produces:

```ts
export function normalise(text: string): string;
export interface DeezerCandidate { title: string; title_short?: string; duration: number; preview?: string; artist: { name: string } }
export interface TrackQuery { artist: string; title: string; durationS: number }
export function pickCandidate(track: TrackQuery, candidates: DeezerCandidate[], toleranceS: number): DeezerCandidate | null;
```

- [ ] **Step 1: Write failing tests:**
  - `normalise("Creep - Remastered 2011") === normalise("Creep")`.
  - Each listed suffix is dropped: `"Song (Remastered)"`, `"Song (feat. X)"`, `"Song [feat. X]"`, `"Song (Radio Edit)"`, `"Song - Live"`, `"Song - Remaster"`, all equal `"song"`. Case-insensitive: `"Song (FEAT. X)"` too.
  - Unlisted suffixes stay: `normalise("Song (Acoustic)") === "song acoustic"`, `normalise("Song - 2011 Remaster") === "song 2011 remaster"` (Review Focus 4).
  - `normalise("Post-Punk") === "post punk"`, `normalise("Beyoncé") === "beyonce"`, `normalise("  A   B ") === "a b"`.
  - `pickCandidate`: artist and title equal with |Δduration| = 5 → match; Δ = 6 → `null`; `title_short` equal when `title` differs → match; with two matches, the first wins; artist mismatch → `null`.
  - `feat_in_spotify_title_matches` (Review Focus 3): Spotify `"Song (feat. X)"`, Deezer `"Song"` → match.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. First strip the suffixes in a loop until nothing changes, with `/\s*[([](?:feat\.|remastered|remaster|radio edit)[^)\]]*[)\]]\s*$/i` and `/\s+-\s+(?:live|remaster(?:ed)?\b.*)$/i`. Then `toLowerCase()`, `normalize("NFD")`, strip `\p{M}`, replace `/[^\p{L}\p{N}]+/gu` with a space, and trim.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add Deezer candidate matching`

---

### Task 7: `module/deezer.ts` and `module/jsonp.ts` (AC15 detection, AC21 preview part, AC40)

**Files:**
- Create: `module/deezer.ts`, `module/jsonp.ts`, `test/deezer.test.mts`, `test/jsonp.test.mts`

**Interfaces:**
- Consumes: `pickCandidate`, `DeezerCandidate`, `TrackQuery` (Task 6); `QuotaError` (Task 5).
- Produces:

```ts
// deezer.ts
export type DeezerTransport = (url: string) => Promise<{ status?: number; body: unknown }>;
export function buildDeezerSearchUrl(track: TrackQuery): string;   // https://api.deezer.com/search?q=artist:"…" track:"…"&limit=10
export function isQuotaResponse(status: number | undefined, body: unknown): boolean;
export function findPreview(track: TrackQuery, transport: DeezerTransport, toleranceS: number): Promise<string | null>; // throws QuotaError
// jsonp.ts
export function createJsonpTransport(env?: { document: Document; window: Window }, timeoutMs?: number): DeezerTransport; // appends output=jsonp&callback=…
```

- [ ] **Step 1: Write failing tests:**
  - `search_url_direct`: `buildDeezerSearchUrl(...)` starts with `https://api.deezer.com/search?` and does not contain `cors-proxy` (AC40).
  - `quota_detection`: `isQuotaResponse(429, {})`, `isQuotaResponse(200, {error:{code:4}})` are true; `isQuotaResponse(200, {data:[]})` is false.
  - `findPreview_quota_throws`: transport returns `{body:{error:{code:4}}}` → rejects with `QuotaError`.
  - `findPreview_no_match_null` and `findPreview_match_without_preview_null` (AC21).
  - `findPreview_match_returns_preview`.
  - `jsonp_appends_script_and_resolves` (fake `document` capturing the appended `<script>`): `src` starts with `https://api.deezer.com/`, contains `output=jsonp` and `callback=`. Invoking `window[callback]({data:[]})` resolves `{body:{data:[]}}`, and the script and callback are removed.
  - `jsonp_script_error_rejects` and `jsonp_timeout_rejects` (mock timers).
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. `findPreview`: `const {status, body} = await transport(url)`; if `isQuotaResponse` → throw `QuotaError`; then `pickCandidate(track, body.data ?? [], toleranceS)?.preview || null`. Callback names are `__spotifyGenresJsonp${counter}`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add Deezer search over JSONP`

---

### Task 8: `module/mel.ts` with Essentia parity fixture (AC22, AC23)

**Files:**
- Create: `scripts/essentia-reference.py`, `test/fixtures/mel-signal.f32`, `test/fixtures/mel-reference.f32`, `test/fixtures/mel-reference.json`, `module/mel.ts`, `test/mel.test.mts`

**Interfaces:**
- Produces:

```ts
export const PATCH_FRAMES = 128, PATCH_HOP = 62, MEL_BANDS = 96;
export function melFrames(samples: Float32Array): Float32Array;          // [frames, 96], row-major
export function melPatches(samples: Float32Array): { data: Float32Array; patches: number }; // [patches,128,96]
```

- [ ] **Step 1: Write `scripts/essentia-reference.py`.** Run it with `uv run --python 3.11 --with essentia-tensorflow --with numpy python scripts/essentia-reference.py test/fixtures`. It builds a deterministic 3 s 16 kHz signal (sum of 220/440/1000 Hz sines at amplitudes 0.5/0.3/0.1 plus a 2 s linear chirp from 100 to 7000 Hz at 0.1), writes it as `mel-signal.f32` (little-endian float32), and computes per-frame mel bands with `essentia.standard.TensorflowInputMusiCNN()`. Framing comes from `essentia.standard.FrameGenerator(audio, frameSize=512, hopSize=256, startFromZero=True, validFrameThresholdRatio=1)`. **First open Essentia's `src/algorithms/machinelearning/tensorflowpredicteffnetdiscogs.cpp` (via the essentia GitHub repo) and copy its FrameCutter parameters exactly if they differ, recording the source line in a comment.** It writes `mel-reference.f32` (`[frames,96]`) and `mel-reference.json` `{ "frames": n, "patches": p, "frames_30s": m, "patches_30s": q }`, where the `_30s` values come from the same framing over a 30 s signal.
- [ ] **Step 2:** Run the script. Expected: `patches_30s == 29` (AC23). If not, stop and report: the spec's AC23 and Essentia disagree.
- [ ] **Step 3: Write failing tests:**
  - `mel_matches_essentia` (AC22): load the fixtures; `melFrames(signal)` has `frames*96` values with max |Δ| ≤ 1e-3; `melPatches(signal).patches === json.patches`.
  - `thirty_seconds_yields_29_patches` (AC23): `melPatches(new Float32Array(480000)).patches === 29`.
  - `patch_layout`: patch 1's first frame equals frame 62 of `melFrames`.
- [ ] **Step 4:** Run the tests. Expected: FAIL.
- [ ] **Step 5:** Implement per spec §4.3: frame 512 / hop 256 (framing as the fixture), Hann window (confirm against the fixture; Essentia's zero-phase rotation does not change the magnitude), radix-2 real FFT → 257 magnitudes → 96 Slaney mel bands with `unit_tri` normalisation over 0–8000 Hz → `log10(1 + 10000·x)`. Patches of 128, hop 62, last partial patch dropped.
- [ ] **Step 6:** Run the tests. Expected: PASS. If the max error is above 1e-3, compare intermediate stages against Essentia (windowed frame, spectrum) by extending the Python script, not by loosening the tolerance.
- [ ] **Step 7: Commit** `feat(audio): add Essentia-compatible mel front-end with parity fixture`

---

### Task 9: `module/labels.ts` (AC24, AC25)

**Files:**
- Create: `module/labels.ts`, `test/labels.test.mts`

**Interfaces:**
- Produces:

```ts
export function averageActivations(batch: Float32Array, patches: number, classes: number): Float32Array;
export function displayName(label: string): string;   // "Electronic---Darkwave" → "darkwave", "Electronic" → "electronic"
export interface ScoredGenres { genres: string[]; scores: number[] }
export function topGenres(avg: Float32Array, labels: string[], topK: number, minConfidence: number): ScoredGenres;
```

- [ ] **Step 1: Write failing tests:**
  - `average_two_patches`: `[1,3]` and `[3,5]` with 2 classes → `[2,4]`.
  - `display_names` (AC25).
  - `top_k_threshold_order`: scores `[0.5, 0.1, 0.3, 0.2, 0.16]` → 3 genres ordered 0.5, 0.3, 0.2; `0.1` never appears.
  - `exactly_threshold_included`: a score of 0.15 qualifies.
  - `parent_fallback`: all below 0.15; parent `Rock` sums to 0.4 and `Electronic` to 0.3 → `{genres:["rock"], scores:[0.4]}`, using the summed activation (with float tolerance).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add label selection and display names`

---

### Task 10: `module/genre-pipeline.ts` — one-track resolution (AC1–AC6, AC9, AC12, AC21, AC36, AC37)

**Files:**
- Create: `module/genre-pipeline.ts`, `test/genre-pipeline.test.mts`

**Interfaces:**
- Consumes: `decideCacheAction`, `GenreCacheStore`, `CacheRules` (Task 4); `GenreFetchOutcome` from `module/logic.ts`; `ScoredGenres` (Task 9); `DroppedError`, `Priority` (Task 5).
- Produces:

```ts
export interface TrackRef { uri: string; artist: string; title: string; durationS: number | null; isLocal: boolean; isTrack: boolean }
export const isCatalogueTrack: (t: TrackRef | undefined) => t is TrackRef;   // isTrack && !isLocal
export interface GenreResult { genres: string[]; inferred: boolean }       // empty genres = clear the row
export interface PipelineDeps {
  store: GenreCacheStore;
  rules: CacheRules;
  now(): number;
  musicbrainz(track: TrackRef, priority: Priority): Promise<GenreFetchOutcome>;  // caller enqueues under key track.uri
  audioEnabled(): boolean;
  modelReady(): boolean;
  findPreview(track: TrackRef & { durationS: number }, priority: Priority): Promise<string | null>; // queued Deezer; may throw DroppedError
  classifyPreview(url: string): Promise<ScoredGenres>;             // fetch+decode+mel+worker+labels; throws on failure
  cacheEpoch(): number;                                            // bumped by clear (Task 11)
}
export async function resolveTrack(track: TrackRef, deps: PipelineDeps, priority: Priority): Promise<GenreResult>;
```

**Decision table** (each row is a test):

| Situation | Network | Cache write | Result |
|---|---|---|---|
| Not a catalogue track (AC5) | none | none | `[]` |
| `serve` decision (AC7, AC11, AC37) | none | none | entry genres, `inferred = source === "audio"` |
| MB hit (AC4) | MB | `musicbrainz` | MB genres, not inferred |
| MB reachable miss, audio off (AC1) | MB | `none` | `[]` |
| MB unreachable, audio off (AC12) | MB | none | `[]` |
| MB miss/unreachable, audio on, model not ready (AC6) | MB | none | `[]` |
| MB miss/unreachable, audio on + ready, preview classified (AC2, AC3) | MB, Deezer, preview | `audio` with `scores`, `modelVersion` | audio genres, inferred |
| …no candidate / no preview, MB reachable miss (AC21) | MB, Deezer | `none` | `[]` |
| …no candidate / no preview, MB unreachable (AC12, AC21) | MB, Deezer | none | `[]` |
| …classify throws (AC36) | MB, Deezer, preview | none | `[]` |
| `durationS === null` or empty artist (Review Focus 2) | MB only | MB rules; never `none` from the audio step | as MB |
| `recheck-musicbrainz` + MB hit (AC9) | MB only | `musicbrainz` | MB genres |
| `recheck-musicbrainz` + reachable miss (AC9) | MB only | same entry, `checkedAt = now()` | audio genres, inferred |
| `recheck-musicbrainz` + unreachable (AC9) | MB only | none | audio genres, inferred |
| `findPreview` throws `DroppedError` | MB, — | none | rethrow `DroppedError` |
| epoch changed between start and write (AC38) | — | none | result still returned |
| `store.get`/`put` throws (Review Focus 5) | as if absent | swallowed | normal result |

- [ ] **Step 1: Write failing tests**, one per row, with spies on every dep (call counts prove "Network" and the store spy proves "Cache write").
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `resolveTrack`. Capture `cacheEpoch()` at start and skip every `put` when it has changed.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add genre pipeline for one track`

---

### Task 11: Pipeline scheduler — songchange, prefetch, clear (AC13, AC16, AC18, AC38, AC39)

**Files:**
- Modify: `module/genre-pipeline.ts`
- Test: `test/genre-scheduler.test.mts`

**Interfaces:**
- Consumes: `resolveTrack`, `TrackRef`, `isCatalogueTrack` (Task 10); `RequestQueue`, `DroppedError` (Task 5).
- Produces:

```ts
export interface SchedulerDeps extends Omit<PipelineDeps, "cacheEpoch"> {
  queues: RequestQueue[];                  // MusicBrainz and Deezer
  render(result: GenreResult): void;
  nextTrack(): TrackRef | undefined;       // Player.data.nextItems[0], mapped
}
export interface GenreScheduler {
  songChanged(current: TrackRef | undefined): Promise<void>;
  clearCache(): Promise<void>;
}
export function createGenreScheduler(deps: SchedulerDeps): GenreScheduler;
```

`songChanged` does the following:
1. Bumps a render token.
2. Calls `dropWhere(k => k !== current?.uri && k !== nextTrack()?.uri)` on every queue (AC16).
3. Resolves the current track and calls `render` only if its token is still the latest (AC39).
4. Once every queue `isIdle()` (wait with `onIdle`), resolves `nextTrack()` if `isCatalogueTrack`, without rendering (AC18).

`clearCache` bumps the epoch and then calls `store.clear()` (AC13, AC38). The current track resolves at priority `current`, the next at `prefetch`.

- [ ] **Step 1: Write failing tests:**
  - `drops_unrelated_work_on_songchange` (AC16).
  - `stale_lookup_not_rendered` (AC39): A's MusicBrainz call is held, the song changes to B, then A's call is released → `render` is called once, with B's result.
  - `prefetch_after_idle_no_render` (AC18): the store gains the next track's entry and the `render` count is unchanged.
  - `prefetch_skips_local_nontrack_empty` (AC18): `nextTrack()` returns `undefined`, a local track, then a non-track → `musicbrainz` is never called for them.
  - `clear_then_next_play_full_lookup` (AC13).
  - `lookup_started_before_clear_writes_nothing` (AC38): hold MB, `clearCache()`, release → the store is empty.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): schedule current and prefetch lookups`

---

### Task 12: Operator gate — Manual Operator Steps 1–5

- [ ] **Step 1:** Hand the operator spec §9 Steps 1–5. Offer to generate a wizard with `mattpocock-skills:wizard` first. Wait for them to return `<hf-user>`, the HF commit SHA and the model SHA-256. Never handle the HF token, and never substitute placeholder values.
- [ ] **Step 2:** Set `MODEL_REPO`, `MODEL_REVISION`, `MODEL_SHA256` in `module/config.ts`.
- [ ] **Step 3: Verify CORS from the mirror.** For each file, `curl -sI -H 'Origin: https://xpui.app.spotify.com' "https://huggingface.co/$MODEL_REPO/resolve/$MODEL_REVISION/<file>" -L` must show `access-control-allow-origin` on the final response. Then `curl -sL … | sha256sum` must equal `MODEL_SHA256`.
- [ ] **Step 4:** Run `bun run test` (the `config.test.mts` assertion `modelPinned() === false` now fails — change it to `true`). Commit `feat(audio): pin Hugging Face model mirror`.

Tasks 2–11 do not depend on this gate. Tasks 13–15 need it only for their in-Spotify verification steps.

---

### Task 13: `module/model-store.ts` (AC26, AC27, AC41 status)

**Files:**
- Create: `module/model-store.ts`, `test/model-store.test.mts`

**Interfaces:**
- Produces:

```ts
export type ModelStatus = { state: "not-downloaded" } | { state: "downloading"; percent: number } | { state: "ready" } | { state: "failed"; reason: string };
export function statusLabel(s: ModelStatus): string;   // "Not downloaded" | "Downloading 42%" | "Ready" | "Failed — Retry"
export const MODEL_CACHE = `spotify-genres-model-${MODEL_VERSION}`, ORT_CACHE = `spotify-genres-ort-${ORT_VERSION}`;
export function assetUrls(): { model: string; labels: string; ortScript: string; ortWasm: string; ortGlue: string };
export interface ModelAssets { model: ArrayBuffer; labels: string[]; ortScript: string; ortWasm: ArrayBuffer; ortGlue: string }
export interface ModelStore {
  status(): ModelStatus;
  subscribe(listener: (s: ModelStatus) => void): () => void;
  init(): Promise<void>;          // ready if all assets already cached, else not-downloaded
  download(): Promise<void>;      // no-op when ready; used by toggle-on and Retry
  load(): Promise<ModelAssets>;   // from Cache Storage only
}
export function createModelStore(deps: { caches: CacheStorage; fetch: typeof fetch; digestHex(buf: ArrayBuffer): Promise<string> }): ModelStore;
```

Default ORT files (Task 14's spike confirms or corrects them): `ort.wasm.min.js`, `ort-wasm-simd-threaded.wasm` and `ort-wasm-simd-threaded.mjs` under `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`. The model and labels come from `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/<file>`. Progress is model bytes received ÷ 18,027,718.

- [ ] **Step 1: Write failing tests**, with an in-memory `CacheStorage` fake (a `Map` of name → `Map` of URL → `Response`) and a fetch spy:
  - `labels`: `statusLabel` for each state.
  - `cache_names_versioned` (AC27): every opened cache name contains `MODEL_VERSION` or `ORT_VERSION`.
  - `sha_mismatch_fails_nothing_cached` (AC26): `digestHex` returns a different hash → status `failed`, and no cache holds the model.
  - `second_enable_no_network` (AC27): `download()` → ready. Then build a **new** store on the same caches fake (a restart): `init()` → ready, and `download()` makes 0 fetch calls.
  - `progress_reported`: a streamed body in 3 chunks → subscribers see `downloading` with increasing percent, then `ready`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. Verify the SHA-256 before `cache.put`. On any failure, delete both caches and set `failed`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(audio): add model store with checksum and versioned cache`

---

### Task 14: Worker spike, then `audio-decode.ts` and `classifier-worker.ts` (AC28)

This is the risk task from spec §4.4. Prove the worker runs in Spotify before building on it.

**Files:**
- Create: `module/classifier-worker.ts`, `module/audio-decode.ts`, `test/classifier-worker.test.mts`

**Interfaces:**
- Consumes: `ModelAssets` (Task 13), `melPatches` (Task 8), `averageActivations`, `topGenres` (Task 9).
- Produces:

```ts
// classifier-worker.ts
export function workerMain(): void;                      // self-contained: no imports or outer references
export function workerSource(): string;                  // `(${workerMain.toString()})()`
export interface Classifier { run(patches: Float32Array, n: number): Promise<Float32Array>; dispose(): void } // returns [n,400]
export function createClassifier(assets: ModelAssets): Promise<Classifier>;  // Blob-URL Worker, posts assets once
// audio-decode.ts
export function decodeTo16kMono(bytes: ArrayBuffer): Promise<Float32Array>;  // decodeAudioData + OfflineAudioContext(1, ceil(duration*16000), 16000)
export function createPreviewClassifier(c: Classifier, labels: string[]): (url: string) => Promise<ScoredGenres>; // fetch(url) → decode → melPatches → run → average → topGenres
```

Worker protocol:
1. The page sends `{type:"init", ortScriptUrl, wasmUrl, glueUrl, model}`. The URLs are Blob URLs made from the cached assets, and `model` is a transferred `ArrayBuffer`.
2. The worker runs `importScripts(ortScriptUrl)`, sets `ort.env.wasm.numThreads = 1` and `ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: glueUrl }`, and creates the session.
3. Each `{type:"run", id, patches, n}` gets `{type:"result", id, activations}` or `{type:"error", id, message}` back.

- [ ] **Step 1: Write a failing test** `worker_source_is_self_contained`: `new Function(workerSource())` does not throw, and `workerSource()` contains neither `import ` nor `require(`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `workerMain`, `workerSource`, `createClassifier`, `decodeTo16kMono` and `createPreviewClassifier`. Preview bytes stay in memory only (AC28): no `caches`, IndexedDB or storage calls in `audio-decode.ts`. Add `test/no-preview-persistence.test.mts`, which reads `module/audio-decode.ts` as text and asserts it contains none of `caches.`, `indexedDB`, `storage.`.
- [ ] **Step 4:** Run the tests and `bun run build`. Expected: PASS, and `grep -c importScripts dist/genres@*/index.js` ≥ 1.
- [ ] **Step 5: Spike in Spotify** (needs Task 12). Temporarily expose `createModelStore`/`createClassifier` behind `showGenre:debug`, install with `bunx spicetify-kit install`, and run download → load → classify of one Deezer preview from DevTools. Expected: `activations.length === n*400` within a few seconds. If the glue/wasm file names or `wasmPaths` shape differ in 1.30.0, fix them in `assetUrls()` and record the working setup in a comment in `classifier-worker.ts`. If the Blob-URL worker cannot load the runtime at all, stop and report to the user: spec §4.4 does not hold.
- [ ] **Step 6: Commit** `feat(audio): run Discogs-EffNet in a Blob-URL worker`

---

### Task 15: Settings, rendering and wiring (AC1, AC4, AC5, AC29–AC31, AC41)

**Files:**
- Create: `module/settings.tsx`, `module/genre-cache-idb.ts`
- Modify: `module/mod.tsx`, `module/index.scss`, `module/logic.ts`
- Test: `test/render.test.mts`

**Interfaces:**
- Consumes: everything above.
- Produces:

```ts
// logic.ts
export function genreItemHtml(uri: string | null, genre: string, inferred: boolean): string;
// genre-cache-idb.ts
export function openIndexedDbStore(dbName?: string /* "spotify-genres" */, storeName?: string /* "tracks" */): GenreCacheStore;
// settings.tsx
export function registerGenreSettings(registrar: Registrar, deps: { store: ModelStore; getEnabled(): boolean; setEnabled(v: boolean): void; clearCache(): Promise<void> }): void;
```

- [ ] **Step 1: Write failing tests** in `test/render.test.mts`:
  - `inferred_item_markup` (AC29): `genreItemHtml("spotify:playlist:x", "darkwave", true)` contains `class="spicetify-genres-item spicetify-genres-inferred"`, the text `≈` before the label, and `title="Inferred from audio (MTG Discogs-EffNet, CC BY-NC-SA 4.0)"`.
  - `musicbrainz_item_markup` (AC29): `inferred=false` has no `≈`, no `title=` and no `spicetify-genres-inferred`.
  - `unresolved_playlist_non_navigable` (AC30): `uri=null` → `href="#"`, still marked inferred.
  - `escapes_html`: a genre `<b>` is escaped.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Move `makeGenreAnchor` from `mod.tsx` into `logic.ts` as `genreItemHtml`. Add `.spicetify-genres-inferred { font-style: italic; }` to `index.scss`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Implement `openIndexedDbStore` (one object store keyed by `uri`).
- [ ] **Step 6:** Implement `registerGenreSettings`. It registers into `settingsSection` a `SettingsSection` titled "Genres", built from `/modules/stdlib/lib/primitives.tsx`, holding three rows:
  - a `SettingsToggleRow` labelled "Infer genres from audio previews when MusicBrainz has none", whose `onChange(true)` calls `setEnabled(true)` and then `store.download()` (AC41);
  - a `SettingsRow` "Model" showing `statusLabel(status)` and subscribed to the store, which in the `failed` state renders a `Button` "Retry" that calls `store.download()` (AC41);
  - a `SettingsButtonRow` "Clear genre cache" → `clearCache()`.
- [ ] **Step 7: Wire `mod.tsx`:**
  - Map `client.player.data.item` to `TrackRef`: `durationS = item.duration?.milliseconds ?? Number(item.metadata?.duration)` ÷ 1000, `null` if not finite. `isTrack` comes from `client.uri.fromString(...).type === "track"`.
  - Create the MusicBrainz queue (`musicbrainzBudget`/`musicbrainzWindowMs`) and the Deezer queue (`deezerBudget`/`deezerWindowMs`) from `config.ts`.
  - `musicbrainz` dep = `mbQueue.enqueue(uri, priority, () => fetchGenresFromMusicBrainz(..., resolveMusicBrainzFetch()))`.
  - `findPreview` dep = `deezerQueue.enqueue(uri, priority, () => findPreview(track, createJsonpTransport(), durationToleranceS))`.
  - `classifyPreview` lazily creates the classifier from `modelStore.load()` on first use.
  - `audioEnabled` reads `client.storage.get(AUDIO_FALLBACK_STORAGE_KEY) === "true"`, and `modelReady` is `modelStore.status().state === "ready"`.
  - `render` calls `injectGenres(result.genres, token, result.inferred)`.
  - Replace `updateGenres` with `scheduler.songChanged(currentTrackRef())`.
  - Call `modelStore.init()` in `load` and register settings with the existing registrar. Dispose the classifier in `ctx.defer`.
  
  Keep the existing `updateToken` checks inside `injectGenres`, and keep the playlist resolution unchanged (AC7, AC30).
- [ ] **Step 8:** Run `bun run check && bun run test && bun run build`. Expected: all pass.
- [ ] **Step 9: Verify in Spotify** (`superpowers:verification-before-completion`). Install, then:
  - toggle off + an obscure track → row cleared and no Deezer `<script>` in DevTools (AC1);
  - a well-known track → plain genres (AC4);
  - a local file → row cleared (AC5);
  - toggle on → status goes `Downloading n%` → `Ready` (AC31, AC41);
  - the obscure track again → italic `≈` genres with the tooltip (AC2, AC29);
  - skipping quickly through 5 tracks → only the last one renders (AC39);
  - "Clear genre cache" → IndexedDB store empty in DevTools (AC13);
  - restart Spotify, toggle on → status `Ready` with no jsDelivr/HF requests in the Network panel (AC27).
  
  Take screenshots of the inferred row and the settings section.
- [ ] **Step 10: Commit** `feat(audio): wire audio fallback into the now-playing row and settings`

---

### Task 16: Evaluation script (AC34)

**Files:**
- Create: `scripts/evaluate.mts`, `scripts/evaluate-lib.ts`, `eval/tracks.example.csv`, `test/evaluate.test.mts`

**Interfaces:**
- Consumes: `findPreview` (Task 7) with a Node `fetch` transport (`{status: res.status, body: await res.json()}`), `melPatches` (Task 8), `averageActivations`/`topGenres`/`displayName` (Task 9).
- Produces:

```ts
// evaluate-lib.ts (pure)
export interface EvalRow { artist: string; title: string; durationS: number; expected: string[] }
export function parseTracksCsv(text: string): EvalRow[];     // header artist,title,duration_s,expected_genres; ';'-separated, quoted fields allowed
export function isHit(expected: string[], top3: string[]): boolean;   // any lowercased expected label equals a top-3 style
export function summarise(rows: Array<{ preview: boolean; hit: boolean }>): { coveragePct: number; hitRatePct: number }; // hits ÷ rows with preview; 0 when none
```

`evaluate.mts <csv> [--model <path>]` takes the model from `--model`, defaulting to `~/.cache/spotify-genres/mirror/discogs-effnet-bsdynamic-1.onnx`. It decodes each preview with `ffmpeg -i pipe:0 -f f32le -ac 1 -ar 16000 pipe:1` and runs `onnxruntime-node` with input `melspectrogram`. It reads labels from the mirror folder and runs Deezer calls through a `createRequestQueue` with `deezerBudget`. It prints per row `preview y/n | style:score, … | hit/miss`, then `Preview coverage: X% | Top-3 hit rate: Y%`.

- [ ] **Step 1: Write failing tests:**
  - `parseTracksCsv` on the example file → 2 rows with split `expected`.
  - `isHit(["Darkwave"], ["darkwave","synth-pop","coldwave"])` is true; `isHit(["rock"], ["darkwave"])` is false.
  - `summarise([{preview:true,hit:true},{preview:true,hit:false},{preview:false,hit:false}])` → `{coveragePct: 66.67 (±0.01), hitRatePct: 50}`.
  - `summarise([])` → zeros.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `evaluate-lib.ts`, `evaluate.mts` and `eval/tracks.example.csv` (header plus 2 rows).
- [ ] **Step 4:** Run the tests. Expected: PASS. Then `bun run evaluate eval/tracks.example.csv`. Expected: 2 rows and the summary line (needs the mirror folder from Manual Operator Step 1).
- [ ] **Step 5: Commit** `feat(audio): add evaluation script`

---

### Task 17: Identity and documentation (AC32, AC33, AC42)

**Files:**
- Modify: `module/metadata.json`, `README.md`, `CONTRIBUTING.md`, `docs/research/2026-10-06-research-audio-genre-classification.md`
- Test: `test/repo-invariants.test.mts`

- [ ] **Step 1: Write failing tests** (they read files and shell out to `git`):
  - `metadata_identity` (AC32): `name`, `authors`, `repository` as in the spec; `preview` equals `https://cdn.vexcited.com/uploads/537192869-5c23ba9e-8e92-4b3b-9e0f-71a37501589e.png` (AC42).
  - `no_onnx_tracked` (AC33): `git ls-files '*.onnx'` is empty.
  - `untouched_files` (AC42): `git diff --quiet main -- LICENSE .forgejo ant.lockb` exits 0, and `git check-ignore -q eval/tracks.csv` exits 0.
  - `readme_audio_section` (AC33): README has a `## Audio fallback` heading whose section mentions `opt-in` (case-insensitive), `Deezer`, `preview`, `CC BY-NC-SA 4.0` and `huggingface.co/`, plus a link to `https://code.vexcited.com/spicetify/genres`.
  - `contributing_bun` (AC33): it contains `bun install`, `bun run build`, `bun run test`, `bun run check`, `bun run evaluate` and `essentia-reference.py`, and does not match `/\bant\b/`.
  - `research_pointer` (AC33): the first line of the research report contains `docs/specs/2026-10-06-audio-genre-fallback.md`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Update `metadata.json`. Write the README "Audio fallback" section per spec §10, plus local install with `dist/spotify-genres@*`. Rewrite CONTRIBUTING for bun, the new clone URL `https://github.com/Heyian/spotify-genres`, the evaluation workflow (with ffmpeg as a prerequisite) and fixture regeneration. Add the research pointer line.
- [ ] **Step 4:** Run `bun run test && bun run build`. Expected: PASS, and `dist/spotify-genres@0.1.0/` exists (AC32).
- [ ] **Step 5: Commit** `docs: document audio fallback and rename to spotify-genres`

---

### Task 18: Deferred-item verification

- [ ] **Step 1:** For each of #1–#6, run `gh issue view <N> -R Heyian/spotify-genres --json body | jq -r .body | grep -cE '^#+ (Context|Required|Integration Points|Priority)'`. Expected: 4 each. Report any gaps to the user; don't edit issues unasked.

---

### Task 19: Post-implementation check

- [ ] **Step 1:** Read `git diff main --stat` and the diff. Confirm each spec §8 row and each §10 doc landed: `package.json` scripts and devDeps, `bun.lock`, `.gitignore`, `eval/tracks.example.csv`, `metadata.json`, `config.ts`, both scripts, `test/fixtures/`, the tsconfig split, `.forgejo/` untouched, README, CONTRIBUTING, the research pointer. No glossary or ADR tasks apply (spec §7).
- [ ] **Step 2:** Go through AC1–AC43 and name the test or verification step covering each. Any AC without one is a gap: add its test in the owning task's file and commit `test: cover AC<n>`.

---

### Task 20: Final build

- [ ] **Step 1:** Run `bun run check && bun run test && bun run build`. Fix until all three pass. Expected: `dist/spotify-genres@0.1.0/index.js` exists.
- [ ] **Step 2:** Optional advisory cross-model review (spec §11): run Codex adversarial review focused on AC1–AC43 only. Non-blocking.
