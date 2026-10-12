import type { Backfill, Visit } from "./backfill.ts";
import { cellView } from "./column-cell.ts";
import type { CacheRules, GenreCacheEntry, ObservableGenreStore } from "./genre-cache.ts";
import { needsLookup, type TrackRef } from "./genre-pipeline.ts";
import { SELECTORS, ensureRowCell, installColumn, listNeedsInstall, renderCell, rowUri, uninstallColumn } from "./tracklist-dom.ts";

const RELIST_DEBOUNCE_MS = 2000;
const TRACK_PREFIX = "spotify:track:";

/** "/playlist/abc" → "spotify:playlist:abc"; any other page → null (AC17). */
export function playlistUriFromPath(pathname: string): string | null {
  const id = pathname.match(/^\/playlist\/([A-Za-z0-9]+)\/?$/)?.[1];
  return id ? "spotify:playlist:" + id : null;
}

export interface PlaylistColumnDeps {
  store: ObservableGenreStore;
  backfill: Backfill;
  history: { location: { pathname: string }; listen(cb: (location: { pathname: string }) => void): () => void };
  listTracks(playlistUri: string, signal: AbortSignal): Promise<TrackRef[]>;
  audioEnabled(): boolean;
  modelReady(): boolean;
  now(): number;
  rules: CacheRules;
  log(level: "warn" | "debug", ...args: unknown[]): void;
}

export function startPlaylistColumn(deps: PlaylistColumnDeps): { stop(): void } {
  let stopped = false;
  // Per-visit state, reset by leaveVisit().
  let playlistUri: string | null = null;
  let controller: AbortController | null = null;
  let visit: Visit | null = null;
  let generation = 0; // bumped on every page change
  let epoch = 0; // bumped on page change and cache clear; guards cache reads
  let listed = false;
  let warnedNoLast = false;
  let relistTimer: ReturnType<typeof setTimeout> | null = null;
  let rendered: string[] = [];
  const entries = new Map<string, GenreCacheEntry>();
  const tracks = new Map<string, TrackRef>();
  const requested = new Set<string>();
  const relistedFor = new Set<string>();
  /** Grid variable each list was last installed with; false when installColumn refused it. */
  const installedWith = new WeakMap<HTMLElement, { template: string; ok: boolean }>();
  const painted = new WeakMap<HTMLElement, string>();

  const fail = (what: string) => (error: unknown) => deps.log("warn", what, error);

  function leaveVisit(): void {
    generation++;
    epoch++;
    controller?.abort();
    controller = null;
    visit?.stop();
    visit = null;
    if (relistTimer) clearTimeout(relistTimer);
    relistTimer = null;
    listed = false;
    warnedNoLast = false;
    rendered = [];
    entries.clear();
    tracks.clear();
    requested.clear();
    relistedFor.clear();
  }

  let frame: number | null = null;
  function schedulePass(): void {
    if (stopped || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      try {
        pass();
      } catch (error) {
        deps.log("warn", "playlist column pass failed", error);
      }
    });
  }

  /** Skips identical repaints: a textContent write is a childList mutation and would retrigger the observer. */
  function paint(cell: HTMLElement, uri: string | null, entry: GenreCacheEntry | undefined): void {
    const view = cellView(uri, uri ? tracks.get(uri) : undefined, entry, deps.audioEnabled());
    const key = [uri ?? "", view.state, view.text, view.title, view.inferred].join("\u0000");
    if (painted.get(cell) === key && cell.isConnected) return;
    renderCell(cell, view, uri);
    painted.set(cell, key);
  }

  function pass(): void {
    if (stopped || !playlistUri) return;
    const seen: string[] = [];
    const missing = new Set<string>();
    for (const list of document.querySelectorAll<HTMLElement>(SELECTORS.list)) {
      const last = installedWith.get(list);
      let ok = last?.ok ?? false;
      if (!last || !ok || listNeedsInstall(list, last.template)) {
        ok = installColumn(list);
        installedWith.set(list, { template: list.style.getPropertyValue("--grid-template-columns"), ok });
      }
      if (!ok) {
        if (!warnedNoLast) {
          warnedNoLast = true;
          deps.log("warn", "genres column not installed: tracklist grid has no [last] line name");
        }
        continue;
      }
      for (const row of list.querySelectorAll<HTMLElement>(SELECTORS.row)) {
        // Rows are reused by the virtual list, so the uri is re-derived every pass (AC10).
        const uri = rowUri(row);
        paint(ensureRowCell(row), uri, uri ? entries.get(uri) : undefined);
        if (!uri) continue;
        seen.push(uri);
        if (uri.startsWith(TRACK_PREFIX) && !entries.has(uri) && !requested.has(uri)) missing.add(uri);
      }
    }
    rendered = seen;

    if (missing.size) {
      const ep = epoch;
      for (const uri of missing) requested.add(uri);
      deps.store
        .getMany([...missing])
        .then((found) => {
          if (ep !== epoch) return;
          for (const [uri, entry] of found) if (!entries.has(uri)) entries.set(uri, entry);
          schedulePass();
        })
        .catch(fail("genre cache read failed"));
    }

    if (listed && !relistTimer) {
      const unknown = seen.filter((u) => u.startsWith(TRACK_PREFIX) && !tracks.has(u) && !relistedFor.has(u));
      if (unknown.length) {
        for (const u of unknown) relistedFor.add(u);
        relistTimer = setTimeout(() => {
          relistTimer = null;
          relist();
        }, RELIST_DEBOUNCE_MS);
      }
    }
  }

  /** AC32: tracks added to the playlist after the first listing. */
  function relist(): void {
    const ctl = controller;
    const uri = playlistUri;
    const gen = generation;
    if (!ctl || !uri || ctl.signal.aborted) return;
    deps
      .listTracks(uri, ctl.signal)
      .then(async (all) => {
        if (gen !== generation || ctl.signal.aborted) return;
        const fresh = all.filter((t) => !tracks.has(t.uri));
        if (!fresh.length) return;
        const ep = epoch;
        const found = await deps.store.getMany(fresh.map((t) => t.uri));
        if (gen !== generation || ctl.signal.aborted) return;
        if (ep === epoch) {
          for (const [u, entry] of found) if (!entries.has(u)) entries.set(u, entry);
          for (const t of fresh) requested.add(t.uri);
        }
        for (const t of fresh) tracks.set(t.uri, t);
        visit?.addTracks(fresh);
        schedulePass();
      })
      .catch((error) => {
        if (!ctl.signal.aborted) deps.log("warn", "playlist re-list failed", error);
      });
  }

  function beginVisit(uri: string): void {
    playlistUri = uri;
    const ctl = new AbortController();
    controller = ctl;
    const gen = generation;
    deps
      .listTracks(uri, ctl.signal)
      .then(async (list) => {
        if (gen !== generation || ctl.signal.aborted) return;
        const ep = epoch;
        const found = await deps.store.getMany(list.map((t) => t.uri));
        if (gen !== generation || ctl.signal.aborted) return;
        if (ep === epoch) {
          for (const [u, entry] of found) if (!entries.has(u)) entries.set(u, entry);
          for (const t of list) requested.add(t.uri);
        }
        for (const t of list) tracks.set(t.uri, t);
        listed = true;
        visit = deps.backfill.startVisit(list, {
          needsLookup: (t) => needsLookup(entries.get(t.uri), deps.now(), deps.rules, deps.audioEnabled(), deps.modelReady()),
          renderedUris: () => rendered,
        });
        schedulePass();
      })
      .catch((error) => {
        // Listing failed: no visit, but cells keep rendering from the cache.
        if (!ctl.signal.aborted) deps.log("warn", "playlist listing failed; no backfill", error);
      });
    schedulePass();
  }

  function pageChanged(pathname: string): void {
    const uri = playlistUriFromPath(pathname);
    // Same playlist (re-click, or a `replace` on the same path): keep the visit, cells and tried set.
    if (uri && uri === playlistUri) return;
    leaveVisit();
    if (!uri) {
      playlistUri = null;
      uninstallColumn(document);
      return;
    }
    beginVisit(uri);
  }

  const unsubscribeStore = deps.store.subscribe((change) => {
    try {
      if (change.kind === "put") {
        entries.set(change.entry.uri, change.entry);
        requested.add(change.entry.uri);
      } else {
        epoch++; // drop reads that started before the clear
        entries.clear();
        requested.clear();
        visit?.restart();
      }
      schedulePass();
    } catch (error) {
      deps.log("warn", "genre cache change handler failed", error);
    }
  });

  const unlisten = deps.history.listen((location) => pageChanged(location.pathname));

  const observer = new MutationObserver(schedulePass);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "aria-colcount"] });

  pageChanged(deps.history.location.pathname);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribeStore();
      unlisten();
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      leaveVisit();
      playlistUri = null;
      uninstallColumn(document);
    },
  };
}
