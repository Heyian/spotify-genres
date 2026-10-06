import { MODEL_REPO, MODEL_REVISION, MODEL_SHA256, MODEL_VERSION, ORT_VERSION } from "./config.ts";

export type ModelStatus =
  | { state: "not-downloaded" }
  | { state: "downloading"; percent: number }
  | { state: "ready" }
  | { state: "failed"; reason: string };

export function statusLabel(s: ModelStatus): string {
  switch (s.state) {
    case "not-downloaded":
      return "Not downloaded";
    case "downloading":
      return `Downloading ${s.percent}%`;
    case "ready":
      return "Ready";
    case "failed":
      return "Failed — Retry";
  }
}

/** Cache names carry the versions, so a version bump never reuses stale files (AC27). */
export const MODEL_CACHE = `spotify-genres-model-${MODEL_VERSION}`, ORT_CACHE = `spotify-genres-ort-${ORT_VERSION}`;
export const MODEL_BYTES = 18_027_718;

export interface MirrorPin {
  repo: string;
  revision: string;
  sha256: string;
}

const CONFIG_PIN: MirrorPin = { repo: MODEL_REPO, revision: MODEL_REVISION, sha256: MODEL_SHA256 };

export function assetUrls(pin: MirrorPin = CONFIG_PIN): { model: string; labels: string; ortScript: string; ortWasm: string; ortGlue: string } {
  const mirror = `https://huggingface.co/${pin.repo}/resolve/${pin.revision}/`;
  const ort = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  return {
    model: `${mirror}discogs-effnet-bsdynamic-1.onnx`,
    labels: `${mirror}genre_discogs400-discogs-effnet-1.json`,
    ortScript: `${ort}ort.wasm.min.js`,
    ortWasm: `${ort}ort-wasm-simd-threaded.wasm`,
    ortGlue: `${ort}ort-wasm-simd-threaded.mjs`,
  };
}

export interface ModelAssets {
  model: ArrayBuffer;
  labels: string[];
  ortScript: string;
  ortWasm: ArrayBuffer;
  ortGlue: string;
}

export interface ModelStore {
  status(): ModelStatus;
  subscribe(listener: (s: ModelStatus) => void): () => void;
  /** Ready if every asset is already cached, else not-downloaded. */
  init(): Promise<void>;
  /** No-op when ready; used by toggle-on and Retry. */
  download(): Promise<void>;
  /** From Cache Storage only. */
  load(): Promise<ModelAssets>;
}

export function createModelStore(deps: {
  caches: CacheStorage;
  fetch: typeof fetch;
  digestHex(buf: ArrayBuffer): Promise<string>;
  /** Defaults to the pin in config.ts. */
  pin?: MirrorPin;
}): ModelStore {
  const pin = deps.pin ?? CONFIG_PIN;
  const urls = assetUrls(pin);
  const placement: Array<[cache: string, url: string]> = [
    [MODEL_CACHE, urls.model],
    [MODEL_CACHE, urls.labels],
    [ORT_CACHE, urls.ortScript],
    [ORT_CACHE, urls.ortWasm],
    [ORT_CACHE, urls.ortGlue],
  ];
  const listeners = new Set<(s: ModelStatus) => void>();
  let current: ModelStatus = { state: "not-downloaded" };
  let inFlight: Promise<void> | undefined;

  const set = (s: ModelStatus) => {
    current = s;
    for (const listener of [...listeners]) listener(s);
  };

  const cached = async (cache: string, url: string) => (await deps.caches.open(cache)).match(url);

  const allCached = async () => {
    for (const [cache, url] of placement) if (!(await cached(cache, url))) return false;
    return true;
  };

  const fetchOk = async (url: string) => {
    const res = await deps.fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  };

  const fetchModel = async (): Promise<ArrayBuffer> => {
    const res = await fetchOk(urls.model);
    if (!res.body) return res.arrayBuffer();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let percent = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      const next = Math.min(99, Math.floor((received / MODEL_BYTES) * 100));
      if (next > percent) set({ state: "downloading", percent: (percent = next) });
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  };

  const run = async () => {
    set({ state: "downloading", percent: 0 });
    try {
      if (!pin.revision || !pin.sha256) throw new Error("Model mirror is not pinned yet");
      const model = await fetchModel();
      // AC26: checked before anything is cached.
      if ((await deps.digestHex(model)) !== pin.sha256) throw new Error("Model checksum mismatch");
      const labels = await (await fetchOk(urls.labels)).text();
      if (!Array.isArray(JSON.parse(labels).classes)) throw new Error("Labels file has no classes");
      const ortScript = await (await fetchOk(urls.ortScript)).arrayBuffer();
      const ortWasm = await (await fetchOk(urls.ortWasm)).arrayBuffer();
      const ortGlue = await (await fetchOk(urls.ortGlue)).arrayBuffer();

      const modelCache = await deps.caches.open(MODEL_CACHE);
      const ortCache = await deps.caches.open(ORT_CACHE);
      await modelCache.put(urls.model, new Response(model));
      await modelCache.put(urls.labels, new Response(labels));
      await ortCache.put(urls.ortScript, new Response(ortScript));
      await ortCache.put(urls.ortWasm, new Response(ortWasm));
      await ortCache.put(urls.ortGlue, new Response(ortGlue));
      set({ state: "ready" });
    } catch (error) {
      await deps.caches.delete(MODEL_CACHE).catch(() => false);
      await deps.caches.delete(ORT_CACHE).catch(() => false);
      set({ state: "failed", reason: error instanceof Error ? error.message : String(error) });
    }
  };

  return {
    status: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async init() {
      try {
        set((await allCached()) ? { state: "ready" } : { state: "not-downloaded" });
      } catch {
        set({ state: "not-downloaded" });
      }
    },
    download() {
      if (current.state === "ready") return Promise.resolve();
      inFlight ??= run().finally(() => (inFlight = undefined));
      return inFlight;
    },
    async load() {
      const read = async (cache: string, url: string) => {
        const res = await cached(cache, url);
        if (!res) throw new Error(`Not cached: ${url}`);
        return res;
      };
      return {
        model: await (await read(MODEL_CACHE, urls.model)).arrayBuffer(),
        labels: JSON.parse(await (await read(MODEL_CACHE, urls.labels)).text()).classes,
        ortScript: await (await read(ORT_CACHE, urls.ortScript)).text(),
        ortWasm: await (await read(ORT_CACHE, urls.ortWasm)).arrayBuffer(),
        ortGlue: await (await read(ORT_CACHE, urls.ortGlue)).text(),
      };
    },
  };
}
