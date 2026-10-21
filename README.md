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

While a biosensor has no identifier, the orchestrator scans for it, and its
identifier dropdown suggests what it finds, marked "Scanned" with where it was
found, above the ones you used before, marked "Memory". A "Scanning…" row at
the bottom shows it's still looking. For USB devices that's every connected
serial number. For the Muse headsets and the Govee it's every nearby device
whose Bluetooth name matches, shown with that name, such as "Scanned ·
Muse-1A2B", and a device drops off a few seconds after it goes quiet. Scanning
for a kind of biosensor stops once each one of that kind has an identifier, and
all scanning stops once you click Connect.

Each biosensor can also take a nickname, such as the name of the person wearing
it, so two Muse S Athenas on two people are easy to tell apart. The nickname is
saved into the recording's stream metadata, and the biosensor shows it again when
the recording is played.

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

## Demo with guided tours

The Demo tab, beside Session and Protocols, shows `demo.html` in a frame while
the tab is chosen, and nothing of it otherwise. That page runs the real app
with no orchestrator, gateway, or biosensors. `DemoWebSocket` stands in for all
three behind the same WebSocket ports and streams a simulated Muse S Gen 2.
Only Muse headbands can connect. Tours at the top, such as "How to run a
session with Muse", click through the real UI one step at a time. Back and the
step dots replay the earlier steps in a fresh app. The demo keeps what the app
remembers in memory, so it never touches the real app's saved record folder or
biosensor identifiers. It runs in its own frame because the app's WebSocket
stand-in is shared by everything on a page, and the Session tab keeps its real
connections open while hidden.

Each tour step finds its target the way a test does, by role and name, so
`tours.test.tsx` fails when a UI change breaks a tour.

## Playing a recording

Click "Play XDF recording…" and choose an XDF file, such as one recorded here. The
app reads it in the browser and plays it through the same plots as a live
session, with the timing it was recorded with, so it needs neither biosensors
nor the orchestrator. The biosensors in the recording replace the ones you
picked until you click Stop.

While it plays, the 1×–100× buttons beside its name speed it up without losing
its place, and the slider beside them shows how far it has played. Holding the
slider freezes playback, and dragging it moves the plots to wherever it is, so
they show everything recorded up to that point. Let go to play on from there.
Click Pause to freeze playback and Play to carry on.

Heartbeats in a recording's PPG are detected once over the whole recording when
it is chosen, so the peak markers stay put as it plays, and heart rate and HRV
count only the beats played so far.

Each biosensor whose data runs out turns red and folds down to its name, while
the others play on; click it to open its plots again, or slide back to before
its data ran out to open it automatically. Once all of them run out, the
recording shows as "Finished" and Pause becomes Replay, which plays it again
from the start.

A recording names the Muse that made it, such as "Muse S Gen 2", when its
stream names start with the model. Older recordings, whose streams are named
only "Muse", show as "Muse S Athena" if they have IMU or optics streams, and as
"Muse" otherwise.
