/** Version suffixes dropped before comparing titles (AC19); no others. */
const BRACKET_SUFFIX = /\s*[([](?:feat\.|remastered|remaster|radio edit)[^)\]]*[)\]]\s*$/i;
const DASH_SUFFIX = /\s+-\s+(?:live|remaster(?:ed)?\b.*)$/i;

/** Normalise an artist or title for comparison (AC19). */
export function normalise(text: string): string {
  let stripped = text;
  for (let previous = ""; previous !== stripped; ) {
    previous = stripped;
    stripped = stripped.replace(BRACKET_SUFFIX, "").replace(DASH_SUFFIX, "");
  }
  return stripped
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface DeezerCandidate {
  title: string;
  title_short?: string;
  duration: number;
  preview?: string;
  artist: { name: string };
}

export interface TrackQuery {
  artist: string;
  title: string;
  durationS: number;
}

/** First candidate whose artist and title (or `title_short`) match and whose duration is within tolerance (AC20). */
export function pickCandidate(track: TrackQuery, candidates: DeezerCandidate[], toleranceS: number): DeezerCandidate | null {
  const artist = normalise(track.artist);
  const title = normalise(track.title);
  return (
    candidates.find(
      (c) =>
        normalise(c.artist?.name ?? "") === artist &&
        (normalise(c.title ?? "") === title || (c.title_short !== undefined && normalise(c.title_short) === title)) &&
        Math.abs(c.duration - track.durationS) <= toleranceS,
    ) ?? null
  );
}
