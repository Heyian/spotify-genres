# Spicetify audio-based genre classification: feasibility (as of 2026-10-06)

Context: MIT-licensed TS Spicetify extension "genres" (`module/logic.ts` currently queries MusicBrainz via plain `fetch`). Local environment used for live checks: Spotify 1.2.96.518 (Linux, `/opt/spotify`), Spicetify CLI 2.45.1, CEF reporting `Chrome/146.0.7680.179` (from `strings /opt/spotify/libcef.so`). Items marked "local check" were run from this machine on 2026-10-06 with `curl -H "Origin: https://xpui.app.spotify.com"`.

## 1. Can the extension read PCM of the playing Spotify track? (DRM, Web Audio, getAudioData)

### Takeaway
No practical in-renderer path. Spotify desktop playback is not exposed to the xpui renderer as a capturable media element, and `Spicetify.getAudioData()` never returned audio anyway (it returned Spotify's precomputed *analysis* JSON) and is now reported broken on Spotify 1.3.0/1.3.1 ("Resolver not found!").

### Cited Findings
- `Spicetify.getAudioData(uri)` in current spicetify-cli source is just `Spicetify.CosmosAsync.get("https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/<id>?format=json")` — it fetches Spotify's audio-analysis JSON (segments/beats/timbre), not samples — [spicetify/cli helpers.js](https://github.com/spicetify/cli/blob/8c92e3067de9659caca4c9da7979da3897458e27/src/jsHelper/spicetifyWrapper/helpers.js)
- Spicetify docs describe it as using `wg://audio-attributes/v1/audio-analysis/`, "identical to Spotify Web API's Get Track's Audio Analysis" — [spicetify.app getAudioData](https://spicetify.app/docs/development/api-wrapper/functions/get-audio-data)
- 2026-09-17: extension author tested `Spicetify.getAudioData()` on Spotify 1.3.0.277 — rejects on all 3 tracks with "request failed with error code -1 (Resolver not found!)"; "Endpoint does not resolve from the desktop client"; feature closed as not applicable — [afonsoamaro/spicetify-winamp-classic#11](https://github.com/afonsoamaro/spicetify-winamp-classic/issues/11)
- 2026-10-01: Eternal Jukebox (relies on audio analysis) stuck on Spotify 1.3.1.234 + Spicetify 2.45.1; `getAudioData()` throws `TypeError: Cannot read properties of undefined (reading 'from')` (URI API change) and direct `CosmosAsync.get("wg://audio-attributes/v1/audio-analysis/<id>")` → "Resolver not found!" — [Pithaya/spicetify-apps-dist#94](https://github.com/Pithaya/spicetify-apps-dist/issues/94) (open, no maintainer reply at time of check)
- Even before 2026, the public audio-analysis endpoint was flaky (404/504 for many tracks) — [Spotify Community: Audio Analysis 404/504](https://community.spotify.com/t5/Spotify-for-Developers/Audio-Analysis-HTTP-404-Timeout-504/td-p/4996897)
- Local check: Spotify Linux binary contains Widevine CDM component-updater strings (`DesktopWidevineComponentUpdateNonAuth.proto`, "Widevine CDM component update failed") and xpui bundles contain `requestMediaKeySystemAccess` (3 files) — local `strings /opt/spotify/spotify`, `grep /opt/spotify/Apps/xpui/*.js` (no URL)
- Spicetify CLI is still active: v2.45.3 released 2026-10-03, v3.0.0-rc.3 on 2026-10-02 — [spicetify/cli releases](https://github.com/spicetify/cli/releases)

### Inferences
- `getAudioData` was never an audio source; visualizers built on it (spicetify "Visualizer", Monstercat-style, wavebar) animate from precomputed analysis, not live PCM. With the resolver gone in 1.3.x, those visualizers likely break too.
- Spotify desktop decodes audio in its native core (C++ playback stack), not via an `<audio>`/MSE element in xpui; there is no `HTMLMediaElement` to hand to `createMediaElementSource`/`captureStream`. EME/Widevine code in xpui is shared web-player code. Even where EME is used (web player), decrypted frames are not readable from JS by design. Net: Web Audio capture from the renderer is not viable. (Inference from local evidence; no Spotify primary doc found.)
- `getUserMedia`/`getDisplayMedia` audio capture from CEF would need permission handlers Spotify does not expose; not verified.

### Gaps
- Did not live-test `getAudioData` on the local 1.2.96 client (would require running devtools in the user's Spotify session). Whether the `https://spclient.wg.spotify.com/...` form (current CLI) still works on 1.2.x vs 1.3.x is unconfirmed; the two reports above used 1.3.0/1.3.1.
- Found no official Spotify doc describing the desktop playback pipeline / where decryption happens.

## 2. Spotify Web API deprecations and internal endpoints (audio features/analysis, genres)

### Takeaway
Public audio-features/audio-analysis/recommendations/related-artists/preview_url were cut for new and dev-mode apps on 2024-11-27; Feb 2026 dev-mode changes removed more (popularity, external_ids incl. ISRC on tracks, batch endpoints). Artist `genres` was not listed as removed. Internal audio-analysis via Spicetify appears dead on 1.3.x.

### Cited Findings
- 2024-11-27: Related Artists, Recommendations, Audio Features, Audio Analysis, Featured Playlists, Category Playlists, 30s preview URLs in multi-get responses, algorithmic/editorial playlists restricted for new apps and dev-mode apps without pending extension; "Applications with existing extended mode Web API access ... remain unaffected" — [Spotify dev blog 2024-11-27](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
- February 2026 dev-mode changelog: removed endpoints incl. Get Several Tracks/Artists/Albums, Artist Top Tracks, New Releases, browse categories, user playlists; removed fields: Artist `followers`, `popularity`; Album `external_ids`, `label`, `popularity`; Track `external_ids`, `linked_from`, `popularity`, `available_markets` — [Web API Changelog Feb 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- Artist `genres` and `preview_url` are not mentioned in the Feb 2026 changelog — [Web API Changelog Feb 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- Dev-mode apps now need owner Premium, 1 Client ID per developer, 5 users per app; new-app restrictions 2026-02-11, existing apps migrated 2026-03-09 — [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) (as summarised in search results; dates via [Headphonesty](https://www.headphonesty.com/2026/02/spotify-crackdown-thousands-third-party-music-apps/))
- Internal audio-analysis resolver returns "Resolver not found!" on 1.3.0/1.3.1 — [winamp-classic#11](https://github.com/afonsoamaro/spicetify-winamp-classic/issues/11), [spicetify-apps-dist#94](https://github.com/Pithaya/spicetify-apps-dist/issues/94)

### Inferences
- A Spicetify extension doesn't need its own Web API app: it can call internal endpoints with the client's session token (CosmosAsync / `Spicetify.Platform` / GraphQL), so dev-mode limits don't apply directly. But ISRC for cross-service lookup may be harder: public Track `external_ids` was removed for dev-mode apps; the extension should read ISRC from internal metadata (e.g. the track metadata the client already loads) if available — not verified.
- Spotify artist genres (when populated) are artist-level, not track-level; still a cheap first fallback if the internal artist query returns them.

### Gaps
- Not verified whether artist `genres` is still populated in 2026 responses (public or internal GraphQL `queryArtistOverview`). Community reports from 2025 suggested many artists return empty `genres`; not confirmed in this pass.
- Not verified which internal endpoint/GraphQL op exposes ISRC to xpui in 1.2.96/1.3.x.
- No found source on any internal track-level genre tag endpoint.

## 3. Alternative audio sources (Deezer, iTunes, YouTube, others) and CORS from the Spotify client

### Takeaway
Deezer and iTunes 30s previews are free, keyless, and their audio CDNs send `Access-Control-Allow-Origin: *`, so the extension can `fetch()` the MP3/AAC and decode it with `AudioContext.decodeAudioData`. iTunes Search API JSON is CORS-open; Deezer API JSON is not (use JSONP or a different call path). Both also carry genre metadata. YouTube/yt-dlp is out (ToS, needs a native helper).

### Cited Findings
- Local check: `https://itunes.apple.com/search?...&entity=song` → `access-control-allow-origin: *`; result includes `previewUrl` (AAC `.m4a` on `audio-ssl.itunes.apple.com`) and `primaryGenreName` ("Alternative" for Radiohead "Creep") — [iTunes Search API](https://itunes.apple.com/search?term=radiohead+creep&entity=song&limit=1)
- Local check: iTunes preview CDN (`audio-ssl.itunes.apple.com/...m4a`) → `access-control-allow-origin: *`, `content-type: audio/x-m4p` — [sample preview URL](https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/1f/18/e2/1f18e22b-264e-88f8-ee89-c196fa9abd7a/mzaf_14184372154331980897.plus.aac.p.m4a)
- Local check: Deezer `https://api.deezer.com/track/isrc:GBAYE9200070` returns track with `preview` MP3 URL (lookup by ISRC works, no key), but response has **no** `Access-Control-Allow-Origin` header (sends allow-headers/methods/credentials only) for Origin `https://xpui.app.spotify.com` or `null` — [Deezer track by ISRC](https://api.deezer.com/track/isrc:GBAYE9200070)
- Local check: Deezer preview CDN (`cdnt-preview.dzcdn.net/...mp3?hdnea=exp=...~hmac=...`) → `access-control-allow-origin: *`, `audio/mpeg`, ~480 KB; URL is signed with an expiry token so must be fetched fresh — [Deezer track by ISRC](https://api.deezer.com/track/isrc:GBAYE9200070)
- Local check: Deezer album endpoint exposes genre list (`{'id': 85, 'name': 'Alternative'}`) — [Deezer album](https://api.deezer.com/album/14880711)
- Spicetify docs: CosmosAsync can hit external URLs but warn "requests to external URLs are not safe and may compromise the user's account" (it attaches session headers); use `fetch` for external URLs — [spicetify.app CosmosAsync](https://spicetify.app/docs/development/api-wrapper/methods/cosmos-async)
- Existing extension already uses plain `fetch` to `musicbrainz.org` from the Spotify renderer (`module/logic.ts:151-163`); MusicBrainz sends `access-control-allow-origin: *` (local check) — [MusicBrainz WS](https://musicbrainz.org/ws/2/recording?fmt=json&limit=1&query=creep)

### Inferences
- Pipeline that works without leaving the renderer: get ISRC/title/artist of current track → iTunes Search (CORS-open) or Deezer (JSONP: Deezer API historically supports `output=jsonp`, not verified here) → fetch preview → `decodeAudioData` → resample to 16 kHz mono via `OfflineAudioContext` → classifier.
- Previews are 30 s clips chosen by the store, often from mid-track; good enough for genre classifiers trained on 3–30 s patches.
- Coverage for obscure tracks: iTunes/Deezer catalogues are large (most distributor-delivered releases go to all DSPs), so ISRC hits are likely for anything on Spotify via a distributor, but no coverage stats were found. Tracks absent from MusicBrainz are not necessarily absent from Deezer/iTunes.
- YouTube/yt-dlp: needs a native process, violates YouTube ToS; SoundCloud API is closed to new apps (not verified this pass); Bandcamp has no public API. Not recommended.

### Gaps
- No published coverage numbers for Deezer/iTunes preview availability on obscure/indie tracks.
- Did not verify Deezer JSONP from the Spotify renderer (CSP could block injected `<script>` from api.deezer.com; see section 5).
- Deezer API ToS for using previews as classifier input not reviewed.

## 4. System audio loopback via a local helper process

### Takeaway
Technically feasible (WASAPI loopback, PulseAudio/PipeWire monitor source) but requires a separately installed native helper + local IPC (WebSocket/HTTP on localhost), captures the full system mix, and is "recording" Spotify output — conflicts with Spotify's user guidelines on ripping/recording. Not a good fit for a Marketplace extension.

### Cited Findings
- WASAPI loopback "can capture the audio stream that is being played by a rendering endpoint device" by opening a shared-mode stream with `AUDCLNT_STREAMFLAGS_LOOPBACK`; it "contains the mix of all audio being played" — [Microsoft Learn: Loopback Recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- Same doc: "a trusted audio driver does not permit a loopback device to capture digital streams that contain protected content" (PMP/DRM path) — [Microsoft Learn: Loopback Recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- Spotify User Guidelines prohibit "copying, reproducing, redistributing, 'ripping,' recording ..." — [Spotify User Guidelines](https://www.spotify.com/us/legal/user-guidelines/)

### Inferences
- Linux: `parec`/`pw-record` on the sink's `.monitor` or a per-app PipeWire node can isolate Spotify's stream; Windows 10 2004+ also offers process-specific loopback (`ActivateAudioInterfaceAsync` with process loopback) — known APIs, not fetched this pass.
- Analysing a few seconds in memory and discarding is arguably not "ripping" (no permanent copy), but "recording" is listed too; risk is ToS/account-level, not criminal. Deezer/iTunes previews avoid Spotify content entirely.
- macOS needs ScreenCaptureKit audio or a virtual device (BlackHole) — extra friction.

### Gaps
- PipeWire/PulseAudio and Windows process-loopback docs not fetched; no ToS ruling found on transient in-memory analysis.
- Whether Spotify desktop marks its output as protected (blocking WASAPI loopback) — none found; widely used recorders imply it isn't, but unverified.

## 5. Client-side inference in the Spotify CEF renderer

### Takeaway
Feasible: CEF is Chromium 146, so WASM (incl. SIMD/threads subject to cross-origin isolation) and WebGL are available; WebGPU availability depends on Spotify's GPU flags/platform. xpui `index.html` has no CSP meta tag, and the extension already fetches external hosts, so loading models from Hugging Face / CDN is likely fine. Best-fit models: Essentia/MTG Discogs400 (ONNX/TF), msd-musicnn (tfjs zip available), or HF HuBERT/wav2vec2 GTZAN classifiers via transformers.js.

### Cited Findings
- Local check: `/opt/spotify/libcef.so` reports `Chrome/146.0.7680.179`; Spotify ships `libvk_swiftshader.so`, `libGLESv2.so`, `libEGL.so` — local `strings`/`ls /opt/spotify` (no URL)
- Local check: `/opt/spotify/Apps/xpui/index.html` has no `Content-Security-Policy` meta; only `licenses-loader.html` matched — local `grep` (no URL)
- Essentia models: Genre Discogs400 (400 Discogs styles; `genre_discogs400-discogs-effnet`, MAEST variants), Discogs519, MTG-Jamendo genre (87 classes), msd-musicnn (50 Last.fm tags); all input 16 kHz; "All the models created by the MTG are licensed under CC BY-NC-SA 4.0" — [Essentia models](https://essentia.upf.edu/models.html)
- Local check: model server lists `genre_discogs400-discogs-maest-10s-*.onnx` (plus `.pb`/`.json`), and `msd-musicnn-1-tfjs.zip`, `msd-musicnn-1.onnx`, `msd-vgg-1-tfjs.zip` — [genre_discogs400 dir](https://essentia.upf.edu/models/classification-heads/genre_discogs400/), [msd autotagging dir](https://essentia.upf.edu/models/autotagging/msd/)
- npm versions (local `npm view`, 2026-10-06): `essentia.js` 0.1.3 (last publish 2022-05-01 — stale), `onnxruntime-web` 1.30.0 (2026-09-18), `@huggingface/transformers` 4.3.0 (2026-09-16), `@tensorflow/tfjs` 4.22.0 (2025-01-08) — [npm essentia.js](https://www.npmjs.com/package/essentia.js), [npm onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web), [npm @huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers)
- Transformers.js runs ONNX models in-browser via ONNX Runtime with WASM or WebGPU, and supports an `audio-classification` pipeline — [transformers.js docs](https://huggingface.co/docs/transformers.js/index)
- HF audio-classification genre models (2026-10-06 API query): `dima806/music_genres_classification` (2,183 downloads), `onnx-community/Musical-genres-Classification-Hubert-V1-ONNX` (transformers.js-ready ONNX), several GTZAN-finetuned DistilHuBERT/wav2vec2 models — [HF models API](https://huggingface.co/api/models?search=music_genres_classification&sort=downloads&limit=5), [onnx-community HuBERT genres](https://huggingface.co/onnx-community/Musical-genres-Classification-Hubert-V1-ONNX)

### Inferences
- GTZAN models give only 10 coarse genres (blues, classical, country, disco, hiphop, jazz, metal, pop, reggae, rock); Discogs400 gives fine-grained styles (e.g. "Electronic---Darkwave") that match the extension's tag-style UI better. Discogs-EffNet embedding (~MB-scale) + small head via onnxruntime-web is the strongest option; CC BY-NC-SA licence is compatible with a free, non-commercial MIT extension if the model is downloaded at runtime (not vendored) and attributed — licence interpretation, not legal advice.
- Feature extraction: Discogs-EffNet/MusiCNN need 16 kHz mel-spectrogram patches matching Essentia's TensorflowInputMusiCNN/…Discogs preprocessing; either use essentia.js WASM (stale package but works) or reimplement mel frontend in JS. MAEST ONNX models take raw-ish spectrogram input too — check model JSON.
- WASM threads require `SharedArrayBuffer`/cross-origin isolation, which xpui probably lacks → single-threaded WASM; for a 30 s clip and an EfficientNet-B0-sized model, single-thread inference is plausibly a few seconds. Run in a Web Worker (Blob URL worker) to avoid UI jank.
- Cache models in Cache Storage/IndexedDB after first download; cache results per track ID in localStorage.

### Gaps
- Not verified at runtime: WebGPU availability (`navigator.gpu`) inside Spotify's CEF, `crossOriginIsolated`, whether Blob-URL Workers and `wasm-unsafe-eval` are permitted (no meta CSP, but CSP could be set via response headers by Spotify's internal scheme handler — not checked).
- Model file sizes and actual inference latency in CEF not measured.
- Whether discogs-effnet embedding model is available as ONNX (listing partially read; `.pb` confirmed, ONNX present for MAEST heads).

## 6. Metadata fallbacks (brief)

### Takeaway
Several free, CORS-open metadata sources can cover gaps cheaply before/alongside audio inference: Last.fm tags (free key), Discogs styles, Deezer album genres, iTunes primaryGenreName, Wikidata.

### Cited Findings
- Local check CORS (`access-control-allow-origin: *`): Last.fm `ws.audioscrobbler.com/2.0/` (403 with invalid key, header still present) — [Last.fm API](https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&artist=radiohead&track=creep&api_key=invalid&format=json); Discogs `api.discogs.com/database/search` — [Discogs API](https://api.discogs.com/database/search?q=creep); MusicBrainz — [MusicBrainz WS](https://musicbrainz.org/ws/2/recording?fmt=json&limit=1&query=creep); Wikidata with `origin=*` — [Wikidata API](https://www.wikidata.org/w/api.php?action=wbsearchentities&search=radiohead&language=en&format=json&origin=*)
- iTunes Search returns `primaryGenreName` per track; Deezer album returns `genres.data[]` — see section 3 links.

### Inferences
- Order by cost: Spotify artist genres (internal, if populated) → MusicBrainz (current) → Last.fm track/artist top tags (best coverage for indie/obscure; user-supplied free key since keys shouldn't be shipped) → Discogs styles (needs token for search) → iTunes/Deezer genre (coarse) → audio classifier on preview as last resort.
- Tracks with no store preview and no metadata anywhere remain unclassifiable without Spotify audio.

### Gaps
- Discogs search auth requirement and Last.fm rate limits not verified this pass.
- Bandcamp has no public API; scraping tags would be HTML scraping (fragile, ToS risk) — not researched.

## 7. Spotify Developer Terms / User Terms on analysing or extracting audio

### Takeaway
Both the Developer Terms and the User Guidelines forbid ingesting Spotify Content into an ML model, ripping/recording, and circumventing technology; the User Guidelines also forbid modifying the client (which Spicetify itself already does). Running a classifier on Spotify's audio stream is clearly prohibited; running it on Deezer/Apple previews avoids Spotify Content (subject to those services' own terms).

### Cited Findings
- Developer Terms IV.2.a.i prohibit "using the Spotify Platform or any Spotify Content to train a machine learning or AI model or otherwise ingesting Spotify Content into a machine learning or AI model" — [Spotify Developer Terms](https://developer.spotify.com/terms)
- Developer Terms IV.2.b.iii prohibit "facilitating 'stream ripping' or other functionalities that make it easier for users to capture or otherwise make permanent copies"; IV.2.a.ii prohibits reverse-engineering; local caching limited to "temporary caching of metadata and cover art" — [Spotify Developer Terms](https://developer.spotify.com/terms)
- User Guidelines prohibit "copying, reproducing, redistributing, 'ripping,' recording ..."; "circumventing any technology used by Spotify"; "reverse-engineering, decompiling, disassembling, modifying, or creating derivative works"; "using any part of the Services or Content to train a machine learning or AI model or otherwise ingesting Spotify Content into a machine learning or AI model" — [Spotify User Guidelines](https://www.spotify.com/us/legal/user-guidelines/)

### Inferences
- "Ingesting Spotify Content into a machine learning or AI model" covers inference, not just training — so loopback capture of Spotify playback → classifier is a direct conflict, independent of whether a copy is kept.
- Spotify metadata (title/artist/ISRC) used only to look up third-party sources is a lower-risk use; the extension's existing MusicBrainz lookup follows that pattern.
- Spicetify use itself is a client modification under the User Guidelines; enforcement historically targeted ad-blocking, not cosmetic extensions (no source fetched).

### Gaps
- Deezer and Apple terms on programmatic preview use/analysis not reviewed.
- Did not check whether Developer Terms apply at all to a Spicetify extension that has no registered Spotify app (it uses the user's own session); User Guidelines apply regardless.
