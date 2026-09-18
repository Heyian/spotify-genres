## Setup

```sh
git clone git@vexcited.com:spicetify/genres
ant install
```

## Watch

```sh
ant build
ant dev
```

`ant dev` hot-pushes into a client started with `--remote-debugging-port=9229`; add `--launch` to let the kit start Spotify itself.

## Build

```bash
ant build
ant x spicetify-kit install dist/genres@*
```
