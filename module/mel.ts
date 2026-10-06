/**
 * Mel front-end for Discogs-EffNet: a port of Essentia's
 * TensorflowInputMusiCNN with the framing of TensorflowPredictEffnetDiscogs
 * (spec §4.3). Parity with Essentia is pinned by test/mel.test.mts.
 */

export const PATCH_FRAMES = 128, PATCH_HOP = 62, MEL_BANDS = 96;

const SAMPLE_RATE = 16000;
const FRAME_SIZE = 512;
const HOP_SIZE = 256;
const BINS = FRAME_SIZE / 2 + 1;

// Essentia Windowing defaults: symmetric Hann, normalized=false.
const WINDOW = Float64Array.from({ length: FRAME_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_SIZE - 1)));

// Slaney mel scale (Essentia hz2melSlaney / mel2hzSlaney).
const LIN_SLOPE = 3 / 200;
const MIN_LOG_HZ = 1000;
const MIN_LOG_MEL = MIN_LOG_HZ * LIN_SLOPE;
const LOG_STEP = Math.log(6.4) / 27;
const hzToMel = (hz: number) => (hz < MIN_LOG_HZ ? hz * LIN_SLOPE : MIN_LOG_MEL + Math.log(hz / MIN_LOG_HZ) / LOG_STEP);
const melToHz = (mel: number) => (mel < MIN_LOG_MEL ? mel / LIN_SLOPE : MIN_LOG_HZ * Math.exp((mel - MIN_LOG_MEL) * LOG_STEP));

interface Filter {
  begin: number;
  weights: Float64Array;
}

/** Essentia MelBands → TriangularBands: linear weighting, unit_tri normalisation, 0–8000 Hz. */
function buildFilters(): Filter[] {
  const low = hzToMel(0);
  const high = hzToMel(SAMPLE_RATE / 2);
  const step = (high - low) / (MEL_BANDS + 1);
  const edges = Array.from({ length: MEL_BANDS + 2 }, (_, i) => melToHz(low + i * step));
  const binHz = SAMPLE_RATE / 2 / (BINS - 1);
  const filters: Filter[] = [];
  for (let i = 0; i < MEL_BANDS; i++) {
    const [f0, f1, f2] = [edges[i], edges[i + 1], edges[i + 2]];
    const rise = f1 - f0;
    const fall = f2 - f1;
    const begin = Math.ceil(f0 / binHz);
    const end = Math.floor(f2 / binHz);
    const area = (rise + fall) / 2;
    const weights = new Float64Array(Math.max(0, end - begin + 1));
    for (let j = begin; j <= end; j++) {
      const f = j * binHz;
      weights[j - begin] = (f < f1 ? (f - f0) / rise : (f2 - f) / fall) / area;
    }
    filters.push({ begin, weights });
  }
  return filters;
}

const FILTERS = buildFilters();

// Radix-2 FFT tables for FRAME_SIZE.
const LOG2N = Math.log2(FRAME_SIZE);
const BIT_REVERSE = Uint16Array.from({ length: FRAME_SIZE }, (_, i) => {
  let r = 0;
  for (let b = 0; b < LOG2N; b++) r |= ((i >> b) & 1) << (LOG2N - 1 - b);
  return r;
});
const COS = Float64Array.from({ length: FRAME_SIZE / 2 }, (_, k) => Math.cos((-2 * Math.PI * k) / FRAME_SIZE));
const SIN = Float64Array.from({ length: FRAME_SIZE / 2 }, (_, k) => Math.sin((-2 * Math.PI * k) / FRAME_SIZE));

/** In-place iterative FFT on (re, im) whose input is already in bit-reversed order. */
function fft(re: Float64Array, im: Float64Array): void {
  for (let size = 2; size <= FRAME_SIZE; size <<= 1) {
    const half = size >> 1;
    const stride = FRAME_SIZE / size;
    for (let start = 0; start < FRAME_SIZE; start += size) {
      for (let k = 0; k < half; k++) {
        const c = COS[k * stride], s = SIN[k * stride];
        const a = start + k, b = a + half;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/**
 * Essentia FrameCutter defaults as used by TensorflowPredictEffnetDiscogs:
 * the first frame is centred on sample 0 (zero-padded), and the last frame is
 * the first one whose centre reaches the end of the signal.
 */
const frameCount = (n: number) => (n === 0 ? 0 : Math.ceil(n / HOP_SIZE) + 1);

/** Per-frame mel bands, `[frames, 96]` row-major. */
export function melFrames(samples: Float32Array): Float32Array {
  const frames = frameCount(samples.length);
  const out = new Float32Array(frames * MEL_BANDS);
  const re = new Float64Array(FRAME_SIZE);
  const im = new Float64Array(FRAME_SIZE);
  const power = new Float64Array(BINS);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP_SIZE - FRAME_SIZE / 2;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const at = start + i;
      const sample = at >= 0 && at < samples.length ? samples[at] : 0;
      re[BIT_REVERSE[i]] = sample * WINDOW[i];
      im[BIT_REVERSE[i]] = 0;
    }
    fft(re, im);
    for (let k = 0; k < BINS; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    for (let b = 0; b < MEL_BANDS; b++) {
      const { begin, weights } = FILTERS[b];
      let sum = 0;
      for (let j = 0; j < weights.length; j++) sum += power[begin + j] * weights[j];
      out[f * MEL_BANDS + b] = Math.log10(1 + 10000 * sum);
    }
  }
  return out;
}

/** Mel patches `[patches, 128, 96]`, hop 62 frames, last partial patch dropped. */
export function melPatches(samples: Float32Array): { data: Float32Array; patches: number } {
  const frames = melFrames(samples);
  const frameCountTotal = frames.length / MEL_BANDS;
  const patches = frameCountTotal < PATCH_FRAMES ? 0 : 1 + Math.floor((frameCountTotal - PATCH_FRAMES) / PATCH_HOP);
  const patchSize = PATCH_FRAMES * MEL_BANDS;
  const data = new Float32Array(patches * patchSize);
  for (let p = 0; p < patches; p++) {
    const from = p * PATCH_HOP * MEL_BANDS;
    data.set(frames.subarray(from, from + patchSize), p * patchSize);
  }
  return { data, patches };
}
