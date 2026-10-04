#!/usr/bin/env node

import { BiosensorWebSocketGateway } from '@neurodevs/node-biosensors'
import { LslStreamOutlet } from '@neurodevs/node-lsl'

const PUSH_INTERVAL_MS = 10
const LISTEN_PORT_START = 8765

const STREAMS = [
    {
        type: 'EEG',
        sampleRateHz: 256,
        channelNames: ['EEG_TP10', 'EEG_AF8', 'EEG_TP9', 'EEG_AF7', 'EEG_AUX'],
        sample: (t) =>
            [1, 2, 3, 4, 5].map(
                (amplitude, channel) =>
                    amplitude * Math.sin(2 * Math.PI * 10 * t) +
                    channel * 10 +
                    (Math.random() - 0.5) * 0.5
            ),
    },
    {
        type: 'PPG',
        sampleRateHz: 64,
        channelNames: ['PPG_AMBIENT', 'PPG_INFRARED', 'PPG_RED'],
        sample: (t) =>
            [0.1, 1, 0.6].map(
                (amplitude) =>
                    amplitude * Math.pow(Math.sin(Math.PI * 1.2 * t), 8)
            ),
    },
]

async function startStream(stream) {
    const { type, sampleRateHz, channelNames, sample } = stream

    const outlet = await LslStreamOutlet.Create({
        name: `Fake ${type}`,
        type,
        sourceId: `personomic-fake-${type.toLowerCase()}`,
        channelNames,
        channelFormat: 'float32',
        sampleRateHz,
        chunkSize: 1,
        waitAfterConstructionMs: 500,
    })

    const clock = () => LslStreamOutlet.lsl.localClock()
    const startSec = clock()
    let numPushed = 0

    const timer = setInterval(() => {
        const numDue = Math.floor((clock() - startSec) * sampleRateHz)

        for (; numPushed < numDue; numPushed++) {
            const t = numPushed / sampleRateHz
            outlet.pushSample(sample(t), startSec + t)
        }
    }, PUSH_INTERVAL_MS)

    const stop = () => {
        clearInterval(timer)
        outlet.destroy()
    }

    return { outlet, stop }
}

const started = await Promise.all(STREAMS.map(startStream))

// Only the members the gateway reads: it bridges the outlets and reports the
// name and state on its status port.
const fakeMuse = {
    deviceName: 'Muse S Gen 2',
    state: 'streaming',
    outlets: started.map(({ outlet }) => outlet),
    addStateListener: () => () => {},
}

const gateway = await BiosensorWebSocketGateway.Create([fakeMuse], {
    listenPortStart: LISTEN_PORT_START,
})

gateway.open()

STREAMS.forEach(({ type, sampleRateHz, channelNames }, i) =>
    console.log(
        `${type}: ${channelNames.length} ch at ${sampleRateHz} Hz on ws://localhost:${LISTEN_PORT_START + i}`
    )
)
console.log(`Device status on ws://localhost:${LISTEN_PORT_START - 1}`)
console.log('Streaming. Run `yarn dev` to see it. Ctrl+C stops.')

// Closed, not destroyed: bridge.destroy() panics inside ffi-rs while freeing
// the inlet's native pointers (node-lsl 23.1.1). Exiting frees them anyway.
process.on('SIGINT', () => {
    gateway.close()
    started.forEach(({ stop }) => stop())
    process.exit(0)
})
