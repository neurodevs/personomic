# personomic

A platform for individualized precision neuroinformatics and biosignal experiments

## Running it

A React app built with Vite.

```
yarn dev        # dev server at http://localhost:5173
yarn build      # type check, then a production build in dist/
yarn preview    # serve the production build
```

## Fake streams

```
yarn run.fakeStreams   # synthetic EEG and PPG through real LSL and LslWebSocketBridge
```

EEG is 4 channels at 256 Hz on `ws://localhost:8765`, PPG 1 channel at 64 Hz
on `ws://localhost:8766`, the ports `App` listens to. Needs liblsl; set
`LIBLSL_PATH` if it is not at Homebrew's path.
