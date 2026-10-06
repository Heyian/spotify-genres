import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("preview audio is never persisted (AC28)", () => {
  const source = readFileSync(join(import.meta.dirname, "..", "module", "audio-decode.ts"), "utf8");
  for (const needle of ["caches.", "indexedDB", "storage."]) assert.ok(!source.includes(needle), needle);
});
