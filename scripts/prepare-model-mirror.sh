#!/usr/bin/env bash
# Build the Hugging Face mirror folder for MTG Discogs-EffNet (unmodified).
# Usage: prepare-model-mirror.sh <out-dir>
# MIRROR_BASE_URL overrides the download base for both files (tests).
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <out-dir>" >&2
  exit 2
fi

out=$1
model=discogs-effnet-bsdynamic-1.onnx
labels=genre_discogs400-discogs-effnet-1.json
model_size=18027718
model_base=${MIRROR_BASE_URL:-https://essentia.upf.edu/models/feature-extractors/discogs-effnet/}
labels_base=${MIRROR_BASE_URL:-https://essentia.upf.edu/models/classification-heads/genre_discogs400/}

mkdir -p "$out"

fetch() {
  curl --fail --silent --show-error --location \
    --retry 5 --retry-delay 10 --retry-all-errors --max-time 600 \
    -o "$2" "$1"
}

echo "Downloading $model" >&2
fetch "${model_base}${model}" "$out/$model"
echo "Downloading $labels" >&2
fetch "${labels_base}${labels}" "$out/$labels"

size=$(stat -c %s "$out/$model")
if [ "$size" -ne "$model_size" ]; then
  echo "error: $model is $size bytes, expected $model_size" >&2
  exit 1
fi

cat > "$out/README.md" <<'CARD'
---
license: cc-by-nc-sa-4.0
library_name: onnx
tags:
  - audio-classification
  - music
---

# Discogs-EffNet (ONNX) — unmodified mirror

Unmodified mirror of the MTG Discogs-EffNet model (`discogs-effnet-bsdynamic-1.onnx`)
and the Genre Discogs400 labels (`genre_discogs400-discogs-effnet-1.json`), published by
the Music Technology Group (MTG), Universitat Pompeu Fabra, as part of Essentia.

Used by the `spotify-genres` Spicetify extension to infer genres locally.

## Credit

Model and labels by the Music Technology Group (MTG), Universitat Pompeu Fabra.
Released under CC BY-NC-SA 4.0. No changes were made to the files.

## Citation

Alonso-Jiménez, P., Serra, X., & Bogdanov, D. (2023). Efficient supervised training of
audio transformers for music representation learning. In Proceedings of the 24th
International Society for Music Information Retrieval Conference (ISMIR 2023).

## Sources

- https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bsdynamic-1.onnx
- https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json
- https://essentia.upf.edu/models.html
CARD

cat > "$out/LICENSE" <<'LICENSE'
Discogs-EffNet model and Genre Discogs400 labels
Copyright (c) Music Technology Group, Universitat Pompeu Fabra

These files are licensed under the Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0).

Full legal code: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
LICENSE

sha256sum "$out/$model" | cut -d' ' -f1
