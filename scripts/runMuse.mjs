#!/usr/bin/env node

import {
    BiosensorWebSocketGateway,
    MuseDeviceController,
} from '@neurodevs/node-biosensors'

const BLE_UUID =
    process.env.MUSE_BLE_UUID ?? 'CA6A61B7-B7A8-AF24-3C9E-04A6A5012554'

const LISTEN_PORT_START = 8765

console.log(`Creating Muse S Gen 2 controller for ${BLE_UUID}...`)

const muse = await MuseDeviceController.Create({
    bleUuid: BLE_UUID,
    model: 'Muse S Gen 2',
    disableStreams: ['Gyroscope', 'Accelerometer'],
})

const gateway = await BiosensorWebSocketGateway.Create([muse], {
    listenPortStart: LISTEN_PORT_START,
})

gateway.open()

console.log('Connecting...')
await muse.connect()

console.log('Starting streaming...')
await muse.startStreaming()

muse.outlets.forEach((outlet, i) =>
    console.log(`${outlet.type} on ws://localhost:${LISTEN_PORT_START + i}`)
)
console.log('Streaming. Run `yarn dev` to see it. Ctrl+C stops.')

process.on('SIGINT', async () => {
    console.log('\nDisconnecting...')
    await muse.disconnect()
    gateway.close()
    process.exit(0)
})
