import type { TrackRef } from "./genre-pipeline.ts";

export type GetContents = (uri: string, opts: { limit: number; offset: number }) => Promise<unknown>;

const PAGE_SIZE = 100;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Maps a `PlaylistAPI.getContents` item. Episodes map with `isTrack: false`; `undefined` only without a uri. */
export function playlistItemToTrackRef(item: unknown): TrackRef | undefined {
  if (!item || typeof item !== "object") return undefined;
  const it = item as Record<string, unknown>;
  const uri = str(it.uri);
  if (!uri) return undefined;
  const artists = Array.isArray(it.artists) ? it.artists : [];
  const first = artists[0] as { name?: unknown } | undefined;
  const ms = Number((it.duration as { milliseconds?: unknown } | undefined)?.milliseconds);
  const durationS = ms / 1000;
  return {
    uri,
    artist: str(first?.name),
    title: str(it.name),
    durationS: Number.isFinite(durationS) && durationS > 0 ? durationS : null,
    isLocal: it.isLocal === true || uri.startsWith("spotify:local:"),
    isTrack: it.type === "track",
  };
}

/** Lists every item of a playlist, 100 per page. Throws `signal.reason` when aborted between pages. */
export async function listPlaylistTracks(getContents: GetContents, uri: string, signal?: AbortSignal): Promise<TrackRef[]> {
  const out: TrackRef[] = [];
  let seen = 0;
  for (;;) {
    if (signal?.aborted) throw signal.reason;
    const page = (await getContents(uri, { limit: PAGE_SIZE, offset: seen })) as
      | { items?: unknown; totalLength?: unknown }
      | undefined;
    const items = Array.isArray(page?.items) ? page.items : [];
    if (signal?.aborted) throw signal.reason;
    if (items.length === 0) break;
    for (const it of items) {
      const ref = playlistItemToTrackRef(it);
      if (ref) out.push(ref);
    }
    seen += items.length;
    const total = page?.totalLength;
    if (typeof total === "number" && seen >= total) break;
  }
  return out;
}
