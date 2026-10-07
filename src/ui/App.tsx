import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import React, { useEffect, useState } from 'react'

import AddBiosensorButton from './components/AddBiosensorButton'
import StreamMonitor, {
    deviceKeysFor,
    StreamOptions,
    WebSocketComponent,
} from './components/StreamMonitor'
import { Downsampling } from './components/StreamPlot'

const orchestratorPort = 8763

const identifierLabels: Record<string, string> = {
    'Cognionics Quick-20r': 'Serial number',
    'Govee Thermohygrometer H5074': 'UUID',
    'Muse S Athena': 'UUID',
    'Muse S Gen 2': 'UUID',
    'Muse S Gen 1': 'UUID',
    'Muse 2': 'UUID',
    'Muse 1 Gen 2': 'UUID',
    'OpenBCI Cyton': 'Serial number',
}

const orchestratorUnreachableMessage =
    'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.'

const defaultRecordDirectory = '~/Documents/Personomic'
const recordDirectoryLabel = 'Recordings folder'
const defaultRecordName = 'session'
const recordNameLabel = 'Recording name'
const recordDirectoryStorageKey = 'personomic.recordDirectory'
const rememberedIdentifiersStorageKey = 'personomic.rememberedIdentifiers'

const streamOptions: Record<string, StreamOptions> = {
    PPG: {
        detectPeaks: {
            channels: ['AMBIENT', 'INFRARED'],
            heartRateWindowSeconds: 30,
            hrvWindowSeconds: 300,
            hrvProvisionalAfterSeconds: 30,
        },
    },
    Temperature: { units: '°C' },
    Humidity: { yRange: { min: 0, max: 100 }, units: '%' },
    Battery: { yRange: { min: 0, max: 100 }, units: '%' },
}

const sessionButtonLabels: Record<SessionState, string> = {
    unlocked: 'Connect',
    connecting: 'Connecting…',
    locked: 'Stop',
    stopping: 'Stopping…',
}

export interface AppProps {
    downsampling?: Downsampling
}

const App: React.FC<AppProps> = (props: AppProps) => {
    const { downsampling } = props

    const [devices, setDevices] = useState<SelectedDevice[]>([])
    const [isRecordEnabled, setIsRecordEnabled] = useState(false)
    const [recordDirectory, setRecordDirectory] = useState(
        () =>
            localStorage.getItem(recordDirectoryStorageKey) ??
            defaultRecordDirectory
    )
    const [recordName, setRecordName] = useState(defaultRecordName)
    const [recordStartedAt, setRecordStartedAt] = useState<Date>()
    const [recordingPath, setRecordingPath] = useState<string>()
    const [isBrowsing, setIsBrowsing] = useState(false)
    const [rememberedIdentifiers, setRememberedIdentifiers] = useState(
        readRememberedIdentifiers
    )
    const [session, setSession] = useState<SessionState>('unlocked')
    const [sessionError, setSessionError] = useState<string>()
    const [numMonitorResets, setNumMonitorResets] = useState(0)

    const isLocked = session !== 'unlocked'

    const resetMonitor = () => setNumMonitorResets((previous) => previous + 1)

    const deviceNames = devices.map(({ name }) => name)
    const deviceKeys = deviceKeysFor(deviceNames)

    const addableNames = DEVICE_NAMES.filter(
        (name) => name in identifierLabels || !deviceNames.includes(name)
    )

    const addDevice = (name: string) =>
        setDevices((previous) => [...previous, { name, identifier: '' }])

    const removeDevice = (key: string) =>
        setDevices((previous) =>
            previous.filter((_, index) => index !== deviceKeys.indexOf(key))
        )

    const setIdentifierValue = (key: string, value: string) =>
        setDevices((previous) =>
            previous.map((device, index) =>
                index === deviceKeys.indexOf(key)
                    ? { ...device, identifier: value }
                    : device
            )
        )

    const identifiers = Object.fromEntries(
        devices
            .map(({ name, identifier }, index) => [
                deviceKeys[index],
                { label: identifierLabels[name], value: identifier },
            ])
            .filter((_, index) => deviceNames[index] in identifierLabels)
    )

    const deviceRequests = devices.map(({ name }, index) => ({
        deviceName: name,
        identifier: identifiers[deviceKeys[index]]?.value.trim() || undefined,
    }))

    const saveRememberedIdentifiers = (remembered: RememberedIdentifiers) => {
        setRememberedIdentifiers(remembered)
        localStorage.setItem(
            rememberedIdentifiersStorageKey,
            JSON.stringify(remembered)
        )
    }

    const rememberIdentifiersOf = (requests: DeviceRequest[]) =>
        saveRememberedIdentifiers(
            withIdentifiersOf(requests, rememberedIdentifiers)
        )

    const forgetIdentifier = (name: string, identifier: string) =>
        saveRememberedIdentifiers(
            withoutIdentifier(name, identifier, rememberedIdentifiers)
        )

    const rememberRecordDirectory = (directory: string) => {
        setRecordDirectory(directory)
        localStorage.setItem(recordDirectoryStorageKey, directory)
    }

    const chooseRecordDirectory = () => {
        setIsBrowsing(true)
        setSessionError(undefined)

        sendToOrchestrator(
            { command: 'chooseDirectory' },
            {
                onReply: ({ error, directory }) => {
                    setIsBrowsing(false)
                    setSessionError(error)

                    if (directory) {
                        rememberRecordDirectory(directory)
                    }
                },
                onUnreachable: () => {
                    setIsBrowsing(false)
                    setSessionError(orchestratorUnreachableMessage)
                },
            }
        )
    }

    const revealRecording = () => {
        setSessionError(undefined)

        sendToOrchestrator(
            { command: 'revealRecording' },
            {
                onReply: ({ error }) => setSessionError(error),
                onUnreachable: () =>
                    setSessionError(orchestratorUnreachableMessage),
            }
        )
    }

    const restoreRunningSession = (running: RunningSession) => {
        const { devices, xdfRecordPath } = running

        setDevices(
            devices.map(({ deviceName, identifier = '' }) => ({
                name: deviceName,
                identifier,
            }))
        )
        setIsRecordEnabled(xdfRecordPath !== undefined)
        setRecordingPath(xdfRecordPath)
        setSession('locked')
    }

    useEffect(() => {
        sendToOrchestrator(
            { command: 'status' },
            {
                onReply: ({ devices, xdfRecordPath }) => {
                    if (devices) {
                        restoreRunningSession({ devices, xdfRecordPath })
                    }
                },
                onUnreachable: () => {},
            }
        )
    }, [])

    const connectDevices = () => {
        const indistinguishable =
            nameOfDevicesWithoutOwnIdentifier(deviceRequests)

        if (indistinguishable) {
            setSessionError(
                `Give each ${indistinguishable} its own ${identifierLabels[indistinguishable]}.`
            )
            return
        }

        const startedAt = now()

        rememberIdentifiersOf(deviceRequests)
        setSession('connecting')
        setSessionError(undefined)
        setRecordStartedAt(startedAt)

        sendToOrchestrator(
            {
                command: 'start',
                devices: deviceRequests,
                xdfRecordPath: isRecordEnabled
                    ? recordPathFor(recordDirectory, recordName, startedAt)
                    : undefined,
            },
            {
                onReply: ({ error, xdfRecordPath }) => {
                    setSessionError(error)
                    setRecordingPath(xdfRecordPath)
                    setSession(error ? 'unlocked' : 'locked')

                    if (error) {
                        resetMonitor()
                    }
                },
                onUnreachable: () => {
                    setSessionError(orchestratorUnreachableMessage)
                    setSession('unlocked')
                },
            }
        )
    }

    const stopSession = () => {
        setSession('stopping')
        setSessionError(undefined)

        sendToOrchestrator(
            { command: 'stop' },
            {
                onReply: ({ error }) => {
                    setSessionError(error)
                    setRecordingPath(undefined)
                    setSession('unlocked')
                    resetMonitor()
                },
                onUnreachable: () => {
                    setSessionError(orchestratorUnreachableMessage)
                    setRecordingPath(undefined)
                    setSession('unlocked')
                    resetMonitor()
                },
            }
        )
    }

    return (
        <main className="app">
            <header className="app__header">
                <span className="app__wordmark">Personomic</span>
                <span className="app__tagline">Live biosignal monitor</span>
            </header>
            <StreamMonitorComponent
                key={numMonitorResets}
                downsampling={downsampling}
                deviceStatusPort={8764}
                deviceNames={deviceNames}
                streamOptions={streamOptions}
                isConnecting={session === 'connecting'}
                identifiers={identifiers}
                rememberedIdentifiers={rememberedIdentifiers}
                onForgetIdentifier={isLocked ? undefined : forgetIdentifier}
                onIdentifierChange={isLocked ? undefined : setIdentifierValue}
                onRemoveDevice={isLocked ? undefined : removeDevice}
            />
            {!isLocked && addableNames.length > 0 && (
                <AddBiosensorButton names={addableNames} onAdd={addDevice} />
            )}
            <div className="connect-devices">
                <button
                    type="button"
                    className="connect-devices__button"
                    disabled={
                        session === 'connecting' ||
                        session === 'stopping' ||
                        deviceNames.length === 0
                    }
                    onClick={isLocked ? stopSession : connectDevices}
                >
                    {sessionButtonLabels[session]}
                </button>
                <label className="connect-devices__record-toggle">
                    <input
                        type="checkbox"
                        checked={isRecordEnabled}
                        disabled={isLocked}
                        onChange={(event) =>
                            setIsRecordEnabled(event.target.checked)
                        }
                    />
                    Record
                </label>
                {isRecordEnabled && !recordingPath && (
                    <>
                        <input
                            type="text"
                            className="connect-devices__record-directory"
                            aria-label={recordDirectoryLabel}
                            placeholder={defaultRecordDirectory}
                            value={recordDirectory}
                            readOnly={isLocked}
                            onChange={(event) =>
                                rememberRecordDirectory(event.target.value)
                            }
                        />
                        {!isLocked && (
                            <button
                                type="button"
                                className="connect-devices__browse"
                                disabled={isBrowsing}
                                onClick={chooseRecordDirectory}
                            >
                                Browse…
                            </button>
                        )}
                        <span className="connect-devices__record-file">
                            <input
                                type="text"
                                className="connect-devices__record-name"
                                aria-label={recordNameLabel}
                                placeholder={defaultRecordName}
                                value={recordName}
                                readOnly={isLocked}
                                onChange={(event) =>
                                    setRecordName(event.target.value)
                                }
                            />
                            <RecordTimestamp
                                frozenAt={
                                    session === 'connecting'
                                        ? recordStartedAt
                                        : undefined
                                }
                            />
                        </span>
                    </>
                )}
                {recordingPath && (
                    <span className="connect-devices__recording">
                        Recording to{' '}
                        <button
                            type="button"
                            className="connect-devices__recording-path"
                            title="Show in Finder"
                            onClick={revealRecording}
                        >
                            {recordingPath}
                        </button>
                    </span>
                )}
                {sessionError && (
                    <span className="connect-devices__error" role="alert">
                        {sessionError}
                    </span>
                )}
            </div>
        </main>
    )
}

export default App

type SessionState = 'unlocked' | 'connecting' | 'locked' | 'stopping'

interface RecordTimestampProps {
    frozenAt?: Date
}

const RecordTimestamp: React.FC<RecordTimestampProps> = (
    props: RecordTimestampProps
) => {
    const { frozenAt } = props

    const [tickedAt, setTickedAt] = useState(now)

    useEffect(() => {
        if (frozenAt) {
            return undefined
        }

        return everySecond(() => setTickedAt(now()))
    }, [frozenAt])

    return (
        <span className="connect-devices__record-timestamp">
            {recordFileSuffixFor(frozenAt ?? tickedAt)}
        </span>
    )
}

function nameOfDevicesWithoutOwnIdentifier(requests: DeviceRequest[]) {
    const seen = new Set<string>()

    for (const { deviceName, identifier } of requests) {
        const isRepeated =
            requests.filter((other) => other.deviceName === deviceName).length >
            1
        const own = `${deviceName}/${identifier}`

        if (isRepeated && (!identifier || seen.has(own))) {
            return deviceName
        }

        seen.add(own)
    }

    return undefined
}

function readRememberedIdentifiers(): RememberedIdentifiers {
    try {
        return JSON.parse(
            localStorage.getItem(rememberedIdentifiersStorageKey) ?? '{}'
        )
    } catch {
        return {}
    }
}

function withIdentifiersOf(
    requests: DeviceRequest[],
    remembered: RememberedIdentifiers
) {
    const next = { ...remembered }

    for (const { deviceName, identifier } of requests) {
        if (identifier) {
            const others = (next[deviceName] ?? []).filter(
                (other) => other !== identifier
            )
            next[deviceName] = [identifier, ...others]
        }
    }

    return next
}

function withoutIdentifier(
    name: string,
    identifier: string,
    remembered: RememberedIdentifiers
) {
    const { [name]: ofDevice = [], ...ofOtherDevices } = remembered
    const kept = ofDevice.filter((other) => other !== identifier)

    return kept.length > 0
        ? { ...ofOtherDevices, [name]: kept }
        : ofOtherDevices
}

function recordPathFor(directory: string, name: string, startedAt: Date) {
    const folder =
        directory.trim().replace(/\/+$/, '') || defaultRecordDirectory
    const prefix = withoutIllegalFileNameCharacters(name) || defaultRecordName

    return `${folder}/${prefix}${recordFileSuffixFor(startedAt)}`
}

function recordFileSuffixFor(date: Date) {
    return `_${timestampFor(date)}.xdf`
}

function withoutIllegalFileNameCharacters(name: string) {
    return name.trim().replace(/[\\/:*?"<>|]/g, '-')
}

function timestampFor(date: Date) {
    const padded = (value: number) => String(value).padStart(2, '0')

    const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]

    return `${day.map(padded).join('-')}_${time.map(padded).join('-')}`
}

function sendToOrchestrator(
    message: object,
    handlers: OrchestratorReplyHandlers
) {
    const { onReply, onUnreachable } = handlers

    const socket = new WebSocketComponent(`ws://localhost:${orchestratorPort}`)
    let hasReplied = false

    socket.onopen = () => socket.send(JSON.stringify(message))

    socket.onmessage = (event) => {
        hasReplied = true
        onReply(JSON.parse(event.data))
        socket.close()
    }

    socket.onclose = () => {
        if (!hasReplied) {
            onUnreachable()
        }
    }
}

interface OrchestratorReplyHandlers {
    onReply: (reply: OrchestratorReply) => void
    onUnreachable: () => void
}

type OrchestratorReply = Partial<RunningSession> & {
    error?: string
    directory?: string
}

interface RunningSession {
    devices: DeviceRequest[]
    xdfRecordPath?: string
}

type RememberedIdentifiers = Record<string, string[]>

interface SelectedDevice {
    name: string
    identifier: string
}

interface DeviceRequest {
    deviceName: string
    identifier?: string
}

// Test doubles

export let StreamMonitorComponent = StreamMonitor

export function setStreamMonitorComponent(component: typeof StreamMonitor) {
    StreamMonitorComponent = component
}

export let now = () => new Date()

export function setNow(nextNow: typeof now) {
    now = nextNow
}

export let everySecond = (callback: () => void) => {
    const id = setInterval(callback, 1000)
    return () => clearInterval(id)
}

export function setEverySecond(nextEverySecond: typeof everySecond) {
    everySecond = nextEverySecond
}
