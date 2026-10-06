# Local desktop / self-hosted software for audio-based genre analysis (as of Oct 2026)

Scope: installable apps, CLIs, plugins and self-hosted servers that infer genre/style from the audio itself, on the user's machine. Repo dates come from the GitHub API and PyPI JSON API, queried 2026-10-06. "Pushed" = latest push to the repo; "release" = latest GitHub release or PyPI upload.

## 1. beets / Picard plugins and Essentia binaries

### Takeaway
The only beets plugin that does audio-based genre is **beets-xtractor**, which wraps Essentia's `streaming_extractor_music` and the old SVM "Gaia" models (genre_rosamerica and similar). Those models are deprecated by Essentia and released as CC BY-NC-ND. **beets-autogenre** uses Last.fm first and falls back to xtractor. beetcamp and the Picard plugins are metadata-only. The Picard AcousticBrainz plugins are dead because the AcousticBrainz service shut down in early 2023. Newer standalone Python CLIs built on Essentia's TensorFlow Discogs-EffNet/MAEST models (400 Discogs styles) have replaced the SVM route, but none of them has a beets/Picard plugin.

### Cited Findings
- **beets-xtractor** (adamjakab/BeetsPluginXtractor): MIT. Latest PyPI release v0.4.2 (2024-05-26); repo pushed 2026-07-22, so still lightly maintained. 80 stars. Needs beets ≥ 2.10.0. — [GitHub](https://github.com/adamjakab/BeetsPluginXtractor), [PyPI](https://pypi.org/project/beets-xtractor/)
  - Calls the external `streaming_extractor_music` binary, which must be compiled `--with-gaia` for the high-level models. Uses SVM models downloaded from essentia.upf.edu/svm_models (beta5 recommended), including `genre_rosamerica.history`, mood_*, danceability, voice_instrumental and gender. Writes attributes such as `genre_rosamerica` into the beets DB and keeps the extractor's JSON output. — [README](https://github.com/adamjakab/BeetsPluginXtractor)
- **beets-autogenre** (mgoltzsche/beets-autogenre): Apache-2.0. v0.5.1, 2024-08-25, and no commits since then, so stale. 21 stars. Gets genre from Last.fm through `lastgenre` and falls back to xtractor/Essentia, with thresholds on `genre_rosamerica` and `genre_electronic` probabilities. Also fixes remix genres by matching the genre tree against titles. — [GitHub](https://github.com/mgoltzsche/beets-autogenre)
- **beetcamp** (snejus/beetcamp): GPL-2.0. Active (0.25.0 released 2026-09-11). Described as "Bandcamp autotagger source for beets", i.e. a metadata source that does no audio analysis. — [GitHub](https://github.com/snejus/beetcamp)
- beets' own `acousticbrainz` plugin is deprecated because AcousticBrainz shut down. — [beets docs](https://docs.beets.io/en/latest/plugins/acousticbrainz.html)
- AcousticBrainz stopped accepting data, removed its submission tools and shut down its site in early 2023. A full data dump remains available. — [MetaBrainz blog (archived)](https://gwern.net/doc/www/blog.metabrainz.org/54a8eae256b311a8a14cce1195ca19e27dd1f298.html)
- **Picard plugins** (metabrainz/picard-plugins, 2.0 branch, pushed 2026-05-29): the list includes `acousticbrainz`, `acousticbrainz_tonal-rhythm`, `bpm`, `moodbars`, `lastfm`, `wikidata`, `genre_mapper` and `submit_folksonomy_tags`. No plugin there classifies genre from audio. Genre comes from Last.fm, Wikidata or MusicBrainz folksonomy. The AcousticBrainz plugins are still listed but depend on the dead service. — [GitHub plugins dir](https://github.com/metabrainz/picard-plugins/tree/2.0/plugins), [Picard plugin list](https://picard.musicbrainz.org/plugins)
- **Essentia SVM ("Gaia") models are officially deprecated**: "the more recent TensorFlow models now supersede many of the pre-trained SVM models". They cover genre on 4 datasets, plus ballroom, moods, danceability and voice/instrumental. Builds exist for v2.1_beta1/beta2 and v2.1_beta5. They need Gaia2, which runs on Linux/OSX only. Licence is **CC BY-NC-ND 4.0** (proprietary licence on request). — [Essentia SVM page](https://essentia.upf.edu/gaia_svm_models.html)
- The Essentia download page lists precompiled extractor binaries and "AcousticBrainz Music Extractor binaries" for Linux, OSX and Windows. It does not say whether those binaries include Gaia support. — [Essentia downloads](https://essentia.upf.edu/download.html)
- **Essentia** library: AGPL-3.0. The repo is very active (pushed 2026-10-02). The last formal GitHub release is old (v2.1_beta5, 2019-09-05), but `essentia` and `essentia-tensorflow` 2.1b6.dev1438 were uploaded to PyPI on 2026-05-19. Wheels exist for manylinux x86_64 and macOS 15 (arm64 and x86_64). **No Windows wheels.** — [GitHub](https://github.com/MTG/essentia), [PyPI essentia-tensorflow](https://pypi.org/project/essentia-tensorflow/)
- Essentia TensorFlow genre models: **Genre Discogs400** (discogs-effnet and discogs-maest variants), **Genre Discogs519** (MAEST-30s, ONNX available) and **MTG-Jamendo genre** (87 classes). Some models come as ONNX or TF.js. Licence is **CC BY-NC-SA 4.0** for all MTG models (proprietary on request). — [Essentia models](https://essentia.upf.edu/models.html)
- Discogs-EffNet is an EfficientNet trained on more than 2M recordings annotated with 400 Discogs styles. — [Replicate mtg/effnet-discogs](https://replicate.com/mtg/effnet-discogs/readme)

#### Standalone Essentia-based genre taggers (new since about 2025)
- **Essentia Music Tagger / Essentia-to-Metadata** (WB2024): MIT, 128 stars, pushed 2026-04-04. Classifies 400 Discogs genres plus mood and writes tags to FLAC, MP3, OGG, Opus, M4A, AIFF, WAV, WavPack, APE and others. Runs fully offline. Includes a Picard integration that auto-tags files after Picard saves them. Installed with `pip install essentia-tensorflow mutagen numpy`, so it is Linux/macOS only. — [GitHub](https://github.com/WB2024/Essentia-to-Metadata); recommended in [WB's Guide to Navidrome](https://github.com/WB2024/WBs-Guide-to-Navidrome)
- **essentia-autotagger** (cookiephone): MIT, v0.1.0 (2026-06-02), 1 star. Uses Discogs-EffNet and writes multi-value genre and mood tags. Splits `Rock---Alternative Rock` into `Rock` + `Alternative Rock`. Offers a TOML config, `--genre-threshold`, `--max-genres`, `--dry-run` and `--report preview.json` (predictions plus confidences as JSON). Models take about 23 MB and are stored under `~/.local/share/essentia-autotagger/models`. Requires Python 3.11 only, and the README says "Linux or WSL". — [GitHub](https://github.com/cookiephone/essentia-autotagger), [PyPI](https://pypi.org/project/essentia-autotagger/). Its README says the essentia-tensorflow wheels are Linux-only, which conflicts with the macOS 15 wheels now on [PyPI](https://pypi.org/project/essentia-tensorflow/).
- **settag** (lsdcapital): AGPL-3.0, v0.2.2 (2026-09-06), pushed 2026-10-02, 1 star. Uses **MAEST for genre** and optional Discogs-EffNet heads for mood/theme and instruments. Ships as a Textual TUI plus a plain CLI for scripts. Changes are staged and verified before anything is written. Installed with `uv tool install settag` and `settag models download`. Supports Python 3.10–3.14. — [GitHub](https://github.com/lsdcapital/settag), [PyPI](https://pypi.org/project/settag/)
- **matnn** (intamixx): a REST music-tag service that runs Discogs-EffNet (400 genres), musicnn or MagnaTagATune, plus BPM and key, using `POST /api/upload` with multipart form fields such as `genre_discogs_effnet=true`. Designed for Kubernetes with Kueue/JobSet. **No licence file** (GitHub reports none), so it is not reusable as-is. Pushed 2026-07-02, 7 stars. — [GitHub](https://github.com/intamixx/matnn)
- **musicnn** (jordipons): ISC. Pre-trained CNN taggers for MTT and MSD (50 tags, many of them genres). Has a CLI: `python -m musicnn.tagger file.mp3 --model MSD_musicnn --topN 3 --print --save out.tags`. **Abandoned**: last commit 2020-03-15, PyPI 0.1.0 from 2019-08-18. — [GitHub](https://github.com/jordipons/musicnn), [PyPI](https://pypi.org/project/musicnn/)
- **Clave-Tagger** (Zip83): a local Windows tool for Latin DJ MP3 libraries that offers "audio-model suggestions" and genre tagging into ID3 Grouping/Color. Pushed 2026-05-16, 0 stars. — [GitHub](https://github.com/Zip83/Clave-Tagger)

### Inferences
- For a Spicetify helper, the realistic local model stack in 2026 is Essentia-TensorFlow with Discogs-EffNet or MAEST (400 Discogs styles), not the SVM/Gaia route. The Discogs taxonomy contains niche styles, which suits obscure tracks better than the 8–10-class rosamerica/tzanetakis sets.
- The licence chain matters. Essentia is AGPL-3.0 and the models are CC BY-NC-SA 4.0 (SVM models are CC BY-NC-ND). A free, non-commercial OSS extension can use them, but it should download the models at runtime rather than bundle them in a differently-licensed package, and should credit MTG.
- Windows is the weak point: there are no essentia-tensorflow wheels for Windows. The ONNX exports of the Discogs-EffNet/MAEST models listed on the models page could be run with onnxruntime (which supports Windows) to avoid that limit. This is an inference from the ONNX availability and has not been tested.
- None of the beets or Picard routes exposes an HTTP server. They are batch taggers over files on disk.

### Gaps
- I did not verify whether the current prebuilt `streaming_extractor_music` binaries include Gaia, or whether essentia.upf.edu/svm_models still serves the files. The download URLs are documented, but I made no HEAD request.
- I found no beets plugin that uses Discogs-EffNet/MAEST directly. None appeared in searches, but the beets plugin ecosystem was not searched exhaustively.
- "MusicBrainz Melodia": I found no MusicBrainz project by that name in this research. Melodia is, to my knowledge, an MTG Vamp plugin for melody (pitch) extraction, not genre, but this was not verified with a source here.

## 2. Self-hosted music servers with audio analysis

### Takeaway
**AudioMuse-AI** is the only actively developed self-hosted system that does audio-based classification and covers several servers. Its classifier is MusiCNN (50 MSD/Last.fm-style tags, many of them genres) plus DCLAP embeddings for text search. It has a REST API with Swagger, but it is built around analysing tracks from a connected media server, not arbitrary files, and it does not write genre tags back to files. Bliss-based tools (Lyrion, MPD) compute similarity features only. Plex Sonic Analysis is paid (Plex Pass) and is used for similarity, not exposed genre tags.

### Cited Findings
- **AudioMuse-AI** (NeptuneHub/AudioMuse-AI): AGPL-3.0, 2,691 stars, v3.6.3 released 2026-09-26, very active. Integrates with Navidrome, Jellyfin, LMS, Lyrion, Emby and Plex. Runs via Docker Compose, Podman or Kubernetes (AMD64/ARM64), **or as native packages for macOS arm64 (zip), Windows amd64 (zip) and Linux x86_64/aarch64 (.deb/.rpm)** with embedded PostgreSQL. The web UI is at `http://127.0.0.1:8000`, with Swagger at `/apidocs/`. Requires a CPU with AVX2. — [README](https://github.com/NeptuneHub/AudioMuse-AI), [releases](https://github.com/NeptuneHub/AudioMuse-AI/releases)
  - Models: ONNX Runtime runs **MusiCNN** (embedding and mood/tag prediction, 200-d embedding) and **DCLAP** (512-d audio embedding, 48 kHz). Mood labels such as danceable, party, relaxed and sad come from CLAP text-label similarity, not a separate model. — [docs/ALGORITHM.md](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/docs/ALGORITHM.md)
  - The classifier label set (`MOOD_LABELS` in config.py) is the 50 MSD/Last.fm tags: rock, pop, alternative, indie, electronic, dance, jazz, metal, chillout, classic rock, soul, folk, punk, blues, hard rock, ambient, Hip-Hop, country, funk, electro, heavy metal, Progressive rock, rnb, indie pop, House, and others, plus decade, mood and vocal-gender tags. It keeps the top 5 (`TOP_N_MOODS`). An optional `genre_subgenre.json` is used to build GENRE→SUBGENRE trees from embedding centroids. — [config.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/config.py)
  - API surface: the external blueprint has `GET /get_score?id=<item_id>` (the full score row, including tag/mood vector), `GET /get_embedding` and `GET /search`. There are also `POST /api/analysis/start`, `POST /api/clap/search` (text-to-audio search such as "calm piano songs") and `GET /api/clap/concepts`. Items are keyed by media-server item IDs. — [app_external.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/app_external.py), [app_analysis.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/app_analysis.py), [app_clap_search.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/app_clap_search.py)
  - Plugins: **Jellyfin plugin** (NeptuneHub/audiomuse-ai-plugin, AGPL-3.0, v0.3.5 2026-09-01). **Navidrome plugin** (NeptuneHub/AudioMuse-AI-NV-plugin, AGPL-3.0, v10 2026-08-31, 516 stars). An unofficial **Lyrion plugin** (JameZUK/lyrion-audiomuseai-plugin). There is also the AudioMuse-AI MusicServer (Subsonic-like). — [README](https://github.com/NeptuneHub/AudioMuse-AI), [Jellyfin plugin](https://github.com/NeptuneHub/audiomuse-ai-plugin), [NV plugin](https://github.com/NeptuneHub/AudioMuse-AI-NV-plugin)
  - Third-party write-ups describe it as matching "mood, instruments, and genre as heard in the audio itself", which works even when metadata is poor. — [Elest.io blog](https://blog.elest.io/audiomuse-ai-free-open-source-alternative-to-spotify-ai-dj/)
- **Plex Sonic Analysis**: a neural network maps tracks and extracts about 50 parameters, used for "sonically similar" artists, albums and tracks and for Track Radio. It is a **Plex Pass (paid)** feature. Press coverage says it determines qualities "like genre, instruments, types of vocals, mood". The official support page returned HTTP 403 to my fetch, so I could not confirm whether genres are exposed. — [TechCrunch](https://techcrunch.com/2021/08/12/plexs-new-feature-matches-your-sonically-similar-music-to-make-playlists), [9to5Mac](https://9to5mac.com/2021/08/12/plex-brings-sonic-analysis-plexamp-music-app/), [Plex support (403 to fetch)](https://support.plex.tv/articles/sonic-analysis-music/)
- **Lyrion/LMS**: CDrummond's **bliss-analyser** (GPL-3.0, release 0.5.2 2025-09-27, pushed 2026-08-28) analyses songs with bliss-rs for **Bliss Mixer**. **lms-blissmixer** is GPL-3.0, v0.10.0 2026-07-25, active. The older **lms-musicsimilarity / music-similarity** (Bliss + Essentia + Musly, with an HTTP API) is marked **DEPRECATED** in favour of Bliss Analyser and has not been pushed since 2022-07-07. — [bliss-analyser](https://github.com/CDrummond/bliss-analyser), [lms-blissmixer](https://github.com/CDrummond/lms-blissmixer), [music-similarity](https://github.com/CDrummond/music-similarity)
- **Navidrome** (GPL-3.0, very active) has no built-in audio analysis. Audio genre/similarity comes from the AudioMuse-AI NV plugin, or from tagging files beforehand with external tools such as Essentia Music Tagger. — [Navidrome](https://github.com/navidrome/navidrome), [WB's Guide to Navidrome](https://github.com/WB2024/WBs-Guide-to-Navidrome)

### Inferences
- AudioMuse-AI is the most mature "local helper with an HTTP API", but it is a poor fit for Spotify. Analysis is triggered per media-server library and results are keyed by server item ID, so a Spotify track would first have to exist as a file in a connected server. It is useful as a reference implementation of ONNX MusiCNN/CLAP inference on a CPU.
- MusiCNN's 50-tag vocabulary is coarse (rock, pop, electronic, House…). For obscure tracks, Discogs-400 (Essentia) gives finer styles.

### Gaps
- **Ampache, Funkwhale, Lidarr, Emby core and Jellyfin core** were not researched in depth here. I found no evidence that any of them does audio-content genre classification (Lidarr is a metadata/download manager), but that absence was not verified with a source.
- I could not confirm whether Plex exposes sonic-analysis-derived genres through its API.

## 3. Tag, DJ and player tools

### Takeaway
Most popular tag and DJ tools do **not** classify genre from audio. OneTagger looks up metadata and uses Shazam fingerprint identification. Its "audio features" come from Spotify's API, not local analysis. Mixxx analyses only beats, key, gain, loudness, silence and waveform. bliss-rs computes similarity descriptors, not genre. Strawberry has moodbar only. In the commercial DJ space, Lexicon's genre data comes from online metadata lookups plus its own energy/danceability ratings. I found no free commercial DJ tool that does local audio genre classification.

### Cited Findings
- **OneTagger** (Marekkon5/onetagger): GPL-3.0, 1,066 stars, runs on Windows, macOS and Linux (Arch, Debian, Fedora, Ubuntu; GUI and CLI builds). Fetches metadata from Beatport, Traxsource, Juno, Discogs, MusicBrainz, iTunes, Beatsource, Spotify, Bandcamp, Deezer and Musixmatch. Its "Audio Features" mode writes Spotify audio features, needs a Spotify account, and matches by ISRC. Shazam identification goes through SongRec. **The last release is 1.7.0 (2023-08-03)**, though the repo was pushed 2026-02-13, so maintenance is slow. — [GitHub](https://github.com/Marekkon5/onetagger), [website](https://onetagger.github.io/)
- **SongRec** (marin-m/SongRec): GPL-3.0, 1,984 stars, v0.7.5 2026-08-18, very active. An open-source Shazam client for Linux (Rust) that can **"recognize songs from your speakers rather than your microphone"** through PulseAudio/PipeWire, and has CLI features. Fingerprinting is done locally and matching happens on Shazam's servers. It identifies tracks; it does not classify them. — [GitHub](https://github.com/marin-m/SongRec)
- **bliss-rs** (Polochon-street): GPL-3.0, pushed 2026-08-12. "A song analysis library for making playlists" that uses aubio-based spectral, timbral and chroma features with distance metrics such as Mahalanobis. It **does not classify genre**. Python bindings and TypeScript (Bun) bindings exist (`bliss-audio-ts`), and it can be compiled to WASM with emscripten. **blissify-rs** is an MPD playlist tool, v0.6.1 2026-02-15, and GitHub reports no licence. — [bliss-rs](https://github.com/Polochon-street/bliss-rs), [blissify-rs](https://github.com/Polochon-street/blissify-rs)
- **Mixxx** (GPL, very active, 2.5.6 2026-03-27): `src/analyzer` contains only the beats, ebur128, gain, key, silence and waveform analyzers. There is no genre analyzer. — [Mixxx src/analyzer](https://github.com/mixxxdj/mixxx/tree/main/src/analyzer)
- **Strawberry** (GPL-3.0, very active): the source tree has `analyzer` (a visualiser), `moodbar` and `tagfetcher` (fingerprint-based MusicBrainz lookup) modules. There is no genre classifier. — [Strawberry src](https://github.com/strawberrymusicplayer/strawberry/tree/master/src)
- **Sonic Visualiser** (GPL-2.0, v5.2.1 2025-03-21, pushed 2025-12-07) is an analysis and annotation GUI driven by Vamp plugins. — [GitHub](https://github.com/sonic-visualiser/sonic-visualiser)
- **Musly** (dominikschnitzer/musly): MPL-2.0, last push 2024-08-03. A music similarity library, not genre classification. — [GitHub](https://github.com/dominikschnitzer/musly)
- **Lexicon DJ** (Rekordcloud, paid): "Find Tags" searches Beatport, Spotify and Discogs for metadata and adds its own energy and danceability ratings. It has a "Genre Clean Up" tool and a local API that can filter by genre and energy. I found no evidence that it classifies genre from audio. — [We Are Crossfader walkthrough](https://wearecrossfader.co.uk/blog/lexicon-music-management-for-djs/), [lexicon-client README](https://cdn.jsdelivr.net/npm/@juanpprieto/lexicon-client@1.0.2/README.md)
- **Rekordcloud** also makes **OpenKeyScan**, a free, open-source, offline desktop app for key detection only (no genre). Its SonoVault REST API serves genre metadata for more than 80M tracks, which is a database, not audio analysis. — [rekord.cloud](https://rekord.cloud/)
- **Mixed In Key** (paid) is aimed at harmonic and key organisation and is "not recommended as a first choice for genre … classification". — [jackrighteous.com aggregator, low reliability](https://jackrighteous.com/ja/blogs/ai-music-distribution-guide/top-10-ai-music-analyzers)
- **beaTunes** (tagtraum, paid with a 14-day trial, macOS and Windows): audio analysis for BPM, key and "song color" (sound categorisation), plus fingerprint metadata lookup. The source found describes version 2.0 from 2009. — [iClarified](https://www.iclarified.com/3071/tagtraum-industries-releases-beatunes-20)
- **choon.app** (Show HN): a paid (credit-based) AI tagger for DJs on Mac that combines metadata, audio DSP and ML into 50+ sub-genres plus region, era and vibe, and writes to Rekordbox My Tags. "No audio ever leaves the machine." Not open source. — [HN thread](https://hn.svelte.dev/item/47780619)
- FindGenre is a web service (upload, YouTube or SoundCloud link) with strength in electronic subgenres. It is not local. — [hunted.space](https://hunted.space/product/findgenre)

### Inferences
- Spotify deprecated the audio-features endpoint for new apps (a fact recalled from memory, not verified here; see Gaps). If so, OneTagger's "Audio Features" mode probably no longer works for new API clients. Either way, it is not local analysis.
- Among DJ tools, only paid niche products such as choon.app claim audio-plus-metadata genre tagging. No free commercial tool in this space was found.

### Gaps
- **rekordbox, Serato, Traktor, Engine DJ, VirtualDJ**: not verified with sources here. As far as I know none classifies genre from audio, but I did not confirm this.
- **foobar2000 components, MediaMonkey, Mp3tag, Clementine**: not researched with sources. Mp3tag and MediaMonkey are believed to be metadata-only. I did not find a foobar2000 genre-classification component, and searches were not exhaustive.
- **Vamp plugins for genre**: my grep of vamp-plugins.org failed, so I could not confirm whether any Vamp plugin outputs genre. None is known to me.
- I did not confirm whether the current beaTunes version (beyond 2.0) does audio genre classification.
- The Spotify audio-features deprecation date and scope were not verified in this research.

## 4. Which tools expose a local HTTP API or CLI that a Spicetify (Chromium) extension could call?

### Takeaway
No ready-made tool offers "POST audio or a file path to localhost and get genres back" as a standalone desktop helper. AudioMuse-AI has a localhost REST API, but it is keyed to media-server items. matnn has the right REST shape but is a Kubernetes service with no licence. The practical path is a small custom helper, written in Python with essentia-tensorflow or in any language with onnxruntime plus the Discogs-EffNet/MAEST ONNX models, exposing `127.0.0.1:<port>` with CORS headers. The CLIs (essentia-autotagger `--report json`, settag's plain CLI, musicnn) can serve as subprocess backends or reference code.

### Cited Findings
- AudioMuse-AI: local web server at `http://127.0.0.1:8000`, Swagger at `/apidocs/`, endpoints `/get_score`, `/get_embedding`, `/search`, `/api/clap/search` and `/api/analysis/start`. Native packages exist for Win/macOS/Linux. — [README](https://github.com/NeptuneHub/AudioMuse-AI), [app_external.py](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/app_external.py)
- matnn: `POST /api/upload` (multipart audio plus flags) and a status GET. Kubernetes-based, no licence. — [GitHub](https://github.com/intamixx/matnn)
- essentia-autotagger: a CLI with a JSON report of predictions and confidences (`--dry-run --report preview.json`). — [GitHub](https://github.com/cookiephone/essentia-autotagger)
- settag: a plain non-TUI CLI "for scripts, redirected output, saved plans, and CI". — [GitHub](https://github.com/lsdcapital/settag)
- musicnn: a CLI tagger that prints top-N tags or saves them to a file. Abandoned. — [GitHub](https://github.com/jordipons/musicnn)
- The deprecated LMS music-similarity script used to provide "a simple HTTP API" around Bliss, Essentia and Musly analysis. It has been superseded by bliss-analyser. — [music-similarity](https://github.com/CDrummond/music-similarity)
- bliss-rs has TypeScript bindings and a WASM build path, but it produces similarity features, not genre. — [bliss-rs](https://github.com/Polochon-street/bliss-rs)

### Inferences
- Spotify desktop streams are not available to an extension as local audio files. So any audio-based approach needs either (a) capture of system or loopback audio by the helper process while the track plays (the SongRec "from speakers" model), or (b) some other source of the audio. A helper that records about 30 s from the PipeWire/PulseAudio monitor (Linux), WASAPI loopback (Windows) or a virtual device (macOS), runs Discogs-EffNet or MAEST, and returns JSON on localhost fits the stated architecture. This is an inference; no existing tool does it end-to-end.
- The Chromium side needs the helper to send `Access-Control-Allow-Origin` (and handle private-network-access preflight where relevant). This is standard browser behaviour and was not specifically verified for the Spotify CEF build.
- Model licensing (CC BY-NC-SA) is compatible with a free non-commercial extension. AGPL Essentia in a network-exposed helper triggers AGPL source-offer obligations, which an open-source helper satisfies anyway.

### Gaps
- I did not test whether the Spotify desktop (CEF) allows `fetch` to `http://127.0.0.1` without extra flags.
- I did not confirm whether essentia.js (WASM) can run the Discogs-EffNet/MAEST classifiers in-browser, which would remove the need for a helper. The models page mentions TF.js versions for "some models", but I did not determine which.

## 5. Projects that tag Spotify listening using audio analysis (e.g. loopback capture)

### Takeaway
I found no open-source project that captures Spotify playback audio and classifies its genre locally. The closest building block is SongRec's system-audio (speaker) capture, which identifies tracks through Shazam rather than classifying them. Existing Spicetify genre extensions are metadata-based.

### Cited Findings
- SongRec can recognise songs from speaker or system audio on Linux (PulseAudio/PipeWire). Identification is done through the Shazam service. — [GitHub](https://github.com/marin-m/SongRec)
- GitHub searches for "spicetify genre" return only metadata-display extensions: LucasOe/spicetify-genres (description: "What's Than Genre?" [sic], pushed 2026-09-15, 35 stars, based on Tetrax-10's extension), jeroentvb/spicetify-genre and Aimarekin/Spicetify-Genre. — [LucasOe/spicetify-genres](https://github.com/LucasOe/spicetify-genres), [jeroentvb/spicetify-genre](https://github.com/jeroentvb/spicetify-genre), [Aimarekin/Spicetify-Genre](https://github.com/Aimarekin/Spicetify-Genre)
- Web searches for Spotify plus loopback genre classification returned only academic or demo projects that classify from Spotify API audio features (danceability, energy and similar), not from captured audio. Example: psnv03/music-genre-prediction (78% accuracy with a Bagging classifier on Spotify features). — [psnv03/music-genre-prediction](https://github.com/psnv03/music-genre-prediction)
- MusicGenreDB archives Spotify's former "Data Alchemist" (Every Noise) genre taxonomy of 6,291 genres. It is a label taxonomy, not a classifier. — [ThatSINEWAVE/MusicGenreDB](https://github.com/ThatSINEWAVE/MusicGenreDB)

### Inferences
- A loopback-capture plus Essentia helper would appear to be novel in the open-source space. The building blocks (SongRec-style capture, essentia-tensorflow or ONNX Discogs models) are all available under licences that suit a free project.

### Gaps
- Reddit (r/selfhosted, r/DataHoarder, r/DJs) was not searched directly in this pass. Community-only tools may exist there.
- I did not verify whether Shazam responses (via SongRec) include a genre field that could serve as a cheap fallback.

## Summary table (free / open-source unless noted)

| Tool | Type | Audio genre? | Model | Licence | Platforms | Maintenance (Oct 2026) | Integration surface |
|---|---|---|---|---|---|---|---|
| beets-xtractor | beets plugin | Yes | Essentia SVM (genre_rosamerica etc.), deprecated | MIT (models CC BY-NC-ND) | Linux/macOS (Gaia) | Release 2024-05, commits 2026-07 | beets DB attrs + JSON |
| beets-autogenre | beets plugin | Fallback via xtractor | Last.fm + Essentia SVM | Apache-2.0 | as beets | Stale (2024-08) | beets DB / tags |
| beetcamp | beets plugin | No (metadata) | – | GPL-2.0 | all | Active | beets |
| Picard plugins | Picard | No (AcousticBrainz dead) | – | various | all | Active repo | tags |
| Essentia-to-Metadata | CLI | Yes | Discogs-EffNet 400 | MIT (models NC-SA) | Linux/macOS | 2026-04 | writes file tags |
| essentia-autotagger | CLI | Yes | Discogs-EffNet | MIT | Linux/WSL | v0.1.0 2026-06 | file tags + JSON report |
| settag | TUI/CLI | Yes | MAEST + EffNet heads | AGPL-3.0 | Py 3.10–3.14 (Linux/macOS) | v0.2.2 2026-09 | file tags, CLI |
| musicnn | CLI/lib | Yes (50 tags) | MusiCNN MTT/MSD | ISC | Python | Abandoned (2020) | CLI/text |
| matnn | REST service | Yes | Discogs-EffNet / musicnn | None (unlicensed) | k8s | 2026-07 | HTTP |
| AudioMuse-AI | self-hosted server | Yes (50 tags) + CLAP | MusiCNN ONNX + DCLAP | AGPL-3.0 | Docker, native Win/macOS/Linux | Very active (v3.6.3 2026-09) | HTTP API :8000, Jellyfin/Navidrome/Lyrion plugins |
| bliss-rs / blissify / bliss-analyser | lib/CLI | No (similarity) | DSP features | GPL-3.0 | all | Active | lib, DB |
| OneTagger | GUI/CLI | No (metadata + Spotify features + Shazam ID) | – | GPL-3.0 | Win/macOS/Linux | Last release 2023 | file tags |
| SongRec | GUI/CLI | No (identification) | Shazam fingerprint | GPL-3.0 | Linux | Active | CLI |
| Mixxx / Strawberry | apps | No | – | GPL | all | Active | – |
| Plex Sonic Analysis | server | Similarity (genre not exposed?) | proprietary NN | **Paid (Plex Pass)** | Plex server | Active | Plex API |
| Lexicon | DJ library | No audio genre found; online lookups + energy | – | **Paid** | Win/macOS | Active | local API |
| Mixed In Key, beaTunes, choon.app | DJ/library | Key/colour; choon claims genre | proprietary | **Paid** | macOS/Win | – | – |
