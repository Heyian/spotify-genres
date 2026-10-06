/** Turn Discogs-EffNet activations into display genres (AC24, AC25). */

const SEPARATOR = "---";

/** Mean over patches of a `[patches, classes]` activation batch. */
export function averageActivations(batch: Float32Array, patches: number, classes: number): Float32Array {
  const avg = new Float32Array(classes);
  if (patches === 0) return avg;
  for (let p = 0; p < patches; p++) for (let c = 0; c < classes; c++) avg[c] += batch[p * classes + c];
  for (let c = 0; c < classes; c++) avg[c] /= patches;
  return avg;
}

/** `Electronic---Darkwave` → `darkwave`; `Electronic` → `electronic`. */
export function displayName(label: string): string {
  const parts = label.split(SEPARATOR);
  return parts[parts.length - 1].trim().toLowerCase();
}

export interface ScoredGenres {
  genres: string[];
  scores: number[];
}

/**
 * Up to `topK` styles scoring ≥ `minConfidence`, strongest first. If none
 * qualifies, the single parent genre with the highest summed activation.
 */
export function topGenres(avg: Float32Array, labels: string[], topK: number, minConfidence: number): ScoredGenres {
  const ranked = labels
    .map((label, i) => ({ label, score: avg[i] ?? 0 }))
    .filter((x) => x.score >= minConfidence)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  if (ranked.length) return { genres: ranked.map((x) => displayName(x.label)), scores: ranked.map((x) => x.score) };

  const parents = new Map<string, number>();
  labels.forEach((label, i) => {
    const parent = label.split(SEPARATOR)[0];
    parents.set(parent, (parents.get(parent) ?? 0) + (avg[i] ?? 0));
  });
  let best: [string, number] | undefined;
  for (const entry of parents) if (!best || entry[1] > best[1]) best = entry;
  return best ? { genres: [displayName(best[0])], scores: [best[1]] } : { genres: [], scores: [] };
}
