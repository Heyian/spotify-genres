## Credits

This extension is a fork of [genres](https://code.vexcited.com/spicetify/genres) by Mikkel ALMONTE--RINGAUD ([Vexcited](https://code.vexcited.com/Vexcited)), released under the MIT licence. All credit for the original extension goes to them.

The optional audio fallback uses the Discogs-EffNet model and Genre Discogs400 labels by the [Music Technology Group (MTG)](https://www.upf.edu/web/mtg) at Universitat Pompeu Fabra, published with [Essentia](https://essentia.upf.edu/models.html) under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The extension downloads an unmodified copy from a Hugging Face mirror; the model is not part of this repository and is not covered by its MIT licence.

## Previews

Genres will be displayed below the author in current track information.

![genres](https://cdn.vexcited.com/uploads/537192869-5c23ba9e-8e92-4b3b-9e0f-71a37501589e.png)

If available, clicking on a genre will bring the Spotify-made playlist with related tracks of this specific genre.

![spotify-made playlist](https://cdn.vexcited.com/uploads/537193777-b048c96f-8929-4af2-83fe-8e84b0b3b4d3.png)

## Audio fallback

Genres come from MusicBrainz. When MusicBrainz has no genre for the playing track, or cannot be reached, the extension can infer up to three genres from the track's audio instead. Inferred genres are shown in italics with a "≈" prefix, and hovering one shows where it came from.

The audio fallback is **opt-in** and off by default. Turn it on in Settings → **Genres** → "Infer genres from audio previews when MusicBrainz has none". The status row shows `Not downloaded`, `Downloading n%`, `Ready` or `Failed — Retry`.

What leaves your machine when it is on:

- The track's **artist and title are sent to Deezer** (`api.deezer.com`) to find the matching track.
- The track's 30-second **Deezer preview** MP3 is downloaded and analysed locally. It is kept in memory only and never stored.
- On first use, the model (about 18 MB) and its labels are downloaded once from the Hugging Face mirror [`huggingface.co/<hf-user>/discogs-effnet-onnx`](https://huggingface.co/<hf-user>/discogs-effnet-onnx), and the ONNX Runtime Web files from jsDelivr. They are cached for later sessions.

Inference runs inside Spotify with ONNX Runtime Web; nothing is sent to a hosted model. The model is MTG's Discogs-EffNet, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (non-commercial use only).

"Clear genre cache" in the same settings section forgets every cached lookup, so the next play of each track looks it up again.

## Requirements

A [Spicetify](https://github.com/spicetify/spicetify-cli) build with v3 module support.

## Install from a local build

```sh
git clone https://github.com/Heyian/spotify-genres
cd spotify-genres
bun install
bun run build
bunx spicetify-kit install dist/spotify-genres@*
```

Then restart Spotify. If the upstream `genres` extension is also installed, remove it to avoid two genre rows.
