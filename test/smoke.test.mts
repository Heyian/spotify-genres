import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../module/logic.ts";
test("type-stripped module import works", () => assert.equal(escapeHtml("<a>"), "&lt;a&gt;"));
