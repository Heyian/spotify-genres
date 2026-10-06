import { test } from "node:test";
import assert from "node:assert/strict";
import { modelPinned, ORT_VERSION } from "../module/config.ts";

test("model mirror is pinned", () => assert.equal(modelPinned(), true));
test("onnxruntime-web is pinned to 1.30.0", () => assert.equal(ORT_VERSION, "1.30.0"));
