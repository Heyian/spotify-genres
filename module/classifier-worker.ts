import type { ModelAssets } from "./model-store.ts";

/** Worker-scope global; the DOM lib does not declare it. */
declare const importScripts: (...urls: string[]) => void;

/**
 * Worker body. It is serialised with `Function.prototype.toString()` and
 * started from a Blob URL (spec §4.4), so it must not reference imports or
 * anything outside its own body.
 *
 * Protocol:
 * - `{type:"init", ortScriptUrl, wasmUrl, glueUrl, model}` → `{type:"ready"}` | `{type:"init-error", message}`
 * - `{type:"run", id, patches, n}` → `{type:"result", id, activations}` | `{type:"error", id, message}`
 *
 * Runtime setup for onnxruntime-web 1.30.0: `ort.wasm.min.js` loaded with
 * `importScripts`, single-threaded WASM, and `wasmPaths` given as
 * `{ wasm, mjs }` Blob URLs made from the cached files.
 */
export function workerMain(): void {
  const scope = self as any;
  let ort: any;
  let session: any;
  scope.onmessage = async (event: MessageEvent) => {
    const msg = event.data;
    if (msg.type === "init") {
      try {
        importScripts(msg.ortScriptUrl);
        ort = scope.ort;
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = { wasm: msg.wasmUrl, mjs: msg.glueUrl };
        session = await ort.InferenceSession.create(new Uint8Array(msg.model), { executionProviders: ["wasm"] });
        scope.postMessage({ type: "ready" });
      } catch (error: any) {
        scope.postMessage({ type: "init-error", message: String(error?.message ?? error) });
      }
      return;
    }
    if (msg.type === "run") {
      try {
        const input = new ort.Tensor("float32", msg.patches, [msg.n, 128, 96]);
        const outputs = await session.run({ [session.inputNames[0]]: input });
        const name = session.outputNames.includes("activations") ? "activations" : session.outputNames[0];
        const activations = new Float32Array(outputs[name].data);
        scope.postMessage({ type: "result", id: msg.id, activations }, [activations.buffer]);
      } catch (error: any) {
        scope.postMessage({ type: "error", id: msg.id, message: String(error?.message ?? error) });
      }
    }
  };
}

export function workerSource(): string {
  return `(${workerMain.toString()})()`;
}

export interface Classifier {
  /** Returns `[n, 400]` activations. */
  run(patches: Float32Array, n: number): Promise<Float32Array>;
  dispose(): void;
}

export interface ClassifierOptions {
  /** Tests inject a fake; defaults to `new Worker(url)`. */
  createWorker?: (url: string) => Worker;
  initTimeoutMs?: number;
  runTimeoutMs?: number;
}

/** Start the Blob-URL worker and load the model once. A hung or failed start disposes the worker. */
export function createClassifier(assets: ModelAssets, opts: ClassifierOptions = {}): Promise<Classifier> {
  const { createWorker = (url: string) => new Worker(url), initTimeoutMs = 60_000, runTimeoutMs = 30_000 } = opts;
  const blobUrl = (part: BlobPart, type: string) => URL.createObjectURL(new Blob([part], { type }));
  const urls = {
    worker: blobUrl(workerSource(), "text/javascript"),
    ortScript: blobUrl(assets.ortScript, "text/javascript"),
    wasm: blobUrl(assets.ortWasm, "application/wasm"),
    glue: blobUrl(assets.ortGlue, "text/javascript"),
  };
  const worker = createWorker(urls.worker);
  const pending = new Map<number, { reject(e: Error): void; resolve(a: Float32Array): void; timer: ReturnType<typeof setTimeout> }>();
  let nextId = 0;
  let disposed = false;

  const failAll = (error: Error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    failAll(new Error("Classifier disposed"));
  };

  const classifier: Classifier = {
    run(patches, n) {
      if (disposed) return Promise.reject(new Error("Classifier disposed"));
      const id = nextId++;
      const copy = patches.slice();
      return new Promise<Float32Array>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Classifier run timed out after ${runTimeoutMs} ms`));
        }, runTimeoutMs);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ type: "run", id, patches: copy, n }, [copy.buffer]);
      });
    },
    dispose,
  };

  return new Promise((resolve, reject) => {
    let ready = false;
    const initTimer = setTimeout(() => {
      dispose();
      reject(new Error(`Classifier start timed out after ${initTimeoutMs} ms`));
    }, initTimeoutMs);
    const failStart = (error: Error) => {
      clearTimeout(initTimer);
      dispose();
      reject(error);
    };

    worker.onerror = (event) => {
      const error = new Error(`Classifier worker failed: ${event.message}`);
      if (!ready) return failStart(error);
      failAll(error);
    };
    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "ready") {
        ready = true;
        clearTimeout(initTimer);
        resolve(classifier);
      } else if (msg.type === "init-error") {
        failStart(new Error(msg.message));
      } else if (msg.type === "result" || msg.type === "error") {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.type === "result") p.resolve(msg.activations);
        else p.reject(new Error(msg.message));
      }
    };
    const model = assets.model.slice(0);
    worker.postMessage({ type: "init", ortScriptUrl: urls.ortScript, wasmUrl: urls.wasm, glueUrl: urls.glue, model }, [model]);
  });
}
