import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_REPO, MODEL_REVISION, MODEL_SHA256, modelPinned, ORT_VERSION } from "../module/config.ts";

test("model mirror is pinned to a commit and a checksum", () => {
  assert.equal(modelPinned(), true);
  assert.match(MODEL_REVISION, /^[0-9a-f]{40}$/);
  assert.match(MODEL_SHA256, /^[0-9a-f]{64}$/);
  assert.ok(!MODEL_REPO.includes("<"), MODEL_REPO);
});
test("onnxruntime-web is pinned to 1.30.0", () => assert.equal(ORT_VERSION, "1.30.0"));
