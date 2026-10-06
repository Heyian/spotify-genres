# Third-party web APIs for audio-based music genre detection (free-tier focus, as of 2026-10-06)

All pages accessed 2026-10-06 unless noted. "Audio" = service analyses the waveform; "Metadata" = genre comes from a catalogue lookup (only works for songs already in that catalogue).

Use case under test: free, open-source Spicetify extension; user will sign up for a key but will not pay; tracks are often obscure (not in central databases).

## Q1. Claim (1): "third-party resources are generally walled off behind an API" (paid / sales-gated / contract)

### Takeaway
Mostly true for audio-based genre at a usable volume. Only one audio-analysing vendor found (Cyanite) gives a self-serve API key on a free account, and it is capped at about 5 analyses/month. Every other audio-tagging vendor (AIMS, Bridge.audio API, Sonoteller API, Musiio) is sales/demo-gated, paid, or gone. The two "generic ML hosting" routes do not work for free: Hugging Face Inference Providers has no provider for `audio-classification`, and Replicate needs billing after a small trial. Free/trial APIs that do exist (AudD, ACRCloud, Shazam-on-RapidAPI, iTunes, Deezer) return genre from **metadata**, not audio.

### Comparison table

| Service | Analyses audio? | Free tier (self-serve?) | Limits | Gating for API | Genre taxonomy | Input | Notes / ToS |
|---|---|---|---|---|---|---|---|
| **Cyanite.ai** | Yes | Yes. Free account; "any free account is eligible for API integrations" | ~5 songs/month free (private users); files ≤15 min | Self-serve key for small test; real API use costs €290/month + usage fee, quote via sales | Genres + subgenres, moods, BPM, key, instruments; full taxonomy not given in FAQ | Upload, YouTube link, Spotify track ID (30 s preview); GraphQL | Creating an integration asks for a webhook endpoint. Vendor claims "up to 99%" accuracy |
| **Bridge.audio** | Yes | Web-app free plan €0: 50 workspace tracks with AI auto-tagging (per Capterra listing) | 50 tracks in the workspace | API page says "Book a demo" / hi@bridge.audio; API price not public | 69 sub-categories, 839 tags (musicologist thesaurus) | File upload | Free plan is a web app, not an API |
| **AIMS API** | Yes | None found; "free demo" for A2IM members | n/a | Sales/demo | Genre, mood, pace; no public list | n/a | — |
| **Musiio** (SoundCloud) | Yes (historically) | None | n/a | musiio.com now 301-redirects to soundcloud.com | n/a | n/a | No standalone product left |
| **Sonoteller.ai** | Yes | Web demo in "beta" (YouTube links, "demo purposes only") | Not stated | API by email (hello@sonoteller.ai); a RapidAPI listing is claimed by directories but plans could not be read | Genres, subgenres, moods, instruments, BPM, key | API "needs your owned music files" (upload) | — |
| **ReccoBeats** | Yes (features only) | Free API | ≤5 MB, ≤30 s (rest truncated) | Free; key/rate limit not stated on docs page | **No genre**: 9 Spotify-style audio features (acousticness, danceability, energy, …) | Multipart upload | Could feed a home-made classifier, not a genre API |
| **Genre Guru** (genreguru.com) | Claims yes | Unclear; "Your API key stays in your browser" | Not stated | Hobby project (GitHub wesleyhson/genre-guru, "Powered by Claude") | 19 "genre profiles" | Upload | Probably bring-your-own LLM key; not a vendor service |
| **Hugging Face Inference Providers** | Would be (model-based) | $0.10/month credits for free users | — | **No provider supports `audio-classification`** (docs); HF API returns 0 audio-classification models with any provider; `dima806/music_genres_classification` has an empty provider mapping | Per model (most hub genre models = GTZAN 10 genres) | Raw bytes / base64 | Dead end for hosted genre inference as of today |
| **Replicate** (`mtg/effnet-discogs`, `mtg/music-classifiers`, `mtg/maest`) | Yes | "Select models" free for a while, then billing required | effnet-discogs ≈ $0.00022/run (≈4,545 runs/$1), CPU, ~3 s | Self-serve, but billing needed beyond the try-for-free set; could not confirm mtg models are in that set | effnet-discogs: **400 Discogs styles** | Audio file/URL | Cheapest competent hosted option, but not free |
| **AudD** | Fingerprint only | 300 requests on signup, no card | ≤10 MB on standard endpoint; then $5/1,000 | Self-serve | No genre of its own; `apple_music` block has `genreNames` (metadata) | URL or multipart upload | 160 M-song DB; unknown tracks get no result |
| **ACRCloud** | Fingerprint only | 14-day free trial, no card | Trial length only; pricing not public on page | Self-serve console | Genres only via returned/external metadata; separate "AI Music Detector" detects AI-generated music, not genre | Audio/SDK | Same DB-coverage limit |
| **Shazam via RapidAPI** (third-party, unofficial) | Fingerprint only | 7-day trial, 50 requests (per apis.io) | Basic 2,000/month paid | RapidAPI self-serve | Metadata genre | Audio sample | Aggregator source; unofficial wrapper |
| **Chartmetric / Soundcharts / Songstats** | No (analytics metadata) | No API free tier | API from ~$350/month (Chartmetric), ~$250/month (Soundcharts), contact (Songstats) | Enterprise/sales | Metadata | IDs | — |
| **iTunes Search API / Deezer API** | No (metadata) | Free, no key | — | Open | Coarse store genres | Text search | Test: Fela Kuti "Water No Get Enemy" → iTunes `primaryGenreName` = "Worldwide"; Deezer album `genres` = empty |
| **Spotify audio-features / audio-analysis** | Was audio-derived | Closed to new apps | — | Restricted since 2024-11-27 | Never had track genre (artist genres only) | — | See Q3 |
| **AcousticBrainz** | Was audio-derived | Static dumps only | Frozen 2022 | Free (dumps) | High-level genre models (admitted poor) | MBID lookup | See Q3 |

### Cited Findings
- Cyanite FAQ: web app "5 songs for free per month" for private users; "Any free account is eligible for API integrations"; enterprise pricing = API subscription + usage fees + search subscription, rates via business@cyanite.ai; files "up to 15 minutes in length"; claims "accuracy rate of up to 99%" — [Cyanite FAQ](https://cyanite.ai/faq/)
- Cyanite: "The API usage fee is 290€/month"; "If you already have a Cyanite account, you can access the API for free to run a small test analysis"; inputs include uploads, YouTube links, Spotify track IDs (30-second previews); GraphQL API — [Cyanite blog: Music Analysis API](https://cyanite.ai/blog/music-analysis-api/)
- Cyanite integration flow: register, verify email, "Create New Integration", form asks for title and **webhook endpoint**, returns access token + webhook secret — [Cyanite API docs: create integration](https://api-docs.cyanite.ai/docs/create-integration)
- Cyanite pricing page (cyanite.ai/pricing) redirects to a JS-only "Pricing Calculator" (pricing.cyanite.app); no tiers could be read — [cyanite.ai/pricing](https://cyanite.ai/pricing/)
- Bridge.audio API: "69 sub-categories, 839 tags", thesaurus "refined and validated over nearly 20 years by … musicologists"; pricing not on page, "Book a demo" / hi@bridge.audio — [Bridge.audio API](https://www.bridge.audio/features/api/)
- Bridge.audio free plan €0.00 with 50 workspace tracks, 3 members, AI auto-tagging; Starter €5/month (250 tracks) — [Capterra listing via search snippet](https://www.capterra.com/p/10046336/Bridge-audio/) (not fetched directly)
- AIMS API: AI tagging into genre/mood/pace; A2IM members "can sign up for a free demo"; no public pricing — [A2IM spotlight](https://a2im.org/a2im-am-spotlight-aims-api)
- SoundCloud acquired Musiio in May 2022 — [Bandwagon](https://www.bandwagon.asia/articles/soundcloud-acquires-ai-music-curation-company-musiio-singapore-tech-2022); musiio.com now returns 301 to soundcloud.com — [musiio.com](https://www.musiio.com/) (observed redirect)
- Sonoteller: "listens to music"; "in beta"; "YouTube videos are used for demo purposes only (API needs your owned music files)"; API at scale via hello@sonoteller.ai — [sonoteller.ai](https://sonoteller.ai/)
- Directories say Sonoteller is on RapidAPI with a free tier — [Dataconomy](https://dataconomy.com/tools/sonoteller/); RapidAPI page is JS-rendered, plan limits could not be read (unconfirmed)
- ReccoBeats audio-feature extraction: multipart upload, max "5MB", max "30 seconds", returns 9 features, no genre — [ReccoBeats docs](https://reccobeats.com/docs/documentation/Analysis/audio-features-extraction)
- Genre Guru: upload MP3/WAV/FLAC/OGG/M4A, `POST /analyze`, "19 specialized genre profiles", "Your API key stays in your browser", footer "Powered by Claude", GitHub wesleyhson/genre-guru — [genreguru.com](https://genreguru.com/)
- Hugging Face free users get "$0.10, subject to change" monthly credits; PRO $2.00; hf-inference "focuses mostly on CPU inference" as of July 2025 — [HF Inference Providers pricing](https://huggingface.co/docs/inference-providers/pricing)
- HF audio-classification task page: "There are currently no snippet examples for the audio-classification task, as no providers support it yet." — [HF docs: audio classification](https://huggingface.co/docs/inference-providers/tasks/audio-classification)
- HF Hub API query `pipeline_tag=audio-classification&inference_provider=all` returned 0 models; `dima806/music_genres_classification` (2,183 downloads, top genre model) has `inferenceProviderMapping: {}` — [HF models API](https://huggingface.co/api/models?pipeline_tag=audio-classification&inference_provider=all) (queried 2026-10-06)
- Replicate `mtg/effnet-discogs`: "EfficientNet for music style classification by 400 styles from the Discogs taxonomy"; "approximately $0.00022 to run … or 4545 runs per $1"; CPU, ~3 s — [Replicate mtg/effnet-discogs](https://replicate.com/mtg/effnet-discogs). Other MTG models on Replicate: music-classifiers, maest, essentia-bpm, music-arousal-valence, music-approachability-engagement — [replicate.com/mtg](https://replicate.com/mtg)
- Replicate: "You can run select models on Replicate for free, but after a bit you'll be asked to set up billing." — [Replicate billing docs](https://replicate.com/docs/topics/billing); CPU $0.000100/s — [Replicate pricing](https://replicate.com/pricing)
- AudD: "300 requests are free on signup, no card needed"; $5 per 1,000; "160 million songs" — [audd.io](https://audd.io/); files "up to 10 MB" on standard endpoint; URL or multipart upload; metadata via `return=apple_music,spotify,deezer,musicbrainz` (Apple Music block has `genreNames`) — [AudD docs](https://docs.audd.io/)
- ACRCloud: "14 days of free trial after registration … no credit card" — [ACRCloud docs: Recognize Music](https://docs.acrcloud.com/get-started/tutorials/recognize-music) (from search snippet); site lists an "AI Music Detector" ("Identify AI-generated content from real recordings"), no genre-classification product; pricing not public — [ACRCloud pricing](https://www.acrcloud.com/pricing/)
- Shazam API on RapidAPI (third-party): 7-day trial up to 50 requests; Basic 2,000 requests/month — [apis.io Shazam plans](https://apis.io/plans/shazam/shazam-plans-pricing/) (aggregator)
- Chartmetric API from $350/month (1 rps); Soundcharts data delivery from $250/month; Songstats API enterprise only (api@songstats.com) — [Orphiq comparison](https://orphiq.com/resources/music-analytics-platforms-compared) (aggregator); [Songstats API post](https://lab.songstats.com/the-songstats-api-enterprise-access-to-music-data-across-all-dsps-ee26e2a3b3b2)
- iTunes Search API, no key: "Water No Get Enemy" → `primaryGenreName` "Worldwide"; Deezer album 7113170 `genres.data` = [] — own test against [itunes.apple.com/search](https://itunes.apple.com/search?term=water+no+get+enemy+fela&entity=song&limit=1) and [api.deezer.com](https://api.deezer.com/album/7113170)

### Inferences
- Claim (1) holds in practice. Paid APIs exist and are self-serve (Replicate, AudD), so access itself is not walled off; what is walled off is **free** audio-based genre at more than a handful of tracks.
- Cyanite's free tier is real and self-serve but ~5 tracks/month per account. For an extension this would mean each user registers their own Cyanite account, gets a token and sets up the integration (with a webhook URL a browser extension cannot easily host). Usable only as a "classify this one track" button, not for library-wide tagging.
- Shipping one shared key inside open-source extension code would expose it; any free-tier service would need per-user keys.
- Replicate `mtg/effnet-discogs` at ~$0.0002/track is the cheapest competent hosted option (1,000 tracks ≈ $0.22), but it breaks the "will not pay" constraint once the free trial ends.
- Hugging Face's old free "serverless Inference API" was the usual free route for hub genre models. It is now Inference Providers, with no audio-classification support, so that route is closed.

### Gaps
- Cyanite free API limits (rate limits; whether the 5/month also applies to API calls) not stated on an official page I could read. A search snippet says "5 free analyses per month, available through both the web app and API", but I could not trace it to a fetched page. The pricing calculator is JS-only.
- Cyanite / Bridge.audio ToS on commercial use and storing results not read (no ToS fetched).
- Bridge.audio: whether the free plan includes any API access not confirmed. API page points to sales.
- Sonoteller RapidAPI plan limits unconfirmed (page JS-rendered).
- Whether `mtg/*` models are in Replicate's "try for free" collection could not be confirmed (page JS-rendered).
- Not checked this session (no source fetched): Gracenote/Nielsen (believed enterprise-only, metadata + "sonic" style descriptors), Musixmatch (lyrics), AudioShake (stem separation), Hooktheory (chords), Musicfy (voice/AI generation), "MusicAI", Audiostack (audio ads/TTS), Tunebat and Musicstax (consumer sites, historically used Spotify audio features; Tunebat Analyzer does local key/BPM). None is known to offer a free audio-based genre API, but this is unverified.
- Hugging Face Spaces (free Gradio apps running genre models, callable via gradio client) not investigated. A possible free but unofficial and unreliable route.

## Q2. Claim (2): "free resources are not really competent"

### Takeaway
Partly true, but the evidence is thin on all sides. The open models that free routes would expose (GTZAN-trained 10-genre HF models) are narrow. The competent open model (MTG Discogs-EffNet, 400 styles) has no free hosted endpoint. No independent benchmark of commercial genre APIs exists. One small 5-track vendor-blog comparison found the paid services (Cyanite, AIMS) also misclassify non-Western genres. "Paid = competent" is not established either.

### Cited Findings
- MetaBrainz on ending AcousticBrainz (Feb 2022): "the existing models that we had for categories such as genre didn't work very well"; "it was difficult to get good results that covered the full range of content in the database"; no confidence values on predictions — [MetaBrainz blog (archived)](https://gwern.net/doc/www/blog.metabrainz.org/54a8eae256b311a8a14cce1195ca19e27dd1f298.html)
- Soundcharts blog compared Bridge.audio, Cyanite, AIMS on 5 tracks: Fela Kuti "Water No Get Enemy" → Bridge "Afrobeat (Nigeria)", Cyanite "Funk/Jazz", AIMS "Latin"; AIMS tagged Portuguese fado as "Klezmer"; Ayra Starr "Commas" → AIMS just "Pop"; concluded Bridge best — [Soundcharts: AI music analysis 2026](https://soundcharts.com/fr/blog/ai-music-analysis-2026) (n=5; possible commercial bias; not independent peer review)
- Cyanite claims "accuracy rate of up to 99%" (vendor claim, no method given) — [Cyanite FAQ](https://cyanite.ai/faq/)
- Most popular HF genre models are fine-tuned on GTZAN (e.g. `pedromatias97/genre-recognizer-finetuned-gtzan_dset`, `davron04/music_genres_classification-finetuned-gtzan`); GTZAN = 1,000 30-second clips across 10 genres — [HF models API](https://huggingface.co/api/models?pipeline_tag=audio-classification&search=genre&sort=downloads); [search snippet describing wav2vec2 GTZAN model](https://promptlayer.com/models/musicgenresclassification)
- MTG effnet-discogs covers 400 Discogs styles — [Replicate mtg/effnet-discogs](https://replicate.com/mtg/effnet-discogs)
- Methodology literature: MIREX "Audio Tag Classification" evaluated ~60 autotagging systems 2008–2012; paper questions validity of standard autotagging evaluation — [Sturm, "On Evaluation Validity in Music Autotagging" (arXiv 1410.0001)](https://arxiv.org/pdf/1410.0001)

### Inferences
- "Free" and "competent" are not cleanly linked. The competent open model (Discogs-EffNet) is free to run locally (Essentia/TF.js, covered by other notes) but not free to call as a hosted API. Hosted free options are either tiny quotas of a commercial model (Cyanite) or nothing.
- A 10-genre GTZAN model would be poor for "obscure tracks" that sit in niche styles. Claim (2) is fair for those.
- Paid commercial taggers disagree with each other on culturally specific genres. Genre labels are partly subjective, and any service (free or paid) will be wrong on a share of obscure tracks.

### Gaps
- No independent, published benchmark of Cyanite / Bridge / AIMS / Sonoteller / Musiio genre accuracy found.
- No accuracy data for Sonoteller or Genre Guru.
- Reddit/HN user reports not searched (budget).

## Q3. Spotify audio-features deprecation and AcousticBrainz status

### Takeaway
Spotify restricted Audio Features / Audio Analysis (and Recommendations, Related Artists, etc.) for new and development-mode apps on 2024-11-27. Since February 2026, development-mode apps also need the owner to have Premium, one Client ID per developer and at most 5 users. AcousticBrainz stopped collecting in 2022. Its CC0 dumps (29.46 M submissions, keyed by MusicBrainz recording MBID) remain downloadable, but its genre models were admitted to be weak, and it only covers recordings that have MBIDs and were submitted before 2022.

### Cited Findings
- Spotify 2024-11-27: restricted "Related Artists, Recommendations, Audio Features, Audio Analysis, Get Featured Playlists, Get Category's Playlists, 30-second preview URLs in multi-get responses, and Algorithmic and Spotify-owned editorial playlists" for new apps and dev-mode apps without a pending extension; extended-mode apps unaffected — [Spotify developer blog](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
- February 2026: dev-mode apps require owner Premium; new apps limited to 1 Client ID per developer and 5 users; search limit max 50→10; effective Feb 11 for new, Mar 9 for existing integrations — [Spotify Feb 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide); [TechCrunch 2026-02-06](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/embed/)
- AcousticBrainz: data collection stopped 2022; site/API still accessible; data CC0 — [acousticbrainz.org](https://acousticbrainz.org/)
- Dumps (dated 2022-07-06): high+low-level JSON, "29,460,584 submissions", 30 zstd archives; sample dump 100k; low-level CSVs; organised by MBID — [AcousticBrainz downloads](https://acousticbrainz.org/download)

### Inferences
- A Spicetify extension cannot rely on Spotify audio features. Spotify itself never exposed per-track genre, only artist genres.
- AcousticBrainz dumps help only when a track maps to a MusicBrainz recording MBID that was analysed before mid-2022. Obscure or new tracks will mostly miss, and its genre predictions are low quality by MetaBrainz's own account.

### Gaps
- Whether Spotify's restricted endpoints were later reopened for any tier after Feb 2026: no evidence found. Extended-quota approval criteria not checked.
- AcousticBrainz website/API long-term availability: the blog planned a full shutdown in "early 2023", but the site is still live as of 2026-10-06. No date for removal found.

## Q4. Recognition / metadata services and the obscure-track limitation

### Takeaway
AudD, ACRCloud and Shazam identify a recording by fingerprint against their database, then return catalogue metadata, including genre (e.g. Apple Music `genreNames`). They do not classify audio by genre, so a track missing from their database gets no genre. The genre they return is the coarse store/label genre (e.g. "Worldwide").

### Cited Findings
- AudD core response = artist, title, album, release_date, label, timecode, song_link; genre only inside optional metadata blocks (Apple Music `genreNames`) — [AudD docs](https://docs.audd.io/); DB "160 million songs" — [audd.io](https://audd.io/)
- ACRCloud returns external metadata (Spotify, Deezer, YouTube) after recognition — [ACRCloud docs](https://docs.acrcloud.com/get-started/tutorials/recognize-music) (search snippet)
- iTunes returns `primaryGenreName` "Worldwide" for a Fela Kuti Afrobeat track; Deezer album genres empty — own test, [iTunes Search API](https://itunes.apple.com/search?term=water+no+get+enemy+fela&entity=song&limit=1), [Deezer API](https://api.deezer.com/album/7113170)

### Inferences
- For a Spotify client the track is already identified (Spotify URI, ISRC), so fingerprinting adds nothing. It is metadata lookup by another path, with the same coverage gaps for obscure tracks, and it uses up the small free quotas (AudD 300 total, ACRCloud 14 days).
- Free metadata APIs (iTunes, Deezer, MusicBrainz) are open, but genre granularity is coarse or missing, which is the user's original problem.

### Gaps
- ACRCloud's exact metadata fields (whether `genres` is a top-level result field) not confirmed from a fetched doc page.
- Coverage rates of AudD/ACRCloud for independent/obscure releases: no published figures found.
