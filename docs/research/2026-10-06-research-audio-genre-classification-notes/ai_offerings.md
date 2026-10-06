# AI offerings for audio-based music genre identification (as of Oct 2026)

Access date for all sources: 2026-10-06 unless noted. Free-tier terms change often; treat every quota below as "verify in console before relying on it".

## Hosted APIs: which accept raw audio, and which are free?

### Takeaway
Google Gemini API is the only major hosted LLM API found with a free tier that accepts raw audio (MP3/OGG/FLAC etc., up to 9.5 h per prompt) — current free models are the Gemini 3.x Flash / Flash-Lite line plus 2.5 Flash; Pro models are paid-only, free-tier data is used for training, and free quotas are small and project-specific (2.5 Flash ~20 RPD after Dec 2025 cut). OpenAI audio models have no free tier; Claude API has no audio input; Mistral Voxtral is speech-only; Alibaba gives a one-time 1M-token / 90-day quota (Singapore region only); HF Inference Providers gives only $0.10/month.

### Cited Findings
**Google Gemini API**
- Pricing page (dated Oct 1, 2026) lists free tier for: Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite, 2.5 Flash, 2.5 Flash-Lite (input "Free of charge") — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Gemini 2.5 Pro and Gemini 3.1 Pro Preview: free tier "Not available" — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). Note: a first fetch of the same page (summarised by the fetch tool) listed 2.5 Pro as free; the second, targeted fetch quoted "Not available". Trust the second; third-party source agrees Pro was removed from free tier — [agentdeals.dev](https://agentdeals.dev/gemini-api-pricing-changes)
- Free tier: "Content used to improve our products" = Yes for all free-tier offerings — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Paid-tier audio input across these Flash/Pro models: roughly $0.50–$3.00 per 1M tokens — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Audio input specs: 13 formats (WAV, MP3, AIFF, AAC, OGG, FLAC, M4A, Opus, WebM, …); max 9.5 h audio per prompt; 32 tokens per second of audio (a 30 s clip ≈ 960 tokens); inline request < 20 MB (larger via Files API); audio downsampled to 16 Kbps and multi-channel mixed to mono; understands non-speech sounds ("birdsong, sirens"); doc examples use `gemini-3.8-flash` — [Gemini audio docs](https://ai.google.dev/gemini-api/docs/audio)
- Rate limits page no longer publishes free-tier RPM/TPM/RPD numbers; says limits are per project and viewable in AI Studio; "more restricted for experimental and preview models" — [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Dec 6–7, 2025 quota cut: Gemini 2.5 Flash free tier went from 10 RPM / 250 RPD to 5 RPM / 20 RPD; 2.5 Pro removed from free tier; Gemini 3.x Flash/Flash-Lite remain free with no published limits — [agentdeals.dev](https://agentdeals.dev/gemini-api-pricing-changes); [yingtu.ai](https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026) (secondary sources)

**OpenAI**
- Audio-input models and audio input price per 1M tokens: gpt-realtime-2.1 / gpt-realtime-2 / gpt-realtime-1.5 / gpt-realtime / gpt-audio-1.5 / gpt-audio $32.00; gpt-realtime-2.1-mini / gpt-realtime-mini / gpt-audio-mini $10.00; transcription-only gpt-4o-transcribe $2.50, gpt-4o-mini-transcribe $1.25 — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- Pricing page shows no free tier or free credits — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- GPT-4o reportedly has a "significantly high refusal rate" on music genre classification (search-result snippet, attributed to the GPT-4o voice mode exploration paper; abstract alone did not confirm the number) — [arXiv 2502.09940](https://arxiv.org/abs/2502.09940)

**Anthropic Claude**
- Official vision docs: images supplied as `image` content blocks (JPEG, PNG, GIF, WebP); no audio content type documented — [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- Contradiction: content-farm pages claim Claude API accepts audio ([tkmxai.it.com](https://tkmxai.it.com/claude-api-in-2026-2)); not supported by official docs and an open feature request for audio exists — [claudeissues.com](https://claudeissues.com/issue/73566-feature-allow-claude-to-hear-and-process-audio). Treat as: Claude does not accept audio.

**Mistral Voxtral**
- Only Voxtral Small (25.07) is documented for audio understanding/instruct use; other Voxtral models are transcription/TTS; docs make no mention of music or non-speech audio — [Mistral audio docs](https://docs.mistral.ai/capabilities/audio/)
- Free "Experiment" plan: phone verification, no card; ~1 req/s, 500k TPM, 1B tokens/month per model; requests may be used for training (secondary sources; Mistral's help article URL returned 404 at access time) — [mintlify free-llm-api-resources](https://mintlify.com/cheahjs/free-llm-api-resources/providers/free/mistral-plateforme); [TechCrunch 2024](https://techcrunch.com/2024/09/17/mistral-launches-a-free-tier-for-developers-to-test-its-ai-models)
- Voxtral Small 24B 2507 paid price listed at $0.10 in / $0.30 out per 1M tokens (aggregator) — [pricepertoken.com](https://pricepertoken.com/endpoints/mistral/free)

**Alibaba Model Studio (Qwen-Omni)**
- New accounts: 1M input + 1M output tokens free, valid 90 days from activation, International (Singapore) region only; US (Virginia) and Mainland China have no free quota; old free OAuth tier discontinued Apr 15, 2026 — [Alibaba free quota doc](https://help.aliyun.com/en/model-studio/new-free-quota); [validity adjustment notice](https://help.aliyun.com/en/model-studio/new-free-quota-validity-adjustment). (Search summary disagreed on per-model vs pooled quota — verify.)

**Hugging Face Inference Providers**
- Free users $0.10/month credits; PRO $2.00/month; free users cannot pay-as-you-go after credits exhausted — [HF Inference Providers pricing](https://huggingface.co/docs/inference-providers/pricing)

**OpenRouter**
- Gemini 2.5 Flash / 3.5 Flash / flash-latest accept audio on OpenRouter but are paid (e.g. 3.5 Flash $1.50/M in); no free audio-input model found — [getmaxim OpenRouter 3.5 Flash](https://www.getmaxim.ai/bifrost/llm-cost-calculator/provider/openrouter/model/gemini-3.5-flash)

### Inferences
- For a no-pay TS extension, Gemini Flash (3.x) free tier is the only practical hosted path. A 30 s clip ≈ 960 audio tokens, so token limits are not the constraint; RPD is. Design for per-user API keys (BYOK), caching results, and graceful 429 handling.
- Free-tier data is used by Google for training — must be disclosed to users since the extension would upload audio snippets of copyrighted tracks.
- Spotify desktop client streams DRM-protected audio; obtaining raw audio inside Spicetify is a separate feasibility question (likely only 30 s preview URLs where available) — out of scope here but blocks every audio-based option.
- Alibaba's quota is one-time (90 days), so unsuitable as a sustained free source.

### Gaps
- Exact current free-tier RPM/RPD for Gemini 3.x Flash models: Google no longer publishes them; only AI Studio console shows them.
- Groq and Together: no search done on free audio-understanding (non-Whisper) models; Groq historically offers only Whisper for audio (transcription, not genre) — unverified for 2026.
- Whether Alibaba free quota covers Qwen3-Omni-Flash specifically: not confirmed from the doc page.
- Whether Mistral Experiment plan includes Voxtral Small: not confirmed.

## Open-weight music-understanding models: licences, size, local feasibility

### Takeaway
Best open-weight genre performers are Qwen3-Omni-30B-A3B (Apache 2.0, GTZAN 93.1 self-reported, but ~79 GB+ VRAM in BF16) and NVIDIA Music Flamingo (8B, GTZAN 84.45, non-commercial licence). Consumer-GPU/CPU paths exist only via llama.cpp's experimental audio support (Qwen2.5-Omni 3B/7B, Voxtral Mini 3B, Ultravox); Ollama does not support audio input for Gemma 3n. Older music LLMs (MU-LLaMA, MusiLingo, SALMONN, LTU) are weak on genre.

### Cited Findings
- **Qwen3-Omni-30B-A3B-Instruct**: Apache 2.0; ~35B params BF16 (MoE, 3B active); GPU memory 78.85 GB (15 s video) to 144.81 GB (120 s video) per model card; vLLM supported; community GGUF quantizations listed on HF. Separate Qwen3-Omni-30B-A3B-Captioner for "detailed, low-hallucination captions" of arbitrary audio — [HF model card](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct)
- **Music Flamingo** (NVIDIA, Nov 2025): 8B, Qwen2.5-7B base, built on Audio Flamingo 3; max audio 20 min (30 s windows); NVIDIA OneWay Noncommercial License (research only); Transformers support; tested on A100/H100 — [HF model card](https://huggingface.co/nvidia/music-flamingo-hf); [arXiv 2511.10289](https://arxiv.org/html/2511.10289v1)
- Music Flamingo paper notes limitation: "limited understanding of underrepresented or skewed cultural traditions" — [arXiv 2511.10289](https://arxiv.org/html/2511.10289v1)
- **llama.cpp** (libmtmd): audio input in `llama-mtmd-cli` and `llama-server`, "highly experimental and may have reduced quality"; supported audio models: Ultravox 0.5 (1B, 8B), Voxtral-Mini-3B-2507, Qwen2.5-Omni 3B/7B (e.g. `-hf ggml-org/Qwen2.5-Omni-3B-GGUF`) — [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- **Gemma 3n**: audio input, 6.25 tokens/s, max 30 s, 16 kHz mono; capabilities listed are ASR/speech translation/audio analysis — [Gemma audio docs](https://ai.google.dev/gemma/docs/capabilities/audio); Ollama supports Gemma 3n text-only — [Unsloth Gemma 3n guide](https://unsloth.ai/docs/models/tutorials/gemma-3-how-to-run-and-fine-tune/gemma-3n-how-to-run-and-fine-tune)
- **Voxtral**: docs focus on speech; no music mention — [Mistral audio docs](https://docs.mistral.ai/capabilities/audio/)
- **Step-Audio 2 / Kimi-Audio**: MMAU music 73.7 (Step-Audio 2) vs 64.4 (Kimi-Audio) — [Step-Audio 2 tech report](https://arxiv.org/pdf/2507.16632)
- Gemma 4 listed as "Free of charge" on Gemini API (hosted) — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) (audio capability of Gemma 4 not checked)

### Inferences
- None of the strong models is runnable inside a Spicetify extension itself; local options require the user to run a separate server (llama-server / vLLM) and the extension to call it over HTTP.
- Qwen2.5-Omni-3B/7B GGUF via llama-server is the most realistic "consumer GPU / CPU" LLM route, but expect genre quality well below Qwen3-Omni and Gemini.
- Music Flamingo's non-commercial licence is compatible with a free OSS hobby extension only if no commercial use; check licence text before recommending.

### Gaps
- Audio Flamingo 2/3, Qwen2-Audio, Qwen2.5-Omni, Kimi-Audio, Step-Audio, SALMONN, LLark licences and VRAM: not fetched this pass. (LLark weights were, to my knowledge, never fully released — unverified.)
- No measured VRAM for Qwen3-Omni audio-only inference (card lists video-input numbers) or for quantized GGUF.
- Ollama audio input support status for Qwen2.5-Omni: not confirmed.

## Benchmarks: how good are LLMs at genre, vs specialized classifiers?

### Takeaway
On closed-set GTZAN (10 coarse genres), recent large audio LLMs match or beat specialists (Qwen3-Omni 93.1, Music Flamingo 84.45 vs specialist ~84–88). On fine-grained multi-label genre (MTG-Jamendo, 87 genres) older open audio LLMs are near-random (ROC-AUC 52–66 vs supervised 88), and all models show Western/pop bias with weak world/traditional genres. Specialized classifiers (Essentia Discogs-EffNet / MAEST, 400 Discogs styles) remain the stronger subgenre option.

### Cited Findings
- **CMI-Bench** (ISMIR 2025, QMUL + Yamaha) Table 3, 11 open audio-text LLMs, natural-language prompts:
  - GTZAN accuracy: Qwen-Audio 73.79, Qwen2-Audio 62.41, Audio-Flamingo 50.34, GAMA-IT 45.52, SALMONN 30.34, MU-LLaMA 14.48, Pengi 14.14, GAMA 10.34, LTU-AS 9.31, MusiLingo 2.41, LTU 1.03; supervised SOTA 83.9
  - MTG-Genre ROC-AUC / PR-AUC: best Qwen-Audio 66.39 / Qwen2-Audio 9.23 PR; others 52–64 ROC; supervised SOTA 88.0 / 20.5
  - Conclusion: "significant performance gaps between LLMs and supervised models, along with their culture, chronological and gender bias"
  - MTG-Genre: strong on mainstream Western pop genres (80s, 90s); world-music genres (Bossanova, Celtic, Chanson, Ethno, Latin) and Medieval "consistently fall below average"
  - Prompting without the model's training task tokens "significantly degrades performance" (fragile instruction following)
  — [CMI-Bench arXiv 2506.12285](https://arxiv.org/pdf/2506.12285v1); [ISMIR 2025 poster](https://ismir2025program.ismir.net/poster_246.html)
- **Music Flamingo** Table 1: GTZAN 84.45 (prev best Pengi 80.00); MMAU-music 76.83 (AF3 73.95); MMAU-Pro-Music 65.60 (Gemini 2.5 Flash 64.90); MuChoMusic 74.58 (Qwen3-Omni 52.10); MMAR-music 48.66 (Qwen2.5-Omni 46.12) — [arXiv 2511.10289](https://arxiv.org/html/2511.10289v1)
- **Qwen3-Omni** self-reported: GTZAN 93.1 (vs CLaMP 3 87.9); MTG-Genre 39.5 F1 (vs MuQ-MuLan 35.8); MTG Mood/Theme 21.7; MagnaTagATune 46.8; RUL-MuChoMusic 52.1 — [HF model card](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct)
- **MMAU music**: Step-Audio 2 73.7, Kimi-Audio 64.4 — [Step-Audio 2 report](https://arxiv.org/pdf/2507.16632)
- Audio captioning benchmark: music is hardest category (genre, instrumentation, tempo, mood); Gemini 3 Pro leads music at 5.68/10 — [AudioCapBench arXiv 2602.23649](https://arxiv.org/pdf/2602.23649) (via search summary)
- Zero-shot LLM genre study: Audio Spectrogram Transformer (AST, supervised) 85.5% beat all LLMs evaluated; Gemini 1.5 Pro mislabelled classical as country in some cases — [catalyzex: Music genre classification using LLMs](https://catalyzex.com/paper/music-genre-classification-using-large) (via search summary; paper not read in full)
- GTZAN has known faults (repetitions, mislabelings, artist repetition) affecting evaluation — [Sturm, GTZAN faults](https://astro.paperswithcode.com/paper/13061461)
- **Specialists**: MAEST predicts 400 Discogs-derived styles, trained on Discogs20 (3.3M tracks), available in Essentia; MAEST weights CC BY-NC-SA 4.0 — [MAEST HF card](https://huggingface.co/mtg-upf/discogs-maest-30s-pw-73e-ts/blob/main/README.md); [Replicate MAEST](https://replicate.com/mtg/maest)

### Inferences
- GTZAN scores (10 genres, 30 s clips, possibly in training data) overstate real-world usefulness for obscure songs; MTG-Genre numbers are the better proxy for subgenre tagging and are poor for LLMs.
- For obscure tracks, an LLM listening to audio cannot rely on artist knowledge, so performance should look like the benchmark numbers, not like the "knows famous songs" impression from chat use. Conversely, if title/artist is sent, the model may hallucinate artist-based genres — send audio only or instruct it to ignore metadata.
- Constrain output to a fixed taxonomy (e.g. Discogs 400 styles or a short list) to reduce free-text drift; CMI-Bench shows strict string matching penalises synonyms.

### Gaps
- No Gemini 3.x or GPT-audio scores found on GTZAN / MTG-Jamendo genre specifically.
- MAEST / Discogs-EffNet exact GTZAN / MTG-Jamendo genre numbers not retrieved (papers not fetched).
- MARBLE benchmark genre results not retrieved.

## Published experiments of people tagging libraries with Gemini/GPT-4o

### Takeaway
Little rigorous public evidence found. Hits were product demos (sample.audio using Gemini for sound-library tagging) and tagging-API blog posts, not measured accuracy reports for Gemini/GPT-4o genre tagging of personal libraries.

### Cited Findings
- sample.audio (Gemini API Developer Competition entry) uses Gemini to suggest tags and interpret queries for sound/sample libraries — [Gemini competition: sample.audio](https://ai.google.dev/competition/projects/sampleaudio?hl=de)
- dev.to post on auto-tagging a music library with confidence scores; argues genre/mood tagging reliability varies vs measurable features like energy/danceability — [dev.to](https://dev.to/birrings/auto-tag-your-music-library-with-confidence-scores-17d)

### Inferences
- The user will need to run their own small evaluation (e.g. 50–100 tracks with known Discogs/MusicBrainz genres) before trusting Gemini output.

### Gaps
- No blog/forum report with measured Gemini or GPT-4o genre accuracy on a real music library was found in this pass (Reddit/HN not searched).

## Zero-shot audio-text models (CLAP, MuQ-MuLan) as a middle ground

### Takeaway
CLAP-style models give free, local, open zero-shot genre scoring against any label list (LAION CLAP music checkpoints ~73% zero-shot on GTZAN) — below LLMs/specialists on GTZAN but cheap, deterministic and runnable on CPU; MuQ-MuLan is cited by Qwen as the prior specialist best on MTG-Genre.

### Cited Findings
- LAION CLAP checkpoints `music_speech_audioset_epoch_15_esc_89.98.pt` and `music_speech_epoch_15_esc_89.25.pt`: 73% zero-shot GTZAN; `music_audioset_epoch_15_esc_90.14.pt`: 64% — [LAION CLAP repo (mirror)](https://awesome.ecosyste.ms/projects/github.com%2FLAION-AI%2FCLAP); HF `larger_clap_music` — [HF](https://huggingface.co/another-blue/larger_clap_music)
- MuQ-MuLan: MTG-Genre 35.8 F1, MTG Mood/Theme 10.9 (as reported in Qwen3-Omni comparison) — [Qwen3-Omni card](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct)

### Inferences
- CLAP could run in-browser (ONNX/transformers.js) inside an extension, avoiding API keys entirely; quality is moderate, best used for coarse genres.

### Gaps
- MuQ-MuLan licence and size not checked; CLAP transformers.js availability not verified.
