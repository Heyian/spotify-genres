import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeezerSearchUrl, findPreview, isQuotaResponse } from "../module/deezer.ts";
import { QuotaError } from "../module/request-queue.ts";

const track = { artist: "Artist", title: "Song", durationS: 200 };
const hit = { title: "Song", duration: 201, preview: "https://cdn/p.mp3", artist: { name: "Artist" } };

test("search_url_direct (AC40)", () => {
  const url = buildDeezerSearchUrl(track);
  assert.ok(url.startsWith("https://api.deezer.com/search?"), url);
  assert.ok(!url.includes("cors-proxy"));
  // Deezer's artist:/track: field filters return no data (live probe 2026-10-06); pickCandidate does the matching.
  assert.equal(new URL(url).searchParams.get("q"), "Artist Song");
  assert.equal(new URL(url).searchParams.get("limit"), "25");
});

test("quota_detection (AC15)", () => {
  assert.equal(isQuotaResponse(429, {}), true);
  assert.equal(isQuotaResponse(200, { error: { code: 4 } }), true);
  assert.equal(isQuotaResponse(200, { data: [] }), false);
  assert.equal(isQuotaResponse(undefined, { error: { code: 800 } }), false);
});

test("findPreview_quota_throws", async () =>
  assert.rejects(findPreview(track, async () => ({ body: { error: { code: 4 } } }), 5), QuotaError));

test("findPreview_no_match_null (AC21)", async () =>
  assert.equal(await findPreview(track, async () => ({ body: { data: [{ ...hit, title: "Other" }] } }), 5), null));

test("findPreview_match_without_preview_null (AC21)", async () =>
  assert.equal(await findPreview(track, async () => ({ body: { data: [{ ...hit, preview: "" }] } }), 5), null));

test("findPreview_match_returns_preview", async () =>
  assert.equal(await findPreview(track, async () => ({ status: 200, body: { data: [hit] } }), 5), "https://cdn/p.mp3"));
