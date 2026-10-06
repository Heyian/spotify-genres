import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const MODEL = "discogs-effnet-bsdynamic-1.onnx";
const LABELS = "genre_discogs400-discogs-effnet-1.json";
const SCRIPT = join(import.meta.dirname, "..", "scripts", "prepare-model-mirror.sh");

async function runWithServedModel(model: Buffer): Promise<{ code: number | null; stdout: string; out: string }> {
  const files: Record<string, Buffer> = {
    [`/${MODEL}`]: model,
    [`/${LABELS}`]: Buffer.from(JSON.stringify({ classes: ["Rock---Indie Rock"] })),
  };
  const server = createServer((req, res) => {
    const body = files[req.url ?? ""];
    if (!body) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Length": body.length }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const out = join(mkdtempSync(join(tmpdir(), "mirror-")), "out");
  try {
    return await new Promise((resolve) => {
      const child = spawn("bash", [SCRIPT, out], { env: { ...process.env, MIRROR_BASE_URL: `http://127.0.0.1:${port}/` } });
      let stdout = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.on("close", (code) => resolve({ code, stdout, out }));
    });
  } finally {
    server.close();
  }
}

test("writes the four mirror files and prints the model SHA-256 last", async () => {
  const model = Buffer.alloc(18_027_718, 7);
  const { code, stdout, out } = await runWithServedModel(model);
  assert.equal(code, 0);
  assert.deepEqual(readdirSync(out).sort(), ["LICENSE", "README.md", LABELS, MODEL].sort());
  const readme = readFileSync(join(out, "README.md"), "utf8");
  assert.match(readme, /^---\n(?:.*\n)*?license: cc-by-nc-sa-4\.0\n(?:.*\n)*?---\n/);
  const last = stdout.trim().split("\n").at(-1);
  assert.equal(last, createHash("sha256").update(model).digest("hex"));
});

test("exits non-zero without a SHA-256 when the model size is wrong", async () => {
  const { code, stdout } = await runWithServedModel(Buffer.alloc(100, 1));
  assert.notEqual(code, 0);
  assert.doesNotMatch(stdout, /^[0-9a-f]{64}$/m);
});
