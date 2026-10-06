"""Generate the mel front-end parity fixture for module/mel.ts (spec AC22, AC23).

Run:
  uv run --python 3.11 --with essentia-tensorflow --with numpy \
    python scripts/essentia-reference.py test/fixtures

Writes into the output folder:
  mel-signal.f32      3 s synthetic 16 kHz mono signal, little-endian float32
  mel-reference.f32   Essentia TensorflowInputMusiCNN bands, [frames, 96], little-endian float32
  mel-reference.json  {"frames", "patches", "frames_30s", "patches_30s"}

Framing follows Essentia's TensorflowPredictEffnetDiscogs, which configures its
FrameCutter with only frameSize and hopSize and keeps every other FrameCutter
default (startFromZero=false: the first frame is centred on sample 0,
validFrameThresholdRatio=0):
  src/algorithms/machinelearning/tensorflowpredicteffnetdiscogs.cpp:104
    _frameCutter->configure("frameSize", _frameSize, "hopSize", _hopSize);
Patches: patchSize 128, patchHopSize 62, lastPatchMode "discard"
  (tensorflowpredicteffnetdiscogs.h, declareParameters).
"""

import json
import sys
from pathlib import Path

import numpy as np
import essentia.standard as es

SAMPLE_RATE = 16000
FRAME_SIZE = 512
HOP_SIZE = 256
PATCH_SIZE = 128
PATCH_HOP = 62


def synthetic_signal(seconds: float) -> np.ndarray:
    t = np.arange(int(seconds * SAMPLE_RATE), dtype=np.float64) / SAMPLE_RATE
    signal = 0.5 * np.sin(2 * np.pi * 220 * t) + 0.3 * np.sin(2 * np.pi * 440 * t) + 0.1 * np.sin(2 * np.pi * 1000 * t)
    # 2 s linear chirp from 100 Hz to 7000 Hz at amplitude 0.1, starting at 0 s.
    chirp_len = 2 * SAMPLE_RATE
    tc = t[:chirp_len]
    f0, f1, dur = 100.0, 7000.0, 2.0
    signal[:chirp_len] += 0.1 * np.sin(2 * np.pi * (f0 * tc + (f1 - f0) / (2 * dur) * tc**2))
    return signal.astype(np.float32)


def mel_frames(audio: np.ndarray) -> np.ndarray:
    melspec = es.TensorflowInputMusiCNN()
    frames = [melspec(frame) for frame in es.FrameGenerator(audio, frameSize=FRAME_SIZE, hopSize=HOP_SIZE)]
    return np.array(frames, dtype=np.float32)


def patch_count(frames: int) -> int:
    return 0 if frames < PATCH_SIZE else 1 + (frames - PATCH_SIZE) // PATCH_HOP


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)

    signal = synthetic_signal(3.0)
    bands = mel_frames(signal)
    frames_30s = len(mel_frames(np.zeros(30 * SAMPLE_RATE, dtype=np.float32)))

    signal.astype("<f4").tofile(out / "mel-signal.f32")
    bands.astype("<f4").tofile(out / "mel-reference.f32")
    meta = {
        "frames": int(bands.shape[0]),
        "patches": patch_count(bands.shape[0]),
        "frames_30s": int(frames_30s),
        "patches_30s": patch_count(frames_30s),
    }
    (out / "mel-reference.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
