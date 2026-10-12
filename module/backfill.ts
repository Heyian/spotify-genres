import { isCatalogueTrack, type GenreResult, type TrackRef } from "./genre-pipeline.ts";

export interface VisitDeps {
  /** Read at each pick, never cached. */
  needsLookup(track: TrackRef): boolean;
  /** URIs of the rows on screen, in on-screen order. */
  renderedUris(): string[];
}

export interface Visit {
  /** Final: the outstanding call finishes, no new pick starts. */
  stop(): void;
  addTracks(tracks: TrackRef[]): void;
  /** Clears the tried set and failure count, and resumes picking even after a failure stop. */
  restart(): void;
}

export interface Backfill {
  startVisit(tracks: TrackRef[], deps: VisitDeps): Visit;
}

const lookupable = (t: TrackRef) => isCatalogueTrack(t) && t.artist.trim() !== "" && t.title.trim() !== "";

export function createBackfill(deps: {
  resolve(track: TrackRef): Promise<GenreResult>;
  maxConsecutiveFailures: number;
}): Backfill {
  /** The one call in flight across all visits (AC21). */
  let outstanding: Promise<void> | null = null;
  let current: Visit | null = null;

  function startVisit(initial: TrackRef[], visitDeps: VisitDeps): Visit {
    current?.stop();

    const byUri = new Map<string, TrackRef>();
    const add = (tracks: TrackRef[]) => {
      for (const t of tracks) if (!byUri.has(t.uri)) byUri.set(t.uri, t);
    };
    add(initial);

    const tried = new Set<string>();
    let failures = 0;
    let halted = false;
    let stopped = false;
    let wake: (() => void) | null = null;

    const park = () => new Promise<void>((resolve) => void (wake = resolve));
    const poke = () => {
      const w = wake;
      wake = null;
      w?.();
    };

    const eligible = (t: TrackRef | undefined): t is TrackRef =>
      !!t && !tried.has(t.uri) && lookupable(t) && visitDeps.needsLookup(t);

    const pick = (): TrackRef | undefined => {
      for (const u of visitDeps.renderedUris()) {
        const t = byUri.get(u);
        if (eligible(t)) return t;
      }
      for (const t of byUri.values()) if (eligible(t)) return t;
      return undefined;
    };

    const loop = async () => {
      while (!stopped) {
        while (outstanding) await outstanding;
        if (stopped) return;
        if (halted) {
          await park();
          continue;
        }
        const next = pick();
        if (!next) {
          await park();
          continue;
        }
        tried.add(next.uri);
        // Set synchronously after the wait above, so no other visit can slip a call in.
        const call = (async () => {
          try {
            const result = await deps.resolve(next);
            if (result.reachable === false) {
              if (++failures >= deps.maxConsecutiveFailures) halted = true;
            } else if (result.reachable === true) {
              failures = 0;
            }
          } catch {
            // A rejected lookup counts as neither.
          }
        })();
        outstanding = call;
        await call;
        if (outstanding === call) outstanding = null;
      }
    };

    const visit: Visit = {
      stop() {
        stopped = true;
        poke();
      },
      addTracks(tracks) {
        add(tracks);
        poke();
      },
      restart() {
        tried.clear();
        failures = 0;
        halted = false;
        poke();
      },
    };
    current = visit;
    void loop();
    return visit;
  }

  return { startVisit };
}
