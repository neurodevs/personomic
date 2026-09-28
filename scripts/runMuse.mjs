#!/usr/bin/env node

import { MuseDeviceController } from '@neurodevs/node-biosensors'
import { LslWebSocketBridge } from '@neurodevs/node-lsl'

const BLE_UUID =
    process.env.MUSE_BLE_UUID ?? 'CA6A61B7-B7A8-AF24-3C9E-04A6A5012554'

const STREAMS = [
    { name: 'EEG', sourceIdPrefix: 'muse-eeg', wssPort: 8765 },
    { name: 'PPG', sourceIdPrefix: 'muse-ppg', wssPort: 8766 },
]

console.log(`Creating Muse S Gen 2 controller for ${BLE_UUID}...`)

const muse = await MuseDeviceController.Create({
    bleUuid: BLE_UUID,
    model: 'Muse S Gen 2',
    disableStreams: ['Gyroscope', 'Accelerometer'],
})

const bridges = await Promise.all(STREAMS.map(createBridge))
await Promise.all(bridges.map((bridge) => bridge.activate()))

console.log('Connecting...')
await muse.connect()

console.log('Starting streaming...')
await muse.startStreaming()

STREAMS.forEach(({ name, wssPort }) =>
    console.log(`${name} on ws://localhost:${wssPort}`)
)
console.log('Streaming. Run `yarn dev` to see it. Ctrl+C stops.')

process.on('SIGINT', async () => {
    console.log('\nDisconnecting...')
    await muse.disconnect()
    bridges.forEach((bridge) => bridge.deactivate())
    process.exit(0)
})

function createBridge({ sourceIdPrefix, wssPort }) {
    return LslWebSocketBridge.Create({
        sourceId: museSourceId(sourceIdPrefix),
        chunkSize: 1,
        listenPort: wssPort,
    })
}

function museSourceId(prefix) {
    return `${prefix}-${BLE_UUID.slice(0, 6)}`
}
