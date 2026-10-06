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

## Connecting biosensors

```
yarn run.orchestrator   # waits on ws://localhost:8763 for Connect
```

Pick biosensors in the app and click Connect. Each one's identifier is
optional: a UUID for the Muse headsets and the Govee, which makes connecting
faster, or a serial number for the Cyton and the Cognionics, which is only
needed when more than one USB serial device is plugged in. The script starts a
`BiosensorStreamingOrchestrator` with them, which serves device status on
`ws://localhost:8764` and streams from `ws://localhost:8765`. Each status dot
follows its own device: yellow while it connects, green once it has.

Connect locks the protocol: biosensors can no longer be added or removed, and
the identifiers you typed stay visible but read-only. Click Stop to end the session
and unlock it, then make your changes and Connect again.

## Fake streams

```
yarn run.fakeStreams   # a fake Muse S Gen 2 through real LSL and BiosensorWebSocketGateway
```

EEG is 5 channels at 256 Hz on `ws://localhost:8765`, PPG 3 channels at 64 Hz
on `ws://localhost:8766`, and device status on `ws://localhost:8764`, the port
`App` watches to find each device's streams. Needs liblsl; set `LIBLSL_PATH` if
it is not at Homebrew's path.

The app starts with no biosensors, so add "Muse S Gen 2" with "+ Add biosensor"
to see these streams.
