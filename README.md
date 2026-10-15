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

If you don't know which Muse you have, pick "Muse (auto-detect, slower)". Detecting takes a few seconds more each time, so pick the model itself once you know it. If the Muse doesn't answer, Connect shows why and leaves it so you can try again.

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

## Playing a recording

Click "Play recording…" and choose an XDF file, such as one recorded here. The
app reads it in the browser and plays it through the same plots as a live
session, with the timing it was recorded with, so it needs neither biosensors
nor the orchestrator. The biosensors in the recording replace the ones you
picked until you click Stop.

While it plays, the 1×–100× buttons beside its name speed it up without losing
its place, and the slider beside them shows how far it has played. Holding the
slider freezes playback, and dragging it moves the plots to wherever it is, so
they show everything recorded up to that point. Let go to play on from there.
Click Pause to freeze playback and Play to carry on.

Each biosensor whose data runs out turns red and folds down to its name, while
the others play on; click it to open its plots again, or slide back to before
its data ran out to open it automatically. Once all of them run out, the
recording shows as "Finished" and Pause becomes Replay, which plays it again
from the start.

A recording names the Muse that made it, such as "Muse S Gen 2", when its
stream names start with the model. Older recordings, whose streams are named
only "Muse", show as "Muse S Athena" if they have IMU or optics streams, and as
"Muse" otherwise.
