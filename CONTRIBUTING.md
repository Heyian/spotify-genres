## Setup

```sh
git clone https://github.com/Heyian/spotify-genres
cd spotify-genres
bun install
```

## Check and test

```sh
bun run check   # tsc for the module and for test/ + scripts/, then spicetify-kit check
bun run test    # node --test "test/*.test.mts"
```

Tests import modules with their `.ts` extension and run under Node's type stripping, so modules they import must not import `/modules/stdlib/...` and must not use enums, namespaces or parameter properties.

## Watch

```sh
bun run build
bun run dev
```

`bun run dev` hot-pushes into a client started with `--remote-debugging-port=9229`; add `--launch` to let the kit start Spotify itself.

## Build and install

```bash
bun run build
bunx spicetify-kit install dist/spotify-genres@*
```

## Checking the playlist column

Spotify tracklist selectors live in `module/tracklist-dom.ts`. After a Spotify update, run the live check in §5.1 of `docs/specs/2026-10-10-playlist-genres-column.md`.

## Evaluation workflow

The evaluation report measures how often the audio fallback finds a Deezer preview and how often its top 3 styles match your own labels. It needs `ffmpeg` on your `PATH` and the model mirror folder.

1. Build the mirror folder (downloads the model and labels from essentia.upf.edu, which is slow and sometimes down; rerun on failure):

   ```sh
   bash scripts/prepare-model-mirror.sh ~/.cache/spotify-genres/mirror
   ```

2. Copy the example set and add about 50 rows (`eval/tracks.csv` is git-ignored):

   ```sh
   cp eval/tracks.example.csv eval/tracks.csv
   ```

   Columns: `artist,title,duration_s,expected_genres`. `duration_s` is the track length in seconds; `expected_genres` are your labels separated by `;`, written like Discogs styles (`darkwave;post-punk`).

3. Run the report:

   ```sh
   bun run evaluate eval/tracks.csv
   # or with a model elsewhere:
   bun run evaluate eval/tracks.csv --model /path/to/discogs-effnet-bsdynamic-1.onnx
   ```

   Each row prints whether a preview was found, the top 3 styles with scores, and hit/miss; the last line prints preview coverage and top-3 hit rate.

## Regenerating the mel fixture

`module/mel.ts` must match Essentia's `TensorflowInputMusiCNN` front-end. The parity fixture in `test/fixtures/` is generated with Essentia itself:

```sh
uv run --python 3.11 --with essentia-tensorflow --with numpy \
  python scripts/essentia-reference.py test/fixtures
```

It writes a synthetic 3 s signal, Essentia's mel bands for it, and the frame/patch counts that `test/mel.test.mts` checks (including 29 patches for 30 s of audio).
