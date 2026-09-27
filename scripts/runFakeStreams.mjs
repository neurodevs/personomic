#!/usr/bin/env node

import { LslStreamOutlet, LslWebSocketBridge } from '@neurodevs/node-lsl'

const PUSH_INTERVAL_MS = 10

const STREAMS = [
    {
        name: 'EEG',
        wssPort: 8765,
        sampleRateHz: 256,
        channelNames: ['TP9', 'AF7', 'AF8', 'TP10'],
        sample: (t) =>
            [1, 2, 3, 4].map(
                (amplitude, channel) =>
                    amplitude * Math.sin(2 * Math.PI * 10 * t) +
                    channel * 10 +
                    (Math.random() - 0.5) * 0.5
            ),
    },
    {
        name: 'PPG',
        wssPort: 8766,
        sampleRateHz: 64,
        channelNames: ['PPG'],
        sample: (t) => [Math.pow(Math.sin(Math.PI * 1.2 * t), 8)],
    },
]

async function startStream(stream) {
    const { name, wssPort, sampleRateHz, channelNames, sample } = stream
    const sourceId = `personomic-fake-${name.toLowerCase()}`

    const outlet = await LslStreamOutlet.Create({
        name: `Fake ${name}`,
        type: name,
        sourceId,
        channelNames,
        channelFormat: 'float32',
        sampleRateHz,
        chunkSize: 1,
        waitAfterConstructionMs: 500,
    })

    const bridge = await LslWebSocketBridge.Create({
        sourceId,
        chunkSize: 1,
        listenPort: wssPort,
    })

    await bridge.activate()

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

    console.log(
        `${name}: ${channelNames.length} ch at ${sampleRateHz} Hz on ws://localhost:${wssPort}`
    )

    // Deactivated, not destroyed: bridge.destroy() panics inside ffi-rs while
    // freeing the inlet's native pointers (node-lsl 23.1.1). Exiting frees
    // them anyway.
    return () => {
        clearInterval(timer)
        bridge.deactivate()
        outlet.destroy()
    }
}

const stops = []

for (const stream of STREAMS) {
    stops.push(await startStream(stream))
}

console.log('Streaming. Run `yarn web` to see it. Ctrl+C stops.')

process.on('SIGINT', () => {
    stops.forEach((stop) => stop())
    process.exit(0)
})
