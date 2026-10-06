import { test } from "node:test";
import assert from "node:assert/strict";
import { genreItemHtml } from "../module/logic.ts";

const TITLE = 'title="Inferred from audio (MTG Discogs-EffNet, CC BY-NC-SA 4.0)"';

test("inferred_item_markup (AC29)", () => {
  const html = genreItemHtml("spotify:playlist:x", "darkwave", true);
  assert.ok(html.includes('class="spicetify-genres-item spicetify-genres-inferred"'), html);
  assert.ok(html.includes(TITLE), html);
  assert.ok(html.includes('href="spotify:playlist:x"'), html);
  assert.match(html, />≈\s*Darkwave</);
});

test("musicbrainz_item_markup (AC29)", () => {
  const html = genreItemHtml("spotify:playlist:x", "rock", false);
  assert.ok(!html.includes("≈"));
  assert.ok(!html.includes("title="));
  assert.ok(!html.includes("spicetify-genres-inferred"));
  assert.equal(html, '<a class="spicetify-genres-item" href="spotify:playlist:x">Rock</a>');
});

test("unresolved_playlist_non_navigable (AC30)", () => {
  const html = genreItemHtml(null, "darkwave", true);
  assert.ok(html.includes('href="#"'));
  assert.ok(html.includes("spicetify-genres-inferred"));
});

test("escapes_html", () => {
  const html = genreItemHtml(null, "<b>", false);
  assert.ok(!html.includes("<b>"));
  assert.ok(html.includes("&lt;b&gt;"));
});
