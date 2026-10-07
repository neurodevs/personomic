#!/usr/bin/env node

import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

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

const CHOOSE_FOLDER_SCRIPT =
    'tell application (path to frontmost application as text) to POSIX path of (choose folder with prompt "Choose a folder for recordings")'

const APPLESCRIPT_USER_CANCELLED = '-128'
const APPLESCRIPT_NOT_AUTHORIZED = '-1743'

let orchestrator
let sessionRequest
let commandInFlight
let directoryChoiceInFlight

function specificationFor({ deviceName, identifier }) {
    const option = IDENTIFIER_OPTION_BY_DEVICE[deviceName]
    return identifier && option
        ? { deviceName, [option]: identifier }
        : deviceName
}

function absolutePathFor(typedPath) {
    return path.resolve(typedPath.replace(/^~(?=$|\/)/, os.homedir()))
}

async function chooseDirectory() {
    if (process.platform !== 'darwin') {
        throw new Error(
            'Browsing for a folder only works on macOS. Type the path instead.'
        )
    }

    directoryChoiceInFlight ??= showFolderPanel().finally(() => {
        directoryChoiceInFlight = undefined
    })

    return await directoryChoiceInFlight
}

async function showFolderPanel() {
    try {
        const { stdout } = await promisify(execFile)('osascript', [
            '-e',
            CHOOSE_FOLDER_SCRIPT,
        ])
        return stdout.trim().replace(/\/+$/, '') || '/'
    } catch (err) {
        const stderr = err.stderr ?? ''

        if (stderr.includes(APPLESCRIPT_USER_CANCELLED)) {
            return undefined
        }

        if (stderr.includes(APPLESCRIPT_NOT_AUTHORIZED)) {
            throw new Error(
                'macOS blocked the folder dialog. Allow your terminal to control the browser in System Settings › Privacy & Security › Automation, or type the path instead.'
            )
        }

        throw err
    }
}

async function start(request) {
    const { devices } = request
    const xdfRecordPath = request.xdfRecordPath
        ? absolutePathFor(request.xdfRecordPath)
        : undefined

    if (orchestrator) {
        throw new Error('A session is already running. Press Stop first.')
    }

    const specifications = devices.map(specificationFor)
    console.log(
        'Starting',
        JSON.stringify(specifications),
        xdfRecordPath ? `recording to ${xdfRecordPath}` : 'without recording'
    )

    orchestrator = await BiosensorStreamingOrchestrator.Create({
        devices: specifications,
        xdfRecordPath,
        webSocketPortStart: WEB_SOCKET_PORT_START,
    })
    sessionRequest = { devices, xdfRecordPath }

    try {
        await orchestrator.start()
    } catch (err) {
        await cleanUpFailedStart()
        throw err
    }

    console.log(
        `Streaming from ws://localhost:${WEB_SOCKET_PORT_START}, device status on ws://localhost:${WEB_SOCKET_PORT_START - 1}`
    )

    return { xdfRecordPath }
}

async function cleanUpFailedStart() {
    try {
        await stop()
    } catch (err) {
        console.error(err)
    }
}

async function stop() {
    console.log('Stopping')

    try {
        await orchestrator?.stop()
    } finally {
        orchestrator = undefined
        sessionRequest = undefined
    }
}

async function statusOnceIdle() {
    await commandInFlight?.catch(() => {})
    return sessionRequest ?? {}
}

async function handle(message) {
    const { command, ...request } = JSON.parse(message.toString())

    if (command === 'status') {
        return await statusOnceIdle()
    }

    if (command === 'chooseDirectory') {
        return { directory: await chooseDirectory() }
    }

    if (commandInFlight) {
        throw new Error('Busy with another command.')
    }

    commandInFlight = run(command, request)

    try {
        return (await commandInFlight) ?? {}
    } finally {
        commandInFlight = undefined
    }
}

async function run(command, request) {
    if (command === 'start') {
        return await start(request)
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
            client.send(JSON.stringify(await handle(message)))
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
