import { test } from "node:test";
import assert from "node:assert/strict";
import { workerSource } from "../module/classifier-worker.ts";

test("worker_source_is_self_contained", () => {
  const source = workerSource();
  assert.doesNotThrow(() => new Function(source));
  assert.ok(!source.includes("import "));
  assert.ok(!source.includes("require("));
});

test("worker protocol runs against a fake runtime with no outer references", async () => {
  const posted: Array<Record<string, unknown>> = [];
  const scope: Record<string, any> = { postMessage: (m: Record<string, unknown>) => void posted.push(m) };
  const fakeOrt = {
    env: { wasm: {} as Record<string, unknown> },
    Tensor: class {
      dims: number[];
      constructor(_type: string, _data: Float32Array, dims: number[]) {
        this.dims = dims;
      }
    },
    InferenceSession: {
      create: async () => ({
        inputNames: ["melspectrogram"],
        outputNames: ["embeddings", "activations"],
        run: async (feeds: Record<string, { dims: number[] }>) => ({
          activations: { data: new Float32Array(feeds.melspectrogram.dims[0] * 400).fill(0.5) },
        }),
      }),
    },
  };
  const importScripts = (url: string) => {
    assert.equal(url, "blob:ort");
    scope.ort = fakeOrt;
  };
  new Function("self", "importScripts", workerSource())(scope, importScripts);
  const settle = () => new Promise((r) => setImmediate(r));

  await scope.onmessage({ data: { type: "init", ortScriptUrl: "blob:ort", wasmUrl: "blob:wasm", glueUrl: "blob:glue", model: new ArrayBuffer(8) } });
  await settle();
  assert.deepEqual(posted.at(-1), { type: "ready" });
  assert.equal(fakeOrt.env.wasm.numThreads, 1);
  assert.deepEqual(fakeOrt.env.wasm.wasmPaths, { wasm: "blob:wasm", mjs: "blob:glue" });

  await scope.onmessage({ data: { type: "run", id: 7, patches: new Float32Array(2 * 128 * 96), n: 2 } });
  await settle();
  const result = posted.at(-1) as { type: string; id: number; activations: Float32Array };
  assert.equal(result.type, "result");
  assert.equal(result.id, 7);
  assert.equal(result.activations.length, 800);
});
