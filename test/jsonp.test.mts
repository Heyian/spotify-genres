import { test } from "node:test";
import assert from "node:assert/strict";
import { createJsonpTransport } from "../module/jsonp.ts";

interface FakeScript { src: string; onerror: (() => void) | null; removed: boolean; remove(): void }

function fakeEnv() {
  const scripts: FakeScript[] = [];
  const win: Record<string, unknown> = {};
  const doc = {
    createElement: () => {
      const s: FakeScript = { src: "", onerror: null, removed: false, remove: () => void (s.removed = true) };
      return s;
    },
    head: { appendChild: (s: FakeScript) => void scripts.push(s) },
  };
  return { scripts, win, env: { document: doc as unknown as Document, window: win as unknown as Window } };
}

const callbackOf = (src: string) => new URL(src).searchParams.get("callback")!;

test("jsonp_appends_script_and_resolves (AC40)", async () => {
  const { scripts, win, env } = fakeEnv();
  const pending = createJsonpTransport(env)("https://api.deezer.com/search?q=x");
  const [script] = scripts;
  assert.ok(script.src.startsWith("https://api.deezer.com/"));
  assert.ok(script.src.includes("output=jsonp"));
  assert.ok(script.src.includes("callback="));
  const cb = callbackOf(script.src);
  (win[cb] as (b: unknown) => void)({ data: [] });
  assert.deepEqual(await pending, { body: { data: [] } });
  assert.equal(script.removed, true);
  assert.equal(win[cb], undefined);
});

test("jsonp_script_error_rejects", async () => {
  const { scripts, win, env } = fakeEnv();
  const pending = createJsonpTransport(env)("https://api.deezer.com/search?q=x");
  const [script] = scripts;
  script.onerror!();
  await assert.rejects(pending);
  assert.equal(script.removed, true);
  assert.equal(win[callbackOf(script.src)], undefined);
});

test("jsonp_timeout_rejects", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { scripts, win, env } = fakeEnv();
  const pending = createJsonpTransport(env, 1000)("https://api.deezer.com/search?q=x");
  t.mock.timers.tick(1000);
  await assert.rejects(pending, /timed out/);
  assert.equal(scripts[0].removed, true);
  assert.equal(win[callbackOf(scripts[0].src)], undefined);
});
