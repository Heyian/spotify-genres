import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MEL_BANDS, PATCH_FRAMES, PATCH_HOP, melFrames, melPatches } from "../module/mel.ts";

const fixtures = join(import.meta.dirname, "fixtures");
const f32 = (name: string) => {
  const buf = readFileSync(join(fixtures, name));
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const meta = JSON.parse(readFileSync(join(fixtures, "mel-reference.json"), "utf8"));

test("mel_matches_essentia (AC22)", () => {
  const signal = f32("mel-signal.f32");
  const reference = f32("mel-reference.f32");
  const frames = melFrames(signal);
  assert.equal(frames.length, meta.frames * MEL_BANDS);
  let maxError = 0;
  for (let i = 0; i < reference.length; i++) maxError = Math.max(maxError, Math.abs(frames[i] - reference[i]));
  assert.ok(maxError <= 1e-3, `max abs error ${maxError}`);
  assert.equal(melPatches(signal).patches, meta.patches);
});

test("thirty_seconds_yields_29_patches (AC23)", () => {
  assert.equal(meta.patches_30s, 29);
  assert.equal(melPatches(new Float32Array(480000)).patches, 29);
});

test("patch_layout", () => {
  const signal = new Float32Array(16000 * 6).map((_, i) => Math.sin(i / 7) * (i % 1000) / 1000);
  const frames = melFrames(signal);
  const { data, patches } = melPatches(signal);
  assert.ok(patches >= 2);
  assert.equal(data.length, patches * PATCH_FRAMES * MEL_BANDS);
  const patch1 = data.subarray(PATCH_FRAMES * MEL_BANDS, PATCH_FRAMES * MEL_BANDS + MEL_BANDS);
  assert.deepEqual(patch1, frames.subarray(PATCH_HOP * MEL_BANDS, (PATCH_HOP + 1) * MEL_BANDS));
});
