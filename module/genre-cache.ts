import { DAY_MS } from "./config.ts";

export type GenreSource = "musicbrainz" | "audio" | "none";

/** One cached lookup result per Spotify track URI (spec §4.1). */
export interface GenreCacheEntry {
  uri: string;
  /** Display names, already normalised. */
  genres: string[];
  source: GenreSource;
  /** Audio only, parallel to `genres`. */
  scores?: number[];
  /** Audio only. */
  modelVersion?: string;
  /** `none` only: false when the audio step was off, so enabling it later retries the track. */
  audioTried?: boolean;
  /** Ms epoch of the last lookup that produced or confirmed this entry. */
  checkedAt: number;
}

export interface CacheRules {
  musicbrainzTtlDays: number;
  audioRecheckDays: number;
  notFoundTtlDays: number;
  modelVersion: string;
}

export type CacheDecision =
  | { kind: "serve"; entry: GenreCacheEntry }
  /** Audio entry whose age is ≥ `audioRecheckDays`: ask MusicBrainz again, never re-run audio. */
  | { kind: "recheck-musicbrainz"; entry: GenreCacheEntry }
  /** Absent, expired, or produced by another model version. */
  | { kind: "lookup" };

export function decideCacheAction(entry: GenreCacheEntry | undefined, now: number, rules: CacheRules): CacheDecision {
  if (!entry) return { kind: "lookup" };
  const age = now - entry.checkedAt;
  const expired = (ttlDays: number) => age >= ttlDays * DAY_MS;
  switch (entry.source) {
    case "musicbrainz":
      return expired(rules.musicbrainzTtlDays) ? { kind: "lookup" } : { kind: "serve", entry };
    case "audio":
      if (entry.modelVersion !== rules.modelVersion) return { kind: "lookup" };
      return expired(rules.audioRecheckDays) ? { kind: "recheck-musicbrainz", entry } : { kind: "serve", entry };
    case "none":
      return expired(rules.notFoundTtlDays) ? { kind: "lookup" } : { kind: "serve", entry };
    default:
      return { kind: "lookup" };
  }
}

export interface GenreCacheStore {
  get(uri: string): Promise<GenreCacheEntry | undefined>;
  put(entry: GenreCacheEntry): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory store, used by tests and as a stand-in when IndexedDB is unavailable. */
export function createMemoryStore(): GenreCacheStore {
  const entries = new Map<string, GenreCacheEntry>();
  return {
    get: async (uri) => entries.get(uri),
    put: async (entry) => void entries.set(entry.uri, entry),
    clear: async () => entries.clear(),
  };
}
