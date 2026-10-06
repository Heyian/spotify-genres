import { pickCandidate, type DeezerCandidate, type TrackQuery } from "./match.ts";
import { QuotaError } from "./request-queue.ts";

/** Fetches a Deezer API URL; JSONP in the client (no HTTP status), `fetch` in Node. */
export type DeezerTransport = (url: string) => Promise<{ status?: number; body: unknown }>;

const DEEZER_API = "https://api.deezer.com/";

/** Advanced-search URL straight to api.deezer.com, never through a CORS proxy (AC40). */
export function buildDeezerSearchUrl(track: TrackQuery): string {
  const quoted = (s: string) => `"${s.replace(/"/g, " ").trim()}"`;
  const url = new URL("search", DEEZER_API);
  url.searchParams.set("q", `artist:${quoted(track.artist)} track:${quoted(track.title)}`);
  url.searchParams.set("limit", "10");
  return url.toString();
}

/** HTTP 429 or Deezer's "Quota limit exceeded" error body (code 4). */
export function isQuotaResponse(status: number | undefined, body: unknown): boolean {
  if (status === 429) return true;
  const error = (body as { error?: { code?: unknown } } | null)?.error;
  return error?.code === 4;
}

/** Preview URL of the first matching Deezer candidate, or null. Throws `QuotaError` on a quota response. */
export async function findPreview(track: TrackQuery, transport: DeezerTransport, toleranceS: number): Promise<string | null> {
  const { status, body } = await transport(buildDeezerSearchUrl(track));
  if (isQuotaResponse(status, body)) throw new QuotaError("Deezer quota exceeded");
  const data = (body as { data?: DeezerCandidate[] } | null)?.data ?? [];
  return pickCandidate(track, data, toleranceS)?.preview || null;
}
