import { decideCacheAction, type CacheRules, type GenreCacheEntry, type GenreCacheStore } from "./genre-cache.ts";
import type { ScoredGenres } from "./labels.ts";
import type { GenreFetchOutcome } from "./logic.ts";
import { DroppedError, type Priority } from "./request-queue.ts";

export interface TrackRef {
  uri: string;
  artist: string;
  title: string;
  durationS: number | null;
  isLocal: boolean;
  isTrack: boolean;
}

export const isCatalogueTrack = (t: TrackRef | undefined): t is TrackRef => !!t && t.isTrack && !t.isLocal;

/** Empty `genres` means "clear the row". */
export interface GenreResult {
  genres: string[];
  inferred: boolean;
}

export interface PipelineDeps {
  store: GenreCacheStore;
  rules: CacheRules;
  now(): number;
  /** Queued MusicBrainz lookup (the caller enqueues under key `track.uri`); may throw `DroppedError`. */
  musicbrainz(track: TrackRef, priority: Priority): Promise<GenreFetchOutcome>;
  audioEnabled(): boolean;
  modelReady(): boolean;
  /** Queued Deezer search; may throw `DroppedError`. */
  findPreview(track: TrackRef & { durationS: number }, priority: Priority): Promise<string | null>;
  /** Fetch, decode, mel, inference and label selection; throws on failure. */
  classifyPreview(url: string): Promise<ScoredGenres>;
  /** Bumped by "Clear genre cache"; a lookup that spans a bump writes nothing (AC38). */
  cacheEpoch(): number;
}

const CLEARED: GenreResult = { genres: [], inferred: false };

/** Cache → MusicBrainz → audio for one track (spec §4.2). */
export async function resolveTrack(track: TrackRef, deps: PipelineDeps, priority: Priority): Promise<GenreResult> {
  if (!isCatalogueTrack(track)) return CLEARED;

  const epoch = deps.cacheEpoch();
  // A failing store degrades to "no cache" (Review Focus 5).
  const put = async (entry: GenreCacheEntry) => {
    if (deps.cacheEpoch() !== epoch) return;
    try {
      await deps.store.put(entry);
    } catch {
      // ignore: the result still renders
    }
  };
  let cached: GenreCacheEntry | undefined;
  try {
    cached = await deps.store.get(track.uri);
  } catch {
    cached = undefined;
  }

  const decision = decideCacheAction(cached, deps.now(), deps.rules);
  if (decision.kind === "serve") {
    return { genres: decision.entry.genres, inferred: decision.entry.source === "audio" };
  }

  let mb: GenreFetchOutcome;
  try {
    mb = await deps.musicbrainz(track, priority);
  } catch (error) {
    if (error instanceof DroppedError) throw error;
    mb = { genres: [], reachable: false, reason: String(error) };
  }

  const musicbrainzEntry = (): GenreCacheEntry => ({ uri: track.uri, genres: mb.genres, source: "musicbrainz", checkedAt: deps.now() });

  if (decision.kind === "recheck-musicbrainz") {
    const { entry } = decision;
    if (mb.genres.length) {
      await put(musicbrainzEntry());
      return { genres: mb.genres, inferred: false };
    }
    if (mb.reachable) await put({ ...entry, checkedAt: deps.now() });
    return { genres: entry.genres, inferred: true };
  }

  if (mb.genres.length) {
    await put(musicbrainzEntry());
    return { genres: mb.genres, inferred: false };
  }

  const writeNone = async () => {
    if (mb.reachable) await put({ uri: track.uri, genres: [], source: "none", checkedAt: deps.now() });
  };

  if (!deps.audioEnabled()) {
    await writeNone();
    return CLEARED;
  }
  // Skipped audio step: no `none` entry, so a later play can still try (AC6, Review Focus 2).
  if (!deps.modelReady() || track.durationS === null || !track.artist.trim()) return CLEARED;

  let preview: string | null;
  try {
    preview = await deps.findPreview({ ...track, durationS: track.durationS }, priority);
  } catch (error) {
    if (error instanceof DroppedError) throw error;
    return CLEARED;
  }
  if (!preview) {
    await writeNone();
    return CLEARED;
  }

  let scored: ScoredGenres;
  try {
    scored = await deps.classifyPreview(preview);
  } catch {
    return CLEARED; // AC36: the next play retries
  }
  if (!scored.genres.length) return CLEARED;

  await put({
    uri: track.uri,
    genres: scored.genres,
    scores: scored.scores,
    source: "audio",
    modelVersion: deps.rules.modelVersion,
    checkedAt: deps.now(),
  });
  return { genres: scored.genres, inferred: true };
}
