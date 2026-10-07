#!/usr/bin/env node

import { BiosensorStreamingOrchestrator } from '@neurodevs/node-biosensors'
import { WebSocketServer } from 'ws'

const COMMAND_PORT = 8763
const WEB_SOCKET_PORT_START = 8765

const IDENTIFIER_OPTION_BY_DEVICE = {
    'Cognionics Quick-20r': 'serialNumber',
    'Govee Thermohygrometer H5074': 'deviceUuid',
    'Muse S Athena': 'bleUuid',
    'Muse S Gen 2': 'bleUuid',
    'Muse S Gen 1': 'bleUuid',
    'Muse 2': 'bleUuid',
    'Muse 1 Gen 2': 'bleUuid',
    'OpenBCI Cyton': 'serialNumber',
}

let orchestrator
let isBusy = false

function specificationFor({ deviceName, identifier }) {
    const option = IDENTIFIER_OPTION_BY_DEVICE[deviceName]
    return identifier && option
        ? { deviceName, [option]: identifier }
        : deviceName
}

async function start(devices) {
    if (orchestrator) {
        throw new Error('A session is already running. Press Stop first.')
    }

    const specifications = devices.map(specificationFor)
    console.log('Starting', JSON.stringify(specifications))

    // Kept even if starting fails, so that Stop can clean up whatever was
    // created before the failure.
    orchestrator = await BiosensorStreamingOrchestrator.Create({
        devices: specifications,
        webSocketPortStart: WEB_SOCKET_PORT_START,
    })

    await orchestrator.start()

    console.log(
        `Streaming from ws://localhost:${WEB_SOCKET_PORT_START}, device status on ws://localhost:${WEB_SOCKET_PORT_START - 1}`
    )
}

async function stop() {
    console.log('Stopping')

    // Forgotten even if stopping reports an error: the orchestrator cleans up
    // everything it can regardless, so the session is over either way.
    try {
        await orchestrator?.stop()
    } finally {
        orchestrator = undefined
    }
}

async function run(command, devices) {
    if (command === 'start') {
        await start(devices)
    } else if (command === 'stop') {
        await stop()
    } else {
        throw new Error(`Unknown command: ${command}`)
    }
}

const server = new WebSocketServer({ port: COMMAND_PORT })

server.on('connection', (client) => {
    client.on('message', async (message) => {
        try {
            if (isBusy) {
                throw new Error('Busy with another command.')
            }

            isBusy = true

            try {
                const { command, devices } = JSON.parse(message.toString())
                await run(command, devices)
            } finally {
                isBusy = false
            }

            client.send(JSON.stringify({}))
        } catch (err) {
            console.error(err)
            client.send(JSON.stringify({ error: err.message.trim() }))
        }
    })
})

console.log(`Waiting for Connect on ws://localhost:${COMMAND_PORT}.`)
console.log('Run `yarn dev`, pick biosensors, and click Connect. Ctrl+C stops.')

process.on('SIGINT', async () => {
    await stop()
    process.exit(0)
})
