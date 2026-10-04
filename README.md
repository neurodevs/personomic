# personomic

A platform for individualized precision neuroinformatics and biosignal experiments

## Running it

A React app built with Vite.

```
yarn dev        # dev server at http://localhost:5173
yarn build      # type check, then a production build in dist/
yarn preview    # serve the production build
```

Plots draw every sample by default. For smoother rendering, downsample to
`light`, `medium`, or `heavy`. Heavier levels drop more samples, so the trace
gets blockier:

```
VITE_DOWNSAMPLING=medium yarn dev
```

## Fake streams

```
yarn run.fakeStreams   # a fake Muse S Gen 2 through real LSL and BiosensorWebSocketGateway
```

EEG is 5 channels at 256 Hz on `ws://localhost:8765`, PPG 3 channels at 64 Hz
on `ws://localhost:8766`, and device status on `ws://localhost:8764`, the port
`App` watches to find each device's streams. Needs liblsl; set `LIBLSL_PATH` if
it is not at Homebrew's path.
