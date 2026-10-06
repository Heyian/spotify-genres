import type { Classifier } from "./classifier-worker.ts";
import { audioMinConfidence, audioTopK } from "./config.ts";
import { averageActivations, topGenres, type ScoredGenres } from "./labels.ts";
import { melPatches } from "./mel.ts";

const TARGET_RATE = 16000;

/** MP3 bytes → 16 kHz mono samples. Preview audio stays in memory only (AC28). */
export async function decodeTo16kMono(bytes: ArrayBuffer): Promise<Float32Array> {
  const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
  const length = Math.ceil(decoded.duration * TARGET_RATE);
  const context = new OfflineAudioContext(1, length, TARGET_RATE);
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return rendered.getChannelData(0);
}

/** fetch → decode → mel → inference → averaged activations → top genres. */
export function createPreviewClassifier(c: Classifier, labels: string[]): (url: string) => Promise<ScoredGenres> {
  return async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Preview fetch failed: HTTP ${res.status}`);
    const samples = await decodeTo16kMono(await res.arrayBuffer());
    const { data, patches } = melPatches(samples);
    if (!patches) throw new Error("Preview too short for one patch");
    const activations = await c.run(data, patches);
    return topGenres(averageActivations(activations, patches, labels.length), labels, audioTopK, audioMinConfidence);
  };
}
