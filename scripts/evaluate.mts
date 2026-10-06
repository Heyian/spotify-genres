/**
 * Evaluation report over a hand-labelled tracks CSV (spec §9 Step 7, AC34).
 *
 *   bun run evaluate eval/tracks.csv [--model <path to discogs-effnet-bsdynamic-1.onnx>]
 *
 * Needs ffmpeg on PATH and the mirror folder from Manual Operator Step 1
 * (labels are read next to the model). Playlist-link resolution is not
 * measured: Node has no Spotify session.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as ort from "onnxruntime-node";

import { audioMinConfidence, audioTopK, backoffInitialMs, backoffMaxMs, deezerBudget, deezerWindowMs, durationToleranceS } from "../module/config.ts";
import { findPreview, type DeezerTransport } from "../module/deezer.ts";
import { averageActivations, topGenres } from "../module/labels.ts";
import { MEL_BANDS, PATCH_FRAMES, melPatches } from "../module/mel.ts";
import { createRequestQueue } from "../module/request-queue.ts";
import { isHit, parseEvalArgs, parseTracksCsv, summarise } from "./evaluate-lib.ts";

const { csvPath, modelPath } = parseEvalArgs(process.argv.slice(2), homedir());
if (!csvPath) {
  console.error("usage: bun run evaluate <tracks.csv> [--model <path>]");
  process.exit(2);
}

const labels: string[] = JSON.parse(readFileSync(join(dirname(modelPath), "genre_discogs400-discogs-effnet-1.json"), "utf8")).classes;
const session = await ort.InferenceSession.create(modelPath);
const outputName = session.outputNames.includes("activations") ? "activations" : session.outputNames[0];

const transport: DeezerTransport = async (url) => {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
};
const deezer = createRequestQueue({ budget: deezerBudget, windowMs: deezerWindowMs, backoffInitialMs, backoffMaxMs });

/** MP3 bytes → 16 kHz mono float32 via ffmpeg. */
function decode(bytes: Uint8Array): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"]);
    const chunks: Buffer[] = [];
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}`));
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
    });
    ff.stdin.end(bytes);
  });
}

async function classify(previewUrl: string) {
  const res = await fetch(previewUrl);
  if (!res.ok) throw new Error(`preview HTTP ${res.status}`);
  const samples = await decode(new Uint8Array(await res.arrayBuffer()));
  const { data, patches } = melPatches(samples);
  if (!patches) throw new Error("preview too short");
  const out = await session.run({ melspectrogram: new ort.Tensor("float32", data, [patches, PATCH_FRAMES, MEL_BANDS]) });
  const avg = averageActivations(out[outputName].data as Float32Array, patches, labels.length);
  // Report the top 3 styles regardless of the display threshold, so tuning can see near misses.
  return { shown: topGenres(avg, labels, audioTopK, audioMinConfidence), top3: topGenres(avg, labels, 3, 0) };
}

const rows = parseTracksCsv(readFileSync(csvPath, "utf8"));
const results: Array<{ preview: boolean; hit: boolean }> = [];
for (const row of rows) {
  const name = `${row.artist} - ${row.title}`;
  let preview: string | null = null;
  try {
    preview = await deezer.enqueue(name, "current", () =>
      findPreview({ artist: row.artist, title: row.title, durationS: row.durationS }, transport, durationToleranceS),
    );
  } catch (error) {
    console.log(`${name} | preview error: ${(error as Error).message}`);
  }
  if (!preview) {
    results.push({ preview: false, hit: false });
    console.log(`${name} | preview n | - | miss`);
    continue;
  }
  try {
    const { top3 } = await classify(preview);
    const hit = isHit(row.expected, top3.genres);
    results.push({ preview: true, hit });
    const styles = top3.genres.map((g, i) => `${g}:${top3.scores[i].toFixed(3)}`).join(", ");
    console.log(`${name} | preview y | ${styles} | ${hit ? "hit" : "miss"}`);
  } catch (error) {
    results.push({ preview: true, hit: false });
    console.log(`${name} | preview y | error: ${(error as Error).message} | miss`);
  }
}

const { coveragePct, hitRatePct } = summarise(results);
console.log(`Preview coverage: ${coveragePct.toFixed(1)}% | Top-3 hit rate: ${hitRatePct.toFixed(1)}%`);
