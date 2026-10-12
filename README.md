# spotify-genres

> **This is a fork** of [genres](https://code.vexcited.com/spicetify/genres) by [Vexcited](https://code.vexcited.com/Vexcited). It adds an audio fallback for tracks MusicBrainz has no genres for, and a Genres column on playlist pages. For the original extension, go to [code.vexcited.com/spicetify/genres](https://code.vexcited.com/spicetify/genres).

## Install

With a [Spicetify](https://github.com/spicetify/spicetify-cli) build that supports v3 modules:

```sh
spicetify pkg install spotify-genres@0.2.0 https://github.com/Heyian/spotify-genres/releases/download/0.2.0/spotify-genres.zip
spicetify pkg enable spotify-genres@0.2.0
spicetify apply
```

`pkg install` downloads the zip into the Spicetify store, `pkg enable` turns it on, and `spicetify apply` adds it to Spotify and restarts Spotify. For another version, use the command on its [release page](https://github.com/Heyian/spotify-genres/releases). The version appears twice: in the id, which the CLI requires as `name@version`, and in the URL.

This fork is not in the Spicetify store, so the CLI installs the release zip directly and warns that nothing verifies the download. Each release lists the zip's SHA-256 so you can compare it with the one the CLI prints.

If the upstream `genres` extension is installed too, disable or remove it in the Spicetify store to avoid two genre rows.

## Credits

This extension is a fork of [genres](https://code.vexcited.com/spicetify/genres) by Mikkel ALMONTE--RINGAUD ([Vexcited](https://code.vexcited.com/Vexcited)), released under the MIT licence. All credit for the original extension goes to them.

The optional audio fallback uses the Discogs-EffNet model and Genre Discogs400 labels by the [Music Technology Group (MTG)](https://www.upf.edu/web/mtg) at Universitat Pompeu Fabra, published with [Essentia](https://essentia.upf.edu/models.html) under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The extension downloads an unmodified copy from a Hugging Face mirror; the model is not part of this repository and is not covered by its MIT licence.

## Previews

Genres will be displayed below the author in current track information.

![genres](https://cdn.vexcited.com/uploads/537192869-5c23ba9e-8e92-4b3b-9e0f-71a37501589e.png)

If available, clicking on a genre will bring the Spotify-made playlist with related tracks of this specific genre.

![spotify-made playlist](https://cdn.vexcited.com/uploads/537193777-b048c96f-8929-4af2-83fe-8e84b0b3b4d3.png)

Playlist pages also show a Genres column in the tracklist (see [Playlist column](#playlist-column)).

## Audio fallback

Genres come from MusicBrainz. When MusicBrainz has no genre for the playing track, or cannot be reached, the extension can infer up to three genres from the track's audio instead. Inferred genres are shown in italics with a "≈" prefix, and hovering one shows where it came from.

The audio fallback is **opt-in** and off by default. Turn it on in Settings → **Genres** → "Infer genres from audio previews when MusicBrainz has none". The status row shows `Not downloaded`, `Downloading n%`, `Ready` or `Failed — Retry`.

What leaves your machine when it is on:

- The track's **artist and title are sent to Deezer** (`api.deezer.com`) to find the matching track.
- The track's 30-second **Deezer preview** MP3 is downloaded and analysed locally. It is kept in memory only and never stored.
- On first use, the model (about 18 MB) and its labels are downloaded once from the Hugging Face mirror [`huggingface.co/Heyian/discogs-effnet-onnx`](https://huggingface.co/Heyian/discogs-effnet-onnx), and the ONNX Runtime Web files from jsDelivr. They are cached for later sessions.

Inference runs inside Spotify with ONNX Runtime Web; nothing is sent to a hosted model. The model is MTG's Discogs-EffNet, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (non-commercial use only).

"Clear genre cache" in the same settings section forgets every cached lookup, so the next play of each track looks it up again.

## Playlist column

Playlist pages get a "Genres" column in the tracklist. It is **on by default**. Turn it off in Settings → **Genres** → "Show genres column in playlists".

The column is read-only and only appears on playlist pages. Cells show cached genres; tracks not looked up yet show "…", and tracks with no genres show "—".

Tracks without a cached result are filled in the background. The **artist and title of each track are sent to MusicBrainz** (and to Deezer when the audio fallback is on). To respect MusicBrainz's rate limit, the first fill runs at about 600 tracks an hour. Results are cached, so later visits are fast.

## Requirements

A [Spicetify](https://github.com/spicetify/spicetify-cli) build with v3 module support.

## Install from a local build

For development. Releases are built by `.github/workflows/release.yml` when a version tag is pushed.

```sh
git clone https://github.com/Heyian/spotify-genres
cd spotify-genres
bun install
bun run build
```

Start Spotify with `spotify --remote-debugging-port=9229` first. The install pushes the module into the running client over that port and fails with `fetch failed` if Spotify is closed:

```sh
bunx spicetify-kit install dist/spotify-genres@*
```

Pass `--port <n>` if you use a different port. If the upstream `genres` extension is also installed, remove it to avoid two genre rows.
