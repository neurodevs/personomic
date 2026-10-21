#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
    mkdir,
    readdir,
    readFile,
    rename,
    unlink,
    writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { LibndxAdapter } from '@neurodevs/ndx-native'
import {
    BiosensorStreamingOrchestrator,
    detectMuseModel,
} from '@neurodevs/node-biosensors'
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

const BLE_NAME_PREFIX_BY_DEVICE = {
    'Govee Thermohygrometer H5074': 'Govee_H5074',
    Muse: 'Muse',
    'Muse S Athena': 'Muse',
    'Muse S Gen 2': 'Muse',
    'Muse S Gen 1': 'Muse',
    'Muse 2': 'Muse',
    'Muse 1 Gen 2': 'Muse',
}

const USB_DEVICES = new Set(['Cognionics Quick-20r', 'OpenBCI Cyton'])

const BLE_SCAN_MS = 5000

const PROTOCOLS_DIRECTORY = '~/Personomic/Protocols'
const UNTITLED_PROTOCOL_FILE_STEM = 'untitled-protocol'
const REMOVED_PROTOCOLS_FOLDER = 'Removed'

const CHOOSE_FOLDER_SCRIPT =
    'tell application (path to frontmost application as text) to POSIX path of (choose folder with prompt "Choose a folder for recordings")'

const APPLESCRIPT_USER_CANCELLED = '-128'
const APPLESCRIPT_NOT_AUTHORIZED = '-1743'

let orchestrator
let sessionRequest
let commandInFlight
let directoryChoiceInFlight

function specificationFor({
    deviceName,
    identifier,
    nickname,
    disableStreams,
}) {
    const option = IDENTIFIER_OPTION_BY_DEVICE[deviceName]

    return {
        deviceName,
        ...(identifier && option && { [option]: identifier }),
        ...(nickname && { nickname }),
        ...(disableStreams?.length > 0 && { disableStreams }),
    }
}

async function withDetectedModel(device) {
    if (device.deviceName !== 'Muse') {
        return device
    }

    console.log(
        `Detecting Muse model${device.identifier ? ` of ${device.identifier}` : ''}`
    )
    return { ...device, deviceName: await detectMuseModel(device.identifier) }
}

async function withDetectedModels(devices) {
    const detected = []

    for (const device of devices) {
        detected.push(await withDetectedModel(device))
    }

    return detected
}

function absolutePathFor(typedPath) {
    return path.resolve(typedPath.replace(/^~(?=$|\/)/, os.homedir()))
}

function shownPathFor(absolutePath) {
    const home = os.homedir()

    if (absolutePath === home) {
        return '~'
    }

    return absolutePath.startsWith(`${home}${path.sep}`)
        ? `~${absolutePath.slice(home.length)}`
        : absolutePath
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

async function revealRecording() {
    const xdfRecordPath = sessionRequest?.xdfRecordPath

    if (!xdfRecordPath) {
        throw new Error('Nothing is being recorded right now.')
    }

    if (process.platform !== 'darwin') {
        throw new Error('Showing the recording only works on macOS.')
    }

    const args = existsSync(xdfRecordPath)
        ? ['-R', xdfRecordPath]
        : [path.dirname(xdfRecordPath)]

    await promisify(execFile)('open', args)
}

async function listProtocols() {
    const directory = absolutePathFor(PROTOCOLS_DIRECTORY)
    const protocols = []

    for (const fileName of await jsonFileNamesIn(directory)) {
        try {
            const protocol = JSON.parse(
                await readFile(path.join(directory, fileName), 'utf8')
            )

            if (!isPlainObject(protocol)) {
                throw new Error('It does not hold a protocol.')
            }

            protocols.push({ fileName, protocol })
        } catch (err) {
            console.error(`Skipping protocol ${fileName}: ${err.message}`)
        }
    }

    return { protocols }
}

async function jsonFileNamesIn(directory) {
    try {
        const fileNames = await readdir(directory)
        return fileNames.filter((name) => name.endsWith('.json')).sort()
    } catch (err) {
        if (err.code === 'ENOENT') {
            return []
        }

        throw err
    }
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function saveProtocol({ fileName, protocol }) {
    if (!isPlainObject(protocol)) {
        throw new Error('There is no protocol to save.')
    }

    if (fileName !== undefined && !isProtocolFileName(fileName)) {
        throw new Error(`Cannot save a protocol as ${fileName}.`)
    }

    const directory = absolutePathFor(PROTOCOLS_DIRECTORY)
    await mkdir(directory, { recursive: true })

    const savedAs =
        fileName ?? unusedFileNameFor(fileStemFor(protocol.name), directory)
    const filePath = path.join(directory, savedAs)

    await writeFile(filePath, `${JSON.stringify(protocol, null, 4)}\n`)
    console.log(`Saved protocol ${filePath}`)

    return { fileName: savedAs, filePath: shownPathFor(filePath) }
}

function isProtocolFileName(fileName) {
    return (
        typeof fileName === 'string' &&
        fileName.endsWith('.json') &&
        path.basename(fileName) === fileName
    )
}

async function revealProtocol({ fileName }) {
    if (!isProtocolFileName(fileName)) {
        throw new Error(`Cannot show a protocol saved as ${fileName}.`)
    }

    if (process.platform !== 'darwin') {
        throw new Error('Showing the protocol only works on macOS.')
    }

    const directory = absolutePathFor(PROTOCOLS_DIRECTORY)
    const filePath = path.join(directory, fileName)
    const args = existsSync(filePath) ? ['-R', filePath] : [directory]

    await promisify(execFile)('open', args)
    return {}
}

async function removeProtocol({ fileName, shouldDeleteFile }) {
    if (!isProtocolFileName(fileName)) {
        throw new Error(`Cannot remove a protocol saved as ${fileName}.`)
    }

    const directory = absolutePathFor(PROTOCOLS_DIRECTORY)
    const filePath = path.join(directory, fileName)

    if (!existsSync(filePath)) {
        console.log(`Protocol ${fileName} was already gone`)
        return {}
    }

    if (shouldDeleteFile) {
        await unlink(filePath)
        console.log(`Deleted protocol ${fileName}`)
        return {}
    }

    const removedDirectory = path.join(directory, REMOVED_PROTOCOLS_FOLDER)
    await mkdir(removedDirectory, { recursive: true })

    const movedAs = unusedFileNameFor(
        path.basename(fileName, '.json'),
        removedDirectory
    )
    await rename(filePath, path.join(removedDirectory, movedAs))
    console.log(
        `Moved protocol ${fileName} to ${REMOVED_PROTOCOLS_FOLDER}/${movedAs}`
    )

    return {}
}

function unusedFileNameFor(stem, directory) {
    for (let number = 1; ; number++) {
        const fileName =
            number === 1 ? `${stem}.json` : `${stem}-${number}.json`

        if (!existsSync(path.join(directory, fileName))) {
            return fileName
        }
    }
}

function fileStemFor(name) {
    const stem = String(name ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return stem || UNTITLED_PROTOCOL_FILE_STEM
}

async function scan({ deviceNames = [] }) {
    if (orchestrator) {
        return { scanned: {} }
    }

    const prefixes = [
        ...new Set(
            deviceNames
                .map((name) => BLE_NAME_PREFIX_BY_DEVICE[name])
                .filter(Boolean)
        ),
    ]
    const isUsbWanted = deviceNames.some((name) => USB_DEVICES.has(name))

    const [scannedByPrefix, serialNumbers] = await Promise.all([
        Promise.all(
            prefixes.map(async (prefix) => [
                prefix,
                await scannedBleDevices(prefix),
            ])
        ).then(Object.fromEntries),
        isUsbWanted ? connectedUsbSerialNumbers() : [],
    ])

    return {
        scanned: Object.fromEntries(
            deviceNames.map((name) => [
                name,
                scannedFor(name, scannedByPrefix, serialNumbers),
            ])
        ),
    }
}

function scannedFor(name, scannedByPrefix, serialNumbers) {
    if (USB_DEVICES.has(name)) {
        return serialNumbers.map((value) => ({ value, source: 'USB' }))
    }

    return scannedByPrefix[BLE_NAME_PREFIX_BY_DEVICE[name]] ?? []
}

async function scannedBleDevices(namePrefix) {
    const ndx = LibndxAdapter.getInstance()
    const nameByUuid = new Map()

    const { status } = ndx.startBleScan({
        namePrefix,
        onScanned: (uuid, name) => nameByUuid.set(uuid, name),
    })

    if (status !== 200) {
        return []
    }

    await new Promise((resolve) => setTimeout(resolve, BLE_SCAN_MS))
    ndx.stopBleScan({ namePrefix })

    return [...nameByUuid].map(([value, source]) => ({ value, source }))
}

function connectedUsbSerialNumbers() {
    const { status, serialNumbers = [] } =
        LibndxAdapter.getInstance().discoverUsbSerialNumbers()

    return status === 200 ? serialNumbers : []
}

async function start(request) {
    const xdfRecordPath = request.xdfRecordPath
        ? absolutePathFor(request.xdfRecordPath)
        : undefined

    if (orchestrator) {
        throw new Error('A session is already running. Press Stop first.')
    }

    const devices = await withDetectedModels(request.devices)
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

    return {
        devices,
        xdfRecordPath: xdfRecordPath && shownPathFor(xdfRecordPath),
    }
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

    if (!sessionRequest) {
        return {}
    }

    const { devices, xdfRecordPath } = sessionRequest

    return {
        devices,
        xdfRecordPath: xdfRecordPath && shownPathFor(xdfRecordPath),
    }
}

async function handle(message) {
    const { command, ...request } = JSON.parse(message.toString())

    if (command === 'status') {
        return await statusOnceIdle()
    }

    if (command === 'chooseDirectory') {
        const directory = await chooseDirectory()
        return { directory: directory && shownPathFor(directory) }
    }

    if (command === 'scan') {
        return await scan(request)
    }

    if (command === 'listProtocols') {
        return await listProtocols()
    }

    if (command === 'saveProtocol') {
        return await saveProtocol(request)
    }

    if (command === 'revealProtocol') {
        return await revealProtocol(request)
    }

    if (command === 'removeProtocol') {
        return await removeProtocol(request)
    }

    if (command === 'revealRecording') {
        await revealRecording()
        return {}
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
