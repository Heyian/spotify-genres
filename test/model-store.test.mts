import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_VERSION, ORT_VERSION } from "../module/config.ts";
import { MODEL_BYTES, assetUrls, createModelStore, statusLabel, type ModelStatus } from "../module/model-store.ts";

const PIN = { repo: "someone/discogs-effnet-onnx", revision: "abc123", sha256: "f".repeat(64) };

/** In-memory CacheStorage: name → (url → Response). */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const opened: string[] = [];
  const open = async (name: string) => {
    opened.push(name);
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name)!;
    return {
      match: async (req: RequestInfo | URL) => entries.get(String(req))?.clone(),
      put: async (req: RequestInfo | URL, res: Response) => void entries.set(String(req), res),
    } as unknown as Cache;
  };
  const caches = {
    open,
    has: async (name: string) => stores.has(name),
    delete: async (name: string) => stores.delete(name),
    keys: async () => [...stores.keys()],
    match: async () => undefined,
  } as unknown as CacheStorage;
  return { caches, stores, opened };
}

function chunked(total: number, parts: number): Response {
  const size = Math.ceil(total / parts);
  let sent = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (sent >= total) return controller.close();
        const n = Math.min(size, total - sent);
        sent += n;
        controller.enqueue(new Uint8Array(n));
      },
    }),
  );
}

function fakeFetch() {
  const calls: string[] = [];
  const urls = assetUrls(PIN);
  const fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === urls.model) return chunked(MODEL_BYTES, 3);
    if (url === urls.labels) return new Response(JSON.stringify({ classes: ["Rock---Indie Rock"] }));
    if (url === urls.ortWasm) return new Response(new Uint8Array([0, 97, 115, 109]));
    return new Response("// js");
  }) as typeof fetch;
  return { fetch, calls };
}

const goodDigest = async () => PIN.sha256;

test("labels", () => {
  const cases: Array<[ModelStatus, string]> = [
    [{ state: "not-downloaded" }, "Not downloaded"],
    [{ state: "downloading", percent: 42 }, "Downloading 42%"],
    [{ state: "ready" }, "Ready"],
    [{ state: "failed", reason: "x" }, "Failed — Retry"],
  ];
  for (const [status, label] of cases) assert.equal(statusLabel(status), label);
});

test("asset URLs are pinned", () => {
  const urls = assetUrls(PIN);
  assert.equal(urls.model, "https://huggingface.co/someone/discogs-effnet-onnx/resolve/abc123/discogs-effnet-bsdynamic-1.onnx");
  assert.equal(urls.labels, "https://huggingface.co/someone/discogs-effnet-onnx/resolve/abc123/genre_discogs400-discogs-effnet-1.json");
  for (const url of [urls.ortScript, urls.ortWasm, urls.ortGlue]) assert.ok(url.startsWith(`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`));
});

test("cache_names_versioned (AC27)", async () => {
  const c = fakeCaches();
  const store = createModelStore({ caches: c.caches, fetch: fakeFetch().fetch, digestHex: goodDigest, pin: PIN });
  await store.init();
  await store.download();
  assert.equal(store.status().state, "ready");
  assert.ok(c.opened.length > 0);
  for (const name of c.opened) assert.ok(name.includes(MODEL_VERSION) || name.includes(ORT_VERSION), name);
});

test("sha_mismatch_fails_nothing_cached (AC26)", async () => {
  const c = fakeCaches();
  const store = createModelStore({ caches: c.caches, fetch: fakeFetch().fetch, digestHex: async () => "0".repeat(64), pin: PIN });
  await store.init();
  await store.download();
  assert.equal(store.status().state, "failed");
  const urls = assetUrls(PIN);
  for (const entries of c.stores.values()) assert.equal(entries.has(urls.model), false);
});

test("unpinned mirror fails without network", async () => {
  const c = fakeCaches();
  const f = fakeFetch();
  const store = createModelStore({ caches: c.caches, fetch: f.fetch, digestHex: goodDigest, pin: { ...PIN, revision: "" } });
  await store.init();
  await store.download();
  assert.equal(store.status().state, "failed");
  assert.equal(f.calls.length, 0);
});

test("second_enable_no_network (AC27)", async () => {
  const c = fakeCaches();
  const first = createModelStore({ caches: c.caches, fetch: fakeFetch().fetch, digestHex: goodDigest, pin: PIN });
  await first.init();
  await first.download();
  assert.equal(first.status().state, "ready");

  const f = fakeFetch();
  const restarted = createModelStore({ caches: c.caches, fetch: f.fetch, digestHex: goodDigest, pin: PIN });
  await restarted.init();
  assert.equal(restarted.status().state, "ready");
  await restarted.download();
  assert.equal(f.calls.length, 0);
  const assets = await restarted.load();
  assert.equal(assets.model.byteLength, MODEL_BYTES);
  assert.deepEqual(assets.labels, ["Rock---Indie Rock"]);
  assert.equal(assets.ortScript, "// js");
  assert.equal(assets.ortWasm.byteLength, 4);
  assert.equal(f.calls.length, 0);
});

test("progress_reported (AC41)", async () => {
  const c = fakeCaches();
  const store = createModelStore({ caches: c.caches, fetch: fakeFetch().fetch, digestHex: goodDigest, pin: PIN });
  await store.init();
  assert.equal(store.status().state, "not-downloaded");
  const seen: ModelStatus[] = [];
  store.subscribe((s) => void seen.push(s));
  await store.download();
  const percents = seen.filter((s) => s.state === "downloading").map((s) => (s as { percent: number }).percent);
  assert.ok(percents.length >= 3, JSON.stringify(percents));
  for (let i = 1; i < percents.length; i++) assert.ok(percents[i] > percents[i - 1]);
  assert.equal(seen.at(-1)?.state, "ready");
});
