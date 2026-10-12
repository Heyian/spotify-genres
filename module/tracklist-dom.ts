/**
 * The only file that knows Spotify's tracklist markup. Everything here is text-only DOM work.
 *
 * Selectors and attribute behaviour were probed live on Spotify 1.2.96.518 (2026-10-11):
 * - The list root is `.main-trackList-trackList` with an inline `--grid-template-columns` and `aria-colcount`.
 * - Both the wide and narrow templates contain `[last]`; narrow drops `[var1]`/`[var2]`.
 * - Hidden columns stay in the DOM: rows keep 5 `[aria-colindex]` cells at every width, and
 *   `.main-trackList-rowSectionEnd` keeps `aria-colindex="5"` while `aria-colcount` is 3 when narrow.
 *   So positions are never derived from `aria-colcount`; the end cell's own `aria-colindex` is read and bumped.
 * - The row element carries `__reactProps$*`; the track uri sits at `children.props.value.item.uri`.
 */
import type { CellView } from "./column-cell.ts";

export const GENRES_TRACK = "minmax(120px, 2fr)";

const URI_PATTERN = /^spotify:(track|episode|local):/;
const MAX_VISITED = 5000;

/** Inserts the Genres track before `[last]`. Null without `[last]`; unchanged if already present. */
export function withGenresColumn(template: string): string | null {
  if (template.includes("[genres]")) return template;
  const at = template.indexOf("[last]");
  if (at === -1) return null;
  return template.slice(0, at) + "[genres] " + GENRES_TRACK + " " + template.slice(at);
}

/** Breadth-first search for the shallowest `uri` property that is a track, episode or local uri. */
export function findRowUri(props: unknown, maxDepth = 10): string | null {
  const seen = new Set<object>();
  let level: object[] = [];
  if (props && typeof props === "object") {
    level = [props];
    seen.add(props);
  }
  for (let depth = 0; level.length && depth <= maxDepth; depth++) {
    const next: object[] = [];
    for (const node of level) {
      try {
        const own = (node as { uri?: unknown }).uri;
        if (typeof own === "string" && URI_PATTERN.test(own)) return own;
        if (depth === maxDepth) continue;
        for (const key of Object.keys(node)) {
          const child = (node as Record<string, unknown>)[key];
          if (child && typeof child === "object" && !seen.has(child) && seen.size < MAX_VISITED) {
            seen.add(child);
            next.push(child);
          }
        }
      } catch {
        // A hostile getter or proxy: skip this node.
      }
    }
    level = next;
  }
  return null;
}

export const SELECTORS = {
  list: ".main-trackList-trackList",
  headerRow: ".main-trackList-trackListHeaderRow",
  row: ".main-trackList-trackListRow",
  sectionEnd: ".main-trackList-rowSectionEnd",
};

const STYLE_ID = "spotify-genres-column-style";
const LIST_ATTR = "data-genres-col";
const CELL_ATTR = "data-genres-cell";
const HEADER_ATTR = "data-genres-header";
const NATIVE_COLCOUNT = "data-genres-native-colcount";
const WRITTEN_COLCOUNT = "data-genres-written-colcount";
const NATIVE_COLINDEX = "data-genres-native-colindex";
const WRITTEN_COLINDEX = "data-genres-written-colindex";
let listCounter = 0;

export interface ListRule {
  id: string;
  template: string;
}

/** One grid rule per installed list (keyed by its marker value), plus the shared cell rules. */
export function columnStyleText(rules: ListRule[]): string {
  const perList = rules.map((r) => `${SELECTORS.list}[${LIST_ATTR}="${r.id}"] { --grid-template-columns: ${r.template} !important; }`);
  return [
    ...perList,
    `[${CELL_ATTR}], [${HEADER_ATTR}] { grid-column: genres; align-self: center; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }`,
    `[${CELL_ATTR}].spotify-genres-cell--inferred { font-style: italic; }`,
  ].join("\n");
}

const STATES = ["genres", "waiting", "none", "empty"];

/** Sets `name` to Spotify's value + 1. The native value is re-read whenever the attribute is not what we wrote. */
function bumpAttribute(el: HTMLElement, name: string, nativeKey: string, writtenKey: string): number | null {
  const current = el.getAttribute(name);
  if (current === null) return null;
  if (current !== el.getAttribute(writtenKey)) el.setAttribute(nativeKey, current);
  const native = Number(el.getAttribute(nativeKey));
  if (!Number.isFinite(native)) return null;
  const bumped = String(native + 1);
  if (current !== bumped) el.setAttribute(name, bumped);
  el.setAttribute(writtenKey, bumped);
  return native;
}

function restoreAttribute(el: Element, name: string, nativeKey: string, writtenKey: string): void {
  const native = el.getAttribute(nativeKey);
  if (native !== null) el.setAttribute(name, native);
  el.removeAttribute(nativeKey);
  el.removeAttribute(writtenKey);
}

function styleElement(doc: Document): HTMLStyleElement {
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  return style;
}

export function rowUri(row: HTMLElement): string | null {
  const key = Object.keys(row).find((k) => k.startsWith("__reactProps$"));
  if (key) {
    const found = findRowUri((row as unknown as Record<string, unknown>)[key]);
    if (found) return found;
  }
  const href = row.querySelector<HTMLAnchorElement>('a[href*="/track/"]')?.getAttribute("href");
  const id = href?.match(/\/track\/([A-Za-z0-9]+)/)?.[1];
  return id ? "spotify:track:" + id : null;
}

/** True when the list is unmarked, its grid variable differs from `lastTemplate`, or its header lacks our cell. */
export function listNeedsInstall(list: HTMLElement, lastTemplate: string | undefined): boolean {
  if (!list.hasAttribute(LIST_ATTR)) return true;
  if (list.style.getPropertyValue("--grid-template-columns") !== lastTemplate) return true;
  const header = list.querySelector<HTMLElement>(SELECTORS.headerRow);
  return !!header && !header.querySelector(`:scope > [${HEADER_ATTR}]`);
}

/** Adds the Genres track and header cell to one tracklist. Safe to call on every observer pass. */
export function installColumn(list: HTMLElement): boolean {
  const template = list.style.getPropertyValue("--grid-template-columns");
  const widened = withGenresColumn(template);
  if (widened === null) return false;

  if (!list.getAttribute(LIST_ATTR)) list.setAttribute(LIST_ATTR, String(++listCounter));
  const rules: ListRule[] = [];
  for (const marked of list.ownerDocument.querySelectorAll<HTMLElement>(`[${LIST_ATTR}]`)) {
    const own = withGenresColumn(marked.style.getPropertyValue("--grid-template-columns"));
    if (own !== null) rules.push({ id: marked.getAttribute(LIST_ATTR) as string, template: own });
  }
  const style = styleElement(list.ownerDocument);
  const text = columnStyleText(rules);
  if (style.textContent !== text) style.textContent = text;

  bumpAttribute(list, "aria-colcount", NATIVE_COLCOUNT, WRITTEN_COLCOUNT);

  const header = list.querySelector<HTMLElement>(SELECTORS.headerRow);
  if (header) {
    let cell = header.querySelector<HTMLElement>(`:scope > [${HEADER_ATTR}]`);
    const end = header.querySelector<HTMLElement>(`:scope > ${SELECTORS.sectionEnd}`);
    if (!cell) {
      cell = list.ownerDocument.createElement("div");
      cell.setAttribute(HEADER_ATTR, "");
      cell.setAttribute("role", "columnheader");
      cell.textContent = "Genres";
      header.insertBefore(cell, end);
    }
    if (end) {
      const native = bumpAttribute(end, "aria-colindex", NATIVE_COLINDEX, WRITTEN_COLINDEX);
      if (native !== null) cell.setAttribute("aria-colindex", String(native));
    }
  }
  return true;
}

/** Returns the row's Genres cell, creating it before the end section if needed. */
export function ensureRowCell(row: HTMLElement): HTMLElement {
  const end = row.querySelector<HTMLElement>(`:scope > ${SELECTORS.sectionEnd}`);
  let cell = row.querySelector<HTMLElement>(`:scope > [${CELL_ATTR}]`);
  if (!cell) {
    cell = row.ownerDocument.createElement("div");
    cell.setAttribute(CELL_ATTR, "");
    cell.setAttribute("role", "gridcell");
    cell.className = "spotify-genres-cell";
    row.insertBefore(cell, end);
  }
  if (end) {
    const native = bumpAttribute(end, "aria-colindex", NATIVE_COLINDEX, WRITTEN_COLINDEX);
    if (native !== null) cell.setAttribute("aria-colindex", String(native));
  }
  return cell;
}

export function renderCell(cell: HTMLElement, view: CellView, uri: string | null): void {
  cell.textContent = view.text;
  cell.title = view.title;
  for (const state of STATES) cell.classList.toggle("spotify-genres-cell--" + state, state === view.state);
  cell.classList.toggle("spotify-genres-cell--inferred", view.inferred);
  if (uri) cell.setAttribute("data-genres-uri", uri);
  else cell.removeAttribute("data-genres-uri");
}

/** Removes everything the column added and restores Spotify's own attribute values (AC15). */
export function uninstallColumn(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove();
  doc.querySelectorAll(`[${CELL_ATTR}], [${HEADER_ATTR}]`).forEach((el) => el.remove());
  doc.querySelectorAll(`[${NATIVE_COLINDEX}]`).forEach((el) => restoreAttribute(el, "aria-colindex", NATIVE_COLINDEX, WRITTEN_COLINDEX));
  doc.querySelectorAll(`[${LIST_ATTR}]`).forEach((el) => {
    restoreAttribute(el, "aria-colcount", NATIVE_COLCOUNT, WRITTEN_COLCOUNT);
    el.removeAttribute(LIST_ATTR);
  });
}
