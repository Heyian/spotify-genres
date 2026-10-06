import { test } from "node:test";
import assert from "node:assert/strict";
import { averageActivations, displayName, topGenres } from "../module/labels.ts";

test("average_two_patches", () =>
  assert.deepEqual(Array.from(averageActivations(new Float32Array([1, 3, 3, 5]), 2, 2)), [2, 4]));

test("display_names (AC25)", () => {
  assert.equal(displayName("Electronic---Darkwave"), "darkwave");
  assert.equal(displayName("Electronic"), "electronic");
});

const labels = ["Rock---Indie Rock", "Rock---Post-Punk", "Electronic---Darkwave", "Electronic---Synth-pop", "Rock---Shoegaze"];

test("top_k_threshold_order (AC24)", () => {
  const r = topGenres(new Float32Array([0.5, 0.1, 0.3, 0.2, 0.16]), labels, 3, 0.15);
  assert.deepEqual(r.genres, ["indie rock", "darkwave", "synth-pop"]);
  assert.deepEqual(r.scores.map((s) => +s.toFixed(4)), [0.5, 0.3, 0.2]);
});

test("exactly_threshold_included (AC24)", () => {
  const r = topGenres(new Float32Array([0.15, 0, 0, 0, 0]), labels, 3, 0.15);
  assert.deepEqual(r.genres, ["indie rock"]);
});

test("parent_fallback (AC24, AC25)", () => {
  const r = topGenres(new Float32Array([0.14, 0.13, 0.14, 0.14, 0.13]), labels, 3, 0.15);
  assert.deepEqual(r.genres, ["rock"]);
  assert.ok(Math.abs(r.scores[0] - 0.4) < 1e-6);
  const e = topGenres(new Float32Array([0.01, 0.01, 0.14, 0.14, 0.01]), labels, 3, 0.15);
  assert.deepEqual(e.genres, ["electronic"]);
});
