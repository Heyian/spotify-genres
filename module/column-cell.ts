import { INFERRED_TITLE, columnMaxGenres } from "./config.ts";
import type { GenreCacheEntry } from "./genre-cache.ts";
import { isCatalogueTrack, type TrackRef } from "./genre-pipeline.ts";
import { prettifyGenre } from "./logic.ts";

export type CellState = "genres" | "waiting" | "none" | "empty";
export interface CellView {
  state: CellState;
  text: string;
  title: string;
  inferred: boolean;
}

export const WAITING_TEXT = "…", WAITING_TITLE = "Looking up genres";
export const NONE_TEXT = "—", NONE_TITLE = "No genres found";

const EMPTY: CellView = { state: "empty", text: "", title: "", inferred: false };
const WAITING: CellView = { state: "waiting", text: WAITING_TEXT, title: WAITING_TITLE, inferred: false };
const NONE: CellView = { state: "none", text: NONE_TEXT, title: NONE_TITLE, inferred: false };

const genresView = (genres: string[], inferred: boolean): CellView => {
  const pretty = genres.map(prettifyGenre);
  return {
    state: "genres",
    text: (inferred ? "≈ " : "") + pretty.slice(0, columnMaxGenres).join(", "),
    title: pretty.join(", ") + (inferred ? " — " + INFERRED_TITLE : ""),
    inferred,
  };
};

/** What one playlist row's Genres cell shows. Never looks at the entry's age (AC8). */
export function cellView(uri: string | null, track: TrackRef | undefined, entry: GenreCacheEntry | undefined, audioEnabled: boolean): CellView {
  if (!uri || !uri.startsWith("spotify:track:")) return EMPTY;
  if (track && (!isCatalogueTrack(track) || !track.artist.trim() || !track.title.trim())) return EMPTY;
  if (!entry) return WAITING;
  switch (entry.source) {
    case "audio":
      return audioEnabled && entry.genres.length ? genresView(entry.genres, true) : WAITING;
    case "musicbrainz":
      return entry.genres.length ? genresView(entry.genres, false) : NONE;
    default:
      return NONE;
  }
}
