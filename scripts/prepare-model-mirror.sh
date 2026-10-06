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
license_base=${MIRROR_BASE_URL:-https://essentia.upf.edu/models/}

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
echo "Downloading MTG's models LICENSE" >&2
fetch "${license_base}LICENSE" "$out/LICENSE.mtg"

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

Unmodified mirror of the Discogs-EffNet music style model (`discogs-effnet-bsdynamic-1.onnx`)
and its Genre Discogs400 labels (`genre_discogs400-discogs-effnet-1.json`), created by the
Music Technology Group (MTG), Universitat Pompeu Fabra, and published with Essentia.
No changes were made to the files.

Used by the `spotify-genres` Spicetify extension to infer genres locally.

## Credit

- Model author: Pablo Alonso-Jiménez (MTG), with Xavier Serra and Dmitry Bogdanov.
- Copyright © Universitat Pompeu Fabra.
- Original files and documentation: https://essentia.upf.edu/models.html

## License

MTG's documentation licenses its models under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (non-commercial use only);
a proprietary license for commercial use is available from MTG on request
(https://www.upf.edu/web/mtg/contact). MTG's own `LICENSE` file, included here verbatim,
carries the CC BY-NC-ND 4.0 legal text; an unmodified, non-commercial mirror is permitted
under either. The files are provided as-is, without warranties of any kind
(see Section 5 of the license).

## Citation

The model (MTG's metadata for these files):

```bibtex
@inproceedings{alonso2022music,
  title={Music Representation Learning Based on Editorial Metadata from Discogs},
  author={Alonso-Jim{\'e}nez, Pablo and Serra, Xavier and Bogdanov, Dmitry},
  booktitle={Conference of the International Society for Music Information Retrieval (ISMIR)},
  year={2022}
}
```

Essentia's TensorFlow models, as MTG asks for research use:

```bibtex
@inproceedings{alonso2020tensorflow,
  title={Tensorflow Audio Models in {Essentia}},
  author={Alonso-Jim{\'e}nez, Pablo and Bogdanov, Dmitry and Pons, Jordi and Serra, Xavier},
  booktitle={International Conference on Acoustics, Speech and Signal Processing ({ICASSP})},
  year={2020}
}
```

## Sources

- https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bsdynamic-1.onnx
- https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json
- https://essentia.upf.edu/models/LICENSE
- https://essentia.upf.edu/models.html
CARD

{
  cat <<'HEADER'
Discogs-EffNet model and Genre Discogs400 labels — unmodified mirror.
Copyright (c) Universitat Pompeu Fabra. The text below is MTG's models LICENSE,
copied verbatim from https://essentia.upf.edu/models/LICENSE.

------------------------------------------------------------------------

HEADER
  cat "$out/LICENSE.mtg"
} > "$out/LICENSE"
rm -f "$out/LICENSE.mtg"

sha256sum "$out/$model" | cut -d' ' -f1
