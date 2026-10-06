# Open-source audio-based music genre classifiers (state as of 2026-10-06)

Context: Spicetify extension, TypeScript, MIT licence, free/no-paid, audio analysis as fallback when MusicBrainz has no tags. Repo metadata (stars, last push, SPDX licence) was pulled live from the GitHub API on 2026-10-06; Hugging Face licence tags / download counts from the HF API the same day. Essentia model metadata pulled from the JSON files on essentia.upf.edu.

## Q1. Essentia + MTG models (Discogs-EffNet, MAEST, genre_discogs400/519, musicnn, MTG-Jamendo genre, essentia.js): what they offer and exact licences — do they block use in an MIT Spicetify extension?

### Takeaway
MTG's models are the only open, fine-grained (400/519 Discogs styles) audio genre classifiers, and Discogs-EffNet is small (18 MB ONNX), but weights are **CC BY-NC-SA 4.0** (not NC-ND) and the code (essentia, essentia.js, MAEST) is **AGPL-3.0**. A free, non-commercial MIT extension can legally use the weights if it does not claim them as MIT. The NC-SA terms stay with the weights, and bundling essentia.js makes the shipped bundle AGPL-bound. Running the ONNX weights through onnxruntime-web (MIT) avoids the AGPL code, but you then have to write the mel-spectrogram front-end yourself.

### Cited Findings
**Licences (verified from primary files)**
- MTG/essentia-models `LICENSE`: "This licensing file applies to all model files (*.pb file extension)… distributed under the following license: Creative Commons Attribution-NonCommercial-ShareAlike 4.0… For a commercial use, the models are also available under proprietary license upon request." VGGish-derived models are noted as derived from Apache-2.0 work. — [MTG/essentia-models LICENSE](https://github.com/MTG/essentia-models/blob/master/LICENSE)
- Essentia models page: "All models created by MTG are licensed under CC BY-NC-SA 4.0 and available under proprietary license upon request." — [essentia.upf.edu/models.html](https://essentia.upf.edu/models.html)
- MAEST HF weights tagged `license:cc-by-nc-sa-4.0` (e.g. `mtg-upf/discogs-maest-30s-pw-73e-ts`). `mtg-upf/discogs-maest-30s-pw-129e-519l` carries **no licence tag** on HF (gap in model card), but the same weights on essentia.upf.edu fall under the CC BY-NC-SA LICENSE above. — [HF discogs-maest-30s-pw-73e-ts](https://huggingface.co/mtg-upf/discogs-maest-30s-pw-73e-ts/blob/main/README.md); [HF 519l card](https://huggingface.co/mtg-upf/discogs-maest-30s-pw-129e-519l)
- Code licences (GitHub API SPDX): MTG/essentia = AGPL-3.0; MTG/essentia.js = AGPL-3.0 (npm `essentia.js` licence field also AGPL-3.0); palonso/MAEST = AGPL-3.0; jordipons/musicnn = ISC. — [MTG/essentia](https://github.com/MTG/essentia); [MTG/essentia.js](https://github.com/MTG/essentia.js); [npm essentia.js](https://www.npmjs.com/package/essentia.js); [palonso/MAEST](https://github.com/palonso/MAEST); [jordipons/musicnn](https://github.com/jordipons/musicnn)
- Note: the `.pb` LICENSE wording covers "*.pb" files. The same models' `.onnx` exports sit in the same directories, and models.html applies CC BY-NC-SA to "all models created by MTG". — [essentia.upf.edu/models.html](https://essentia.upf.edu/models.html)

**Models and taxonomy**
- Discogs-EffNet (`discogs-effnet-bs64-1`): "Prediction of the top-400 music styles in the Discogs-4M dataset (unreleased)". Trained on 4M full tracks (3.3M used). Reported **ROC-AUC 0.954, PR-AUC 0.206** (400 styles). 16 kHz input. Released 2022-02-17. Formats: frozen .pb, SavedModel, **ONNX (`discogs-effnet-bsdynamic-1.onnx`, 18,027,718 bytes ≈ 18 MB)**. — [discogs-effnet-bs64-1.json](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json); [directory listing](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/)
- `genre_discogs400-discogs-effnet-1`: classification head, input 1280-d embedding, 400 sigmoid outputs (multi-label), released 2023-05-04, same metrics. The .pb is 2,057,977 bytes (≈2 MB). Heads also exist for MAEST embeddings (5s/10s/20s/30s; pw/fs/dw/ts variants, .pb + .onnx). — [genre_discogs400 json](https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json); [dir listing](https://essentia.upf.edu/models/classification-heads/genre_discogs400/)
- `genre_discogs519`: 519 Discogs styles, only on MAEST 30s-pw-519l, .pb + .onnx. — [dir listing](https://essentia.upf.edu/models/classification-heads/genre_discogs519/); [models.html](https://essentia.upf.edu/models.html)
- MTG-Jamendo genre head: **87 classes** (e.g. acidjazz, alternative, alternativerock, ambient…), on Discogs-EffNet and the artist/label/multi/release/track contrastive embeddings. — [models.html](https://essentia.upf.edu/models.html)
- MAEST: ~87M parameters (86.9M on HF card), trained on 3.3M Discogs tracks / 400 styles, inputs 5–30 s. Usable through the HF `transformers` `audio-classification` pipeline. MAEST-30s ONNX (`discogs-maest-30s-pw-519l-2.onnx`) is **348,052,337 bytes ≈ 348 MB**. — [MAEST arXiv 2309.16418](https://ar5iv.labs.arxiv.org/html/2309.16418); [HF 519l card](https://huggingface.co/mtg-upf/discogs-maest-30s-pw-129e-519l); HTTP HEAD on essentia.upf.edu/models/feature-extractors/maest/
- musicnn (MSD): Essentia hosts `msd-musicnn-1.pb`, `.onnx` and **`msd-musicnn-1-tfjs.zip`** (TF.js). That is the only TF.js file visible in the feature-extractor directory listings checked (discogs-effnet dir has no tfjs file). — [musicnn dir](https://essentia.upf.edu/models/feature-extractors/musicnn/); [discogs-effnet dir](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/)
- Models page states "Some models are also available in TensorFlow.js format (tfjs.zip)". Discogs-EffNet ONNX supports dynamic batch. TF version is fixed batch 64. MAEST TF is batch 1, MAEST ONNX dynamic. — [models.html](https://essentia.upf.edu/models.html)
- essentia.js has a "Publish discogs realtime autotag" demo (commit message, 2022-07-19), so Discogs-style tagging in the browser has been demonstrated by MTG. — [MTG/essentia.js commits](https://github.com/MTG/essentia.js/commits)

### Inferences
- **Does CC BY-NC-SA block a free MIT Spicetify extension?** Not by itself. A free, non-monetized extension is plausibly "non-commercial", so using the weights is allowed with attribution. However: (a) the weights cannot be relicensed as MIT, so they must ship (or be downloaded at runtime) under their own CC BY-NC-SA notice. (b) Anyone who forks the extension into a paid or ad-supported product loses the right to use them. (c) Fine-tuning or modifying the weights produces an adaptation that must also be CC BY-NC-SA ("SA"). (d) Donations or sponsorship might blur "non-commercial". Downloading weights at runtime from essentia.upf.edu (rather than vendoring them in the repo) keeps the MIT repo clean. This is a reading of the licence text, not legal advice.
- **AGPL-3.0 of essentia.js**: an MIT project may depend on AGPL code, but the distributed combined work (the extension bundle) must then be offered under AGPL terms (source available, which an OSS project already does). The practical effect is that the extension bundle is effectively AGPL. The cleaner path is to load the ONNX weights with onnxruntime-web (MIT, [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime)) and reimplement the 16 kHz mel front-end in TS. Discogs-EffNet's mel parameters would need to match Essentia's `TensorflowInputMusiCNN` front-end exactly (gap: not verified here).
- Discogs-EffNet + genre_discogs400 (≈18 MB + 2 MB) is the best size-to-granularity trade-off of anything found. MAEST is ~17x heavier for modest gains (see Q3).

### Gaps
- The `msd-musicnn-1-tfjs.zip` size could not be measured (HEAD gave no Content-Length and GET returned 0 bytes from this environment).
- No ONNX file was found for the genre_discogs400 **EffNet** head in the partial directory listing (MAEST heads have .onnx). Converting the 2 MB .pb head to ONNX/TF.js is trivial but unverified.
- No official MTG statement on whether a free browser extension counts as "non-commercial".

## Q2. Other models (PANNs, YAMNet, CLAP family, MERT, MusicFM, Jukebox, AST/GTZAN fine-tunes, BEATs, OpenL3, MuQ, Music2Latent, 2024-26 models): licences of code and weights

### Takeaway
The permissive (commercial-OK) options are AST (BSD-3), LAION-CLAP (code CC0 / weights Apache-2.0), PANNs (code MIT / weights CC BY 4.0), YAMNet (Apache-2.0), OpenL3 (MIT), MusicFM (MIT on HF) and MS-CLAP (code MIT / weights MS-PL). None of these offers fine-grained style taxonomies. AudioSet only has about 52 usable genre nodes, and CLAP is zero-shot. The strongest music foundation models (MERT v1/v2, MuQ, Jukebox, Music2Latent) are **non-commercial** (CC BY-NC 4.0 or OpenAI Noncommercial).

### Cited Findings
| Model | Code licence | Weights licence | Genre capability | Source |
|---|---|---|---|---|
| PANNs (audioset_tagging_cnn) | MIT | **CC BY 4.0** (Zenodo record 3987831, 2019-12-15) | AudioSet 527 classes incl. genre branch | [GitHub](https://github.com/qiuqiangkong/audioset_tagging_cnn); [Zenodo](https://zenodo.org/records/3987831) |
| YAMNet / VGGish | Apache-2.0 (tensorflow/models LICENSE) | Apache-2.0 (same repo) | AudioSet 521 classes | [tensorflow/models LICENSE](https://github.com/tensorflow/models/blob/master/LICENSE); [Essentia lists YAMNet 520 classes](https://essentia.upf.edu/models.html) |
| AST (MIT/ast-finetuned-audioset-10-10-0.4593) | BSD-3-Clause (YuanGongND/ast) | **BSD-3-Clause** (HF tag) | AudioSet 527 (mAP 0.459 in name) | [YuanGongND/ast](https://github.com/YuanGongND/ast); [HF](https://huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593) |
| LAION-CLAP | **CC0-1.0** | **Apache-2.0** (laion/clap-htsat-unfused, larger_clap_music, larger_clap_music_and_speech) | zero-shot, arbitrary text labels | [LAION-AI/CLAP](https://github.com/LAION-AI/CLAP); [HF laion/larger_clap_music](https://huggingface.co/laion/larger_clap_music) |
| MS-CLAP (2022/2023) | MIT (repo **archived**) | **MS-PL** (HF microsoft/msclap tag) | zero-shot | [microsoft/CLAP](https://github.com/microsoft/CLAP); [HF microsoft/msclap](https://huggingface.co/microsoft/msclap) |
| MERT-v1 95M / 330M | Apache-2.0 (yizhilll/MERT) | **CC BY-NC 4.0** | embeddings, need probe | [yizhilll/MERT](https://github.com/yizhilll/MERT); [HF MERT-v1-330M](https://huggingface.co/m-a-p/MERT-v1-330M) |
| **MERT-v2-30s / v2-FullSong** (new, HF created 2026-09-09, arXiv 2609.33757) | — | **CC BY-NC 4.0** | embeddings, 632M params | [HF MERT-v2-30s](https://huggingface.co/m-a-p/MERT-v2-30s); [HF MERT-v2-FullSong](https://huggingface.co/m-a-p/MERT-v2-FullSong) |
| MusicFM (ByteDance) | MIT (+ one Apache-2.0 file) per LICENSE | **MIT** (HF minzwon/MusicFM tag) | embeddings, 330M | [minzwon/musicfm LICENSE](https://github.com/minzwon/musicfm/blob/main/LICENSE); [HF minzwon/MusicFM](https://huggingface.co/minzwon/MusicFM) |
| MuQ / MuQ-MuLan (Tencent) | MIT | **CC BY-NC 4.0** (README: "model weights (MuQ-large-msd-iter, MuQ-MuLan-large)… CC-BY-NC 4.0") | embeddings (MuQ), zero-shot text-audio (MuQ-MuLan) | [tencent-ailab/MuQ](https://github.com/tencent-ailab/MuQ); [HF OpenMuQ/MuQ-MuLan-large](https://huggingface.co/OpenMuQ/MuQ-MuLan-large) |
| Jukebox (JukeMIR probes) | jukebox: **"Noncommercial Use License"** (repo archived); jukemir: MIT | Noncommercial (OpenAI) | embeddings, 5B-param model | [openai/jukebox LICENSE](https://github.com/openai/jukebox/blob/master/LICENSE); [p-lambda/jukemir](https://github.com/p-lambda/jukemir) |
| BEATs | MIT (microsoft/unilm) | checkpoints on OneDrive links in README. No separate weights licence found | AudioSet | [unilm/beats README](https://github.com/microsoft/unilm/tree/master/beats) |
| OpenL3 | MIT | shipped with pip package (MIT repo) | embeddings only | [marl/openl3](https://github.com/marl/openl3) |
| Music2Latent (Sony CSL) | **CC BY-NC 4.0** (LICENSE file) | same | audio autoencoder latents, not a classifier | [SonyCSLParis/music2latent LICENSE](https://github.com/SonyCSLParis/music2latent/blob/master/LICENSE) |
| GTZAN fine-tunes on HF | — | e.g. `dima806/music_genres_classification` Apache-2.0 (40 likes), `sanchit-gandhi/distilhubert-finetuned-gtzan` Apache-2.0, `dzur658/MERT-v1-330M-finetuned-gtzan` | 10 GTZAN genres only | [HF dima806](https://huggingface.co/dima806/music_genres_classification); [HF search gtzan](https://huggingface.co/models?search=gtzan) |

- AudioSet ontology "Music genre" node: 25 direct children (Pop, Hip hop, Rock, R&B, Soul, Reggae, Country, Funk, Folk, Middle Eastern, Jazz, Disco, Classical, Electronic, Latin America, Blues, Children's, New-age, Vocal, Africa, Christian, Asia, Ska, Traditional, Independent), 65 descendants total, of which 13 are restricted (abstract/blacklist) → ~52 usable genre labels. — [audioset/ontology ontology.json](https://github.com/audioset/ontology)
- Licences above are from GitHub SPDX/LICENSE files and HF licence tags fetched 2026-10-06. MusicFM and Music2Latent GitHub SPDX shows NOASSERTION, so the LICENSE text was read directly.

### Inferences
- For an MIT project that wants to stay fully permissive, the candidate set is AST/PANNs/YAMNet (coarse AudioSet genres, ~52 labels) or LAION-CLAP (zero-shot over any label list, e.g. the user's own MusicBrainz genre vocabulary). MusicFM is permissive but only gives embeddings. You would need to train a genre probe on licensed data, and there is no JS port.
- GTZAN fine-tunes are permissively licensed, but their 10-genre taxonomy (blues, classical, country, disco, hiphop, jazz, metal, pop, reggae, rock) is too coarse to be useful for "obscure songs" and inherits GTZAN's flaws (Q3).

### Gaps
- BEATs: no explicit licence statement for the OneDrive checkpoints was found in the README excerpt. Assume repo MIT applies, but this is unverified.
- MERT-v2 code licence and training data not stated on the HF card excerpt.
- No newer (2025-26) open model was found that ships a ready-made fine-grained genre head under a permissive licence. "PupuJEPA" and "A-JEPA" appear in the MERT-v2 comparison table, but their licences were not checked.

## Q3. Reported accuracy on benchmarks, GTZAN's flaws, and the realistic ceiling for fine-grained genre

### Takeaway
Coarse 10-genre GTZAN accuracy of open models ranges from ~47–73% (zero-shot CLAP) to ~78–92% (linear probes on MERT/MusicFM/MuQ/MERT-v2). GTZAN's faults cap a "perfect" system at ~94.5%. On fine-grained multi-label taxonomies, precision collapses: Discogs-400 PR-AUC 0.21, MTG-Jamendo-87 genre mAP 0.22, even though ROC-AUC looks high (0.88–0.95).

### Cited Findings
**GTZAN (10 genres, 1000 × 30 s)**
- MARBLE / MERT-v2 table (probe accuracy): MERT-v2-30s 91.72%, MERT-v2-FullSong 90.69%, PupuJEPA-Large 86.9%, PupuJEPA-Huge 85.9%, MusicFM 84.1%, MuQ 83.8%, A-JEPA 83.8%. — [HF MERT-v2-30s card](https://huggingface.co/m-a-p/MERT-v2-30s)
- MARBLE: MERT-Large (330M) 77.6%, MuQ 83.8%, MusicFM 84.1% GTZAN genre accuracy. — [MARBLE arXiv 2306.10548](https://arxiv.org/pdf/2306.10548) (via search snippet; leaderboard site [marble-bm.sheffield.ac.uk](https://marble-bm.sheffield.ac.uk/leaderboard) refused connection)
- Zero-shot LAION-CLAP (prompt "This audio is a <genre> song."): `music_audioset_epoch_15_esc_90.14.pt` **71%**, `music_speech_epoch_15_esc_89.25.pt` 69%, `music_speech_audioset_epoch_15_esc_89.98.pt` 51%. — [LAION-AI/CLAP README](https://github.com/LAION-AI/CLAP)
- Zero-shot GTZAN: MS-CLAP 2023 58.4%, LAION-CLAP 47.24% (different checkpoint/prompt). M2D-CLAP claims a new SOTA for zero-shot GTZAN. — [M2D-CLAP arXiv 2406.02032](https://arxiv.org/pdf/2406.02032)

**Fine-grained / multi-label**
- Discogs-EffNet / genre_discogs400 (400 styles): ROC-AUC 0.954, **PR-AUC 0.206**. — [discogs-effnet json](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json)
- MAEST on Discogs20 training task, mAP: 5s 21.1, 10s 22.8, 20s 24.8, 30s 26.1. — [MAEST arXiv 2309.16418](https://ar5iv.labs.arxiv.org/html/2309.16418)
- MAEST-30s downstream MTG-Jamendo **genre (87 classes): ROC-AUC 88.2, mAP 21.6**. Moods 78.1/15.4, instruments 80.0/22.9, top-50 84.0/31.5. MagnaTagATune 92.0/41.9 (EffNet-B0 baseline 37.4 mAP). MSD artist-filtered 89.8/35.4. MAEST-30s has 2–3x the throughput of EffNet-B0 with patchout. — [MAEST arXiv](https://ar5iv.labs.arxiv.org/html/2309.16418)

**GTZAN flaws (Sturm 2013)**
- 50 exact repetitions, 21 recording repetitions, 13 version repetitions, **93 mislabelings** (59 tabulated), plus distortions. Artist repetition is heavy. — [Sturm, arXiv 1306.1461](https://arxiv.org/abs/1306.1461)
- Estimated "perfect" classifier accuracy on GTZAN ≈ **94.5%**, given the faults. Most published results are without artist filtering and thus inflated. — [Sturm, arXiv 1306.1461](https://arxiv.org/abs/1306.1461)

**Human ceiling**
- Perrot & Gjerdingen (1999): 52 students, 10 genres, ~70% agreement with CD-vendor labels. This figure is widely cited, but the study was never published and its data are unavailable. — [Frontiers in Psychology 2017](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01337/pdf) (as summarised by search result)
- Limited human agreement is argued to impose an "unavoidable ceiling" on automatic genre classification. Pop is cited as having the most disagreement. — [Frontiers in Psychology 2017](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01337/pdf) (search summary; not read in full)

### Inferences
- ROC-AUC 0.95 vs PR-AUC 0.21 on 400 styles means the models rank the right styles high, but the top-1 style for any single track is often wrong or ambiguous. A UI should show the top-k styles with scores, or roll styles up to their Discogs parent genre (15 top-level genres). Do not assert a single niche style.
- GTZAN numbers (80–92%) say little about real-world obscure tracks. GTZAN is 10 coarse genres from ~2000–2001, with leakage, so real-world accuracy on obscure tracks will be lower.

### Gaps
- No published top-1 accuracy for genre_discogs400 at the parent-genre (e.g. 15 Discogs genres) level was found.
- MARBLE leaderboard site was unreachable (ECONNREFUSED). MTG-Jamendo genre numbers for MERT/MuQ/MusicFM are not collected here.
- No rigorous modern inter-annotator study for fine-grained styles was read in full.

## Q4. Client-side JS feasibility (ONNX Runtime Web, TF.js, essentia.js, transformers.js): model size and inference cost

### Takeaway
Browser-ready today: AST (transformers.js ONNX, 51–347 MB), CLAP audio encoders (transformers.js, 34–282 MB), Discogs-EffNet (ONNX 18 MB, via onnxruntime-web) and musicnn (TF.js zip), plus GTZAN HuBERT ONNX. MAEST (348 MB ONNX) is feasible but heavy. MERT, MuQ, MusicFM and Jukebox have no JS ports and are Python/PyTorch only.

### Cited Findings
- Xenova/ast-finetuned-audioset-10-10-0.4593 (transformers.js) ONNX sizes: fp32 346.8 MB, fp16 173.7 MB, quantized/uint8 ~90 MB, q4 60.0 MB, q4f16 51.4 MB, bnb4 54.7 MB. — [HF Xenova AST](https://huggingface.co/Xenova/ast-finetuned-audioset-10-10-0.4593) (HF API tree listing)
- Xenova/clap-htsat-unfused: audio_model 117.5 MB (fp32) / 60.4 MB (fp16) / **34.3 MB (quantized)**. text_model 501.5 / 251.0 / 126.6 MB. The text side can be run once offline to precompute label embeddings. — [HF Xenova/clap-htsat-unfused](https://huggingface.co/Xenova/clap-htsat-unfused)
- Xenova/larger_clap_music_and_speech (and larger_clap_general): audio_model 281.7 / 143.4 / **78.2 MB (quantized)**. — [HF Xenova/larger_clap_music_and_speech](https://huggingface.co/Xenova/larger_clap_music_and_speech)
- Transformers.js audio-classification models on HF include `onnx-community/Musical-genres-Classification-Hubert-V1-ONNX` (71 downloads) and the ONNX AST ports. — [HF transformers.js audio-classification filter](https://huggingface.co/models?library=transformers.js&pipeline_tag=audio-classification&sort=downloads)
- Discogs-EffNet ONNX ≈ 18.0 MB with dynamic batch. genre_discogs400 head .pb ≈ 2.1 MB. MAEST-30s-519l ONNX ≈ 348 MB. — [essentia.upf.edu models dirs](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/)
- musicnn TF.js export exists (`msd-musicnn-1-tfjs.zip`). — [musicnn dir](https://essentia.upf.edu/models/feature-extractors/musicnn/)
- PANNs checkpoints are PyTorch `.pth`: Cnn14 327.4 MB, Cnn6 23.7 MB, ResNet22 259.1 MB. No official ONNX/JS export. — [Zenodo 3987831](https://zenodo.org/records/3987831)
- Runtimes: huggingface/transformers.js (Apache-2.0, 16.3k stars, pushed 2026-10-06), microsoft/onnxruntime (MIT, 22.0k stars, pushed 2026-10-06), tensorflow/tfjs (Apache-2.0, 19.1k stars, last push 2026-06-23). — GitHub API: [transformers.js](https://github.com/huggingface/transformers.js), [onnxruntime](https://github.com/microsoft/onnxruntime), [tfjs](https://github.com/tensorflow/tfjs)

### Inferences
- Spicetify runs inside Spotify's Chromium (CEF), so WASM and probably WebGPU are available. A 20 MB EffNet + head is the lightest fine-grained option. CLAP-quantized audio encoder (34 MB) + precomputed text embeddings is the lightest permissive option with a custom taxonomy.
- Discogs-EffNet takes 16 kHz audio and processes ~3 s patches (the EffNet bs64 variant is batch 64). A 30 s clip is ~10–15 patches, a small CNN workload on WASM. This is an estimate only; see Gaps.

### Gaps
- **No measured browser inference times** (ms per 30 s clip) were found for any of these models in onnxruntime-web, TF.js or transformers.js. This needs a local benchmark.
- Not covered: whether a Spicetify extension can get the raw decoded PCM audio of a playing track at all (Spotify DRM / Widevine). This is a hard prerequisite outside this note's scope.

## Q5. Maintenance status (last push / release, stars) as of 2026-10-06

### Takeaway
Essentia core, transformers.js and onnxruntime are active. essentia.js is effectively stale (npm 0.1.3 from June 2021, last substantive commit June 2024). PANNs, AST, OpenL3, musicnn and MusicFM are frozen research code, and microsoft/CLAP and openai/jukebox are archived.

### Cited Findings (GitHub API, pushed_at = last push to any branch)
| Repo | Stars | Last push | Notes |
|---|---|---|---|
| MTG/essentia | 3,759 | 2026-10-02 | Active. PyPI essentia-tensorflow 2.1b6.dev1438 uploaded 2026-05-19. Last GitHub "release" v2.1_beta5 dated 2019. |
| MTG/essentia.js | 868 | 2025-12-10 (dependabot branches) | npm latest 0.1.3 (2021-06-24). master last commit 2022-07-19. dev branch last commit 2024-06-12 → **stale** |
| MTG/essentia-models | 5 | 2025-09-15 | Model hosting repo |
| palonso/MAEST | 71 | 2025-06-27 | AGPL-3.0 |
| jordipons/musicnn | 724 | 2023-12-11 | ISC, frozen |
| qiuqiangkong/audioset_tagging_cnn (PANNs) | 1,785 | 2024-07-25 | frozen |
| YuanGongND/ast | 1,482 | 2023-05-21 | frozen (HF ports maintained) |
| LAION-AI/CLAP | 2,299 | 2025-05-15 | low activity |
| microsoft/CLAP | 678 | 2024-09-18 | **archived** |
| yizhilll/MERT | 516 | 2025-05-25 | MERT-v2 weights on HF 2026-09 |
| minzwon/musicfm | 275 | 2024-02-14 | frozen |
| tencent-ailab/MuQ | 385 | 2025-08-04 | |
| SonyCSLParis/music2latent | 269 | 2025-09-19 | |
| marl/openl3 | 605 | 2023-06-17 | frozen |
| openai/jukebox | 8,031 | 2024-06-19 | **archived** |
| p-lambda/jukemir | 186 | 2023-10-12 | frozen |
| a43992899/MARBLE | 191 | 2026-08-29 | benchmark active |
| microsoft/unilm (BEATs) | 22,227 | 2026-09-21 | monorepo |

Sources: GitHub REST API `repos/{owner}/{repo}` and `/commits`, `/releases`, queried 2026-10-06 — e.g. [MTG/essentia.js](https://github.com/MTG/essentia.js), [npm essentia.js](https://www.npmjs.com/package/essentia.js), [PyPI essentia-tensorflow](https://pypi.org/project/essentia-tensorflow/).

- HF downloads (last month, 2026-10-06): MIT/ast-finetuned-audioset 1.07M, laion/clap-htsat-unfused 1.29M, MERT-v1-95M 281k, MuQ-large-msd-iter 281k, larger_clap_music 71k, Xenova AST 22.8k, mtg-upf MAEST 519l 3.1k. — HF API (e.g. [HF MIT/ast](https://huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593))

### Inferences
- If using essentia.js, expect to vendor/patch it yourself. Using onnxruntime-web with MTG ONNX weights depends only on actively maintained runtimes.

### Gaps
- essentia.upf.edu model files have no version feed. The MAEST v2 ONNX Last-Modified is 2025-01-28 (HTTP header), so the model set looks static since then.

## Q6. Is "free resources are not really competent" true for open-source audio genre classifiers?

### Takeaway
Partly refuted for coarse genres, partly confirmed for niche styles. Free models reach 80–92% on 10-genre GTZAN (probe) and 71% zero-shot, close to GTZAN's ~94.5% ceiling. On 400 Discogs styles, though, average precision is ~0.21 and on 87 Jamendo genres mAP is ~0.22, so fine-grained labels from audio alone are unreliable for any single track. Commercial APIs face the same ambiguity ceiling.

### Cited Findings
- 10-genre GTZAN: MERT-v2 91.7%, MusicFM 84.1%, MuQ 83.8%, MERT-v1-330M 77.6% (probes). — [HF MERT-v2-30s](https://huggingface.co/m-a-p/MERT-v2-30s); [MARBLE](https://arxiv.org/pdf/2306.10548)
- Zero-shot (no training): LAION-CLAP best music checkpoint 71%. MS-CLAP 2023 58.4%. — [LAION-AI/CLAP](https://github.com/LAION-AI/CLAP); [M2D-CLAP](https://arxiv.org/pdf/2406.02032)
- GTZAN ceiling ~94.5% because of faults. — [Sturm](https://arxiv.org/abs/1306.1461)
- Fine-grained: Discogs-400 PR-AUC 0.206 / ROC-AUC 0.954. MAEST-30s Jamendo-genre mAP 21.6 / ROC-AUC 88.2. — [essentia json](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json); [MAEST](https://ar5iv.labs.arxiv.org/html/2309.16418)

### Inferences
- "Not competent" is wrong as a blanket claim. Open models are research state-of-the-art and roughly match the commercial approach (supervised CNN/transformer on large tagged catalogues). The real limits are (1) the task ceiling for fine-grained styles, (2) the licences (best fine-grained = NC-SA, best embeddings = NC), and (3) audio access in Spotify, not model quality.
- Practical design: show top-3 Discogs styles with confidence, or map to parent genres, with a confidence threshold. Use CLAP zero-shot as a permissive fallback over the extension's own genre vocabulary.

### Gaps
- No head-to-head comparison of open models against commercial genre APIs on the same obscure-track test set was found.
