import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SELECTORS, columnStyleText, ensureRowCell, installColumn, withGenresColumn } from "../module/tracklist-dom.ts";

const grid = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/tracklist-grid.json"), "utf8")) as { wide: string };

test("list_selector_matches_only_the_playlists_own_tracklist (column AC1)", () => {
  // Live (1.2.96.518): the playlist grid is data-testid="playlist-tracklist"; the Recommended grid is "track-list".
  assert.equal(SELECTORS.list, '.main-trackList-trackList[data-testid="playlist-tracklist"]');
  assert.ok(!SELECTORS.list.includes('"track-list"'));
  const css = columnStyleText([{ id: "1", template: withGenresColumn(grid.wide) as string }]);
  assert.ok(
    css.startsWith(`${SELECTORS.list}[data-genres-col="1"] { --grid-template-columns: `),
    css,
  );
});

/** Minimal element stand-in: just what installColumn and ensureRowCell touch. Counts every setAttribute call. */
class FakeEl {
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  className = "";
  id = "";
  textContent = "";
  style = { getPropertyValue: (_name: string): string => "" };
  doc: FakeDoc;
  classes: string[];
  constructor(doc: FakeDoc, classes: string[] = []) {
    this.doc = doc;
    this.classes = classes;
  }
  get ownerDocument(): FakeDoc {
    return this.doc;
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  setAttribute(name: string, value: string): void {
    this.doc.writes.push(name);
    this.attrs.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  append(child: FakeEl): FakeEl {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  appendChild(child: FakeEl): FakeEl {
    return this.append(child);
  }
  insertBefore(child: FakeEl, ref: FakeEl | null): void {
    child.parent = this;
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at === -1) this.children.push(child);
    else this.children.splice(at, 0, child);
  }
  matches(simple: string): boolean {
    if (simple.startsWith(".")) return this.classes.includes(simple.slice(1));
    const attr = simple.match(/^\[([^\]=]+)\]$/);
    return attr ? this.attrs.has(attr[1]) : false;
  }
  // Supports `:scope > X` (direct children) and `X` (descendants) for a single class or attribute selector.
  querySelector(selector: string): FakeEl | null {
    const direct = selector.startsWith(":scope > ");
    const simple = direct ? selector.slice(":scope > ".length) : selector;
    const pool = direct ? this.children : this.descendants();
    return pool.find((el) => el.matches(simple)) ?? null;
  }
  descendants(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
}

class FakeDoc {
  writes: string[] = [];
  head = new FakeEl(this);
  body = new FakeEl(this);
  createElement(_tag: string): FakeEl {
    return new FakeEl(this);
  }
  getElementById(id: string): FakeEl | null {
    return this.head.children.find((el) => el.id === id) ?? null;
  }
  querySelectorAll(selector: string): FakeEl[] {
    return this.body.descendants().filter((el) => el.matches(selector));
  }
}

function buildPlaylist(): { doc: FakeDoc; list: FakeEl; rows: FakeEl[] } {
  const doc = new FakeDoc();
  const list = doc.body.append(new FakeEl(doc, ["main-trackList-trackList"]));
  list.attrs.set("aria-colcount", "5");
  list.style = { getPropertyValue: () => grid.wide };
  const header = list.append(new FakeEl(doc, ["main-trackList-trackListHeaderRow"]));
  header.append(new FakeEl(doc, ["main-trackList-rowSectionEnd"])).attrs.set("aria-colindex", "5");
  const rows = [1, 2].map(() => {
    const row = list.append(new FakeEl(doc, ["main-trackList-trackListRow"]));
    row.append(new FakeEl(doc, ["main-trackList-rowSectionEnd"])).attrs.set("aria-colindex", "5");
    return row;
  });
  return { doc, list, rows };
}

function pass(list: FakeEl, rows: FakeEl[]): void {
  assert.ok(installColumn(list as never));
  for (const row of rows) ensureRowCell(row as never);
}

test("a_second_pass_over_unchanged_state_writes_no_attributes", () => {
  const { doc, list, rows } = buildPlaylist();
  pass(list, rows);
  assert.ok(doc.writes.length > 0, "first pass installs the column");
  assert.equal(list.getAttribute("aria-colcount"), "6");
  assert.equal(rows[0].children[0].getAttribute("aria-colindex"), "5");
  assert.equal(rows[0].children[1].getAttribute("aria-colindex"), "6");
  doc.writes.length = 0;
  pass(list, rows);
  assert.deepEqual(doc.writes, []);
});
