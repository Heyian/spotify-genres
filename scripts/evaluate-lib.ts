/** Pure helpers for scripts/evaluate.mts (AC34). */

export interface EvalRow {
  artist: string;
  title: string;
  durationS: number;
  expected: string[];
}

/** Split one CSV line, honouring double-quoted fields and `""` escapes. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      fields.push(field);
      field = "";
    } else field += c;
  }
  fields.push(field);
  return fields.map((f) => f.trim());
}

/** Header `artist,title,duration_s,expected_genres`; genres separated by `;`. */
export function parseTracksCsv(text: string): EvalRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = splitCsvLine(lines.shift() ?? "");
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`tracks CSV is missing the "${name}" column`);
    return i;
  };
  const [artist, title, duration, expected] = ["artist", "title", "duration_s", "expected_genres"].map(col);
  return lines.map((line) => {
    const f = splitCsvLine(line);
    return {
      artist: f[artist],
      title: f[title],
      durationS: Number(f[duration]),
      expected: (f[expected] ?? "").split(";").map((g) => g.trim()).filter(Boolean),
    };
  });
}

/** A hit when any lowercased expected label equals one of the top-3 style names. */
export function isHit(expected: string[], top3: string[]): boolean {
  const styles = new Set(top3.map((s) => s.toLowerCase()));
  return expected.some((e) => styles.has(e.toLowerCase()));
}

/** Coverage = rows with a preview ÷ all rows; hit rate = hits ÷ rows with a preview. */
export function summarise(rows: Array<{ preview: boolean; hit: boolean }>): { coveragePct: number; hitRatePct: number } {
  const withPreview = rows.filter((r) => r.preview);
  const hits = withPreview.filter((r) => r.hit).length;
  return {
    coveragePct: rows.length ? (withPreview.length / rows.length) * 100 : 0,
    hitRatePct: withPreview.length ? (hits / withPreview.length) * 100 : 0,
  };
}
