import type { DeezerTransport } from "./deezer.ts";

let counter = 0;

/**
 * JSONP transport for the Deezer API: api.deezer.com sends no CORS header,
 * but answers `output=jsonp&callback=…` with a script (spec §3).
 */
export function createJsonpTransport(
  env: { document: Document; window: Window } = { document, window },
  timeoutMs = 10_000,
): DeezerTransport {
  return (url) =>
    new Promise((resolve, reject) => {
      const callback = `__spotifyGenresJsonp${counter++}`;
      const target = new URL(url);
      target.searchParams.set("output", "jsonp");
      target.searchParams.set("callback", callback);

      const globals = env.window as unknown as Record<string, unknown>;
      const script = env.document.createElement("script");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        delete globals[callback];
        script.remove();
      };

      globals[callback] = (body: unknown) => {
        cleanup();
        resolve({ body });
      };
      script.onerror = () => {
        cleanup();
        reject(new Error(`JSONP request failed: ${target.origin}${target.pathname}`));
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`JSONP request timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      script.src = target.toString();
      env.document.head.appendChild(script);
    });
}
