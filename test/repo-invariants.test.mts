import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });

test("metadata_identity (AC32, AC42)", () => {
  const meta = JSON.parse(read("module/metadata.json"));
  assert.equal(meta.name, "spotify-genres");
  assert.deepEqual(meta.authors, ["Vexcited", "Heyian"]);
  assert.equal(meta.repository, "https://github.com/Heyian/spotify-genres");
  assert.equal(meta.preview, "https://cdn.vexcited.com/uploads/537192869-5c23ba9e-8e92-4b3b-9e0f-71a37501589e.png");
});

test("no_onnx_tracked (AC33)", () => {
  assert.equal(execFileSync("git", ["ls-files", "*.onnx"], { cwd: root, encoding: "utf8" }).trim(), "");
});

test("untouched_files (AC42)", () => {
  assert.equal(git("diff", "--quiet", "main", "--", "LICENSE", ".forgejo", "ant.lockb").status, 0);
  assert.equal(git("check-ignore", "-q", "eval/tracks.csv").status, 0);
});

test("readme_audio_section (AC33)", () => {
  const readme = read("README.md");
  const match = readme.match(/^## Audio fallback\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  assert.ok(match, "README has a ## Audio fallback section");
  const section = match[1];
  assert.match(section, /opt-in/i);
  for (const needle of ["Deezer", "preview", "CC BY-NC-SA 4.0", "huggingface.co/"]) assert.ok(section.includes(needle), needle);
  assert.ok(readme.includes("https://code.vexcited.com/spicetify/genres"));
  assert.ok(!readme.includes("<hf-user>"), "README links the real mirror");
});

test("contributing_bun (AC33)", () => {
  const contributing = read("CONTRIBUTING.md");
  for (const needle of ["bun install", "bun run build", "bun run test", "bun run check", "bun run evaluate", "essentia-reference.py"]) {
    assert.ok(contributing.includes(needle), needle);
  }
  assert.doesNotMatch(contributing, /\bant\b/);
});

test("research_pointer (AC33)", () => {
  const firstLine = read("docs/research/2026-10-06-research-audio-genre-classification.md").split("\n")[0];
  assert.ok(firstLine.includes("docs/specs/2026-10-06-audio-genre-fallback.md"), firstLine);
});

test("column_code_renders_text_only (column AC9, AC37)", () => {
  for (const file of ["module/tracklist-dom.ts", "module/column-cell.ts"]) {
    const source = read(file);
    for (const banned of ["innerHTML", "insertAdjacentHTML", 'createElement("a")', '"click"']) {
      assert.ok(!source.includes(banned), `${file} contains ${banned}`);
    }
  }
});
