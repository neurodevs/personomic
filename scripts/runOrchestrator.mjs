#!/usr/bin/env node

import { BiosensorStreamingOrchestrator } from '@neurodevs/node-biosensors'
import { WebSocketServer } from 'ws'

const COMMAND_PORT = 8763
const WEB_SOCKET_PORT_START = 8765

const UUID_OPTION_BY_DEVICE = {
    'Govee Thermohygrometer H5074': 'deviceUuid',
    'Muse S Athena': 'bleUuid',
    'Muse S Gen 2': 'bleUuid',
    'Muse S Gen 1': 'bleUuid',
    'Muse 2': 'bleUuid',
    'Muse 1 Gen 2': 'bleUuid',
}

let orchestrator
let startedSpecifications
let isStarting = false

function specificationFor({ deviceName, uuid }) {
    const uuidOption = UUID_OPTION_BY_DEVICE[deviceName]
    return uuid && uuidOption ? { deviceName, [uuidOption]: uuid } : deviceName
}

async function start(devices) {
    if (isStarting) {
        throw new Error('Already connecting.')
    }

    const specifications = JSON.stringify(devices.map(specificationFor))

    // One orchestrator per run: changing devices means stopping it, which
    // destroys the gateway's bridges, and bridge.destroy() panics inside
    // ffi-rs while freeing the inlet's native pointers (node-lsl 23.1.1),
    // aborting this process. Starting it again only retries the connections.
    if (orchestrator && specifications !== startedSpecifications) {
        throw new Error(
            'Restart `yarn run.orchestrator` to change devices or UUIDs.'
        )
    }

    isStarting = true

    try {
        console.log('Starting', specifications)

        orchestrator ??= await BiosensorStreamingOrchestrator.Create({
            devices: JSON.parse(specifications),
            webSocketPortStart: WEB_SOCKET_PORT_START,
        })
        startedSpecifications = specifications

        await orchestrator.start()

        console.log(
            `Streaming from ws://localhost:${WEB_SOCKET_PORT_START}, device status on ws://localhost:${WEB_SOCKET_PORT_START - 1}`
        )
    } finally {
        isStarting = false
    }
}

const server = new WebSocketServer({ port: COMMAND_PORT })

server.on('connection', (client) => {
    client.on('message', async (message) => {
        try {
            const { command, devices } = JSON.parse(message.toString())

            if (command !== 'start') {
                throw new Error(`Unknown command: ${command}`)
            }

            await start(devices)
            client.send(JSON.stringify({}))
        } catch (err) {
            console.error(err)
            client.send(JSON.stringify({ error: err.message.trim() }))
        }
    })
})

console.log(`Waiting for Connect on ws://localhost:${COMMAND_PORT}.`)
console.log('Run `yarn dev`, pick biosensors, and click Connect. Ctrl+C stops.')

// Exits without orchestrator.stop() for the same reason: it would abort
// mid-shutdown. Exiting drops the device connections anyway.
process.on('SIGINT', () => process.exit(0))
