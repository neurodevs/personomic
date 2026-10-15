import React, { useEffect, useState } from 'react'

import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'

import familyOf from '../functions/familyOf'
import readXdfRecording, { Recording } from '../functions/readXdfRecording'
import AddBiosensorButton from './components/AddBiosensorButton'
import PlaybackControls from './components/PlaybackControls'
import PlayRecordingButton from './components/PlayRecordingButton'
import RecordPathFields, {
    defaultRecordDirectory,
    defaultRecordName,
    now,
    recordFileSuffixFor,
} from './components/RecordPathFields'
import StreamMonitor, {
    deviceKeysFor,
    PlaybackProgress,
    PlaybackSeek,
    StreamOptions,
    WebSocketComponent,
} from './components/StreamMonitor'
import { Downsampling } from './components/StreamPlot'

const orchestratorPort = 8763

const anyMuseName = 'Muse (auto-detect, slower)'

const biosensorNames = DEVICE_NAMES.flatMap((name) =>
    name === 'Muse S Athena' ? [anyMuseName, name] : [name]
)

const requestedNames: Record<string, string> = {
    [anyMuseName]: 'Muse',
}

const identifierLabels: Record<string, string> = {
    'Cognionics Quick-20r': 'Serial number',
    'Govee Thermohygrometer H5074': 'UUID',
    [anyMuseName]: 'UUID',
    'Muse S Athena': 'UUID',
    'Muse S Gen 2': 'UUID',
    'Muse S Gen 1': 'UUID',
    'Muse 2': 'UUID',
    'Muse 1 Gen 2': 'UUID',
    'OpenBCI Cyton': 'Serial number',
}

const orchestratorUnreachableMessage =
    'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.'

const recordDirectoryStorageKey = 'personomic.recordDirectory'
const rememberedIdentifiersStorageKey = 'personomic.rememberedIdentifiers'

const streamOptions: Record<string, StreamOptions> = {
    EEG: {
        bandPowers: { windowSeconds: 4, channelsLeftOut: ['AUX'] },
    },
    PPG: {
        detectPeaks: {
            channels: ['AMBIENT', 'INFRARED'],
            heartRateWindowSeconds: 30,
            hrvWindowSeconds: 300,
            hrvProvisionalAfterSeconds: 30,
        },
    },
    Temperature: { units: '°C' },
    Humidity: { yLimits: { min: 0, max: 100 }, units: '%' },
    Battery: { yLimits: { min: 0, max: 100 }, units: '%' },
}

const intermittentWindowSeconds = 120

const windowSecondsByDevice: Record<string, number> = {
    'Govee Thermohygrometer H5074': intermittentWindowSeconds,
}

const sessionButtonLabels: Record<SessionState, string> = {
    unlocked: 'Connect',
    connecting: 'Connecting…',
    locked: 'Stop',
    stopping: 'Stopping…',
    playing: 'Stop',
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
    const [playing, setPlaying] = useState<PlayingRecording>()
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [isPositionHeld, setIsPositionHeld] = useState(false)

    const isLocked = session !== 'unlocked'
    const isPlaying = session === 'playing'

    const resetMonitor = () => setNumMonitorResets((previous) => previous + 1)

    const deviceNames = devices.map(({ name }) => name)
    const deviceKeys = deviceKeysFor(deviceNames)

    const addableNames = biosensorNames.filter(
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

        setDevices(selectedFrom(devices))
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
                `Must give each ${familyOf(indistinguishable)} its own ${identifierLabels[indistinguishable]}!`
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
                devices: deviceRequests.map(requestedFrom),
                xdfRecordPath: isRecordEnabled
                    ? recordPathFor(recordDirectory, recordName, startedAt)
                    : undefined,
            },
            {
                onReply: ({ error, devices, xdfRecordPath }) => {
                    if (devices) {
                        setDevices(selectedFrom(devices))
                    }

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

    const playRecordingIn = async (file: File) => {
        setSessionError(undefined)

        try {
            const recording = readXdfRecording(await file.arrayBuffer())

            if (recording.devices.length === 0) {
                throw new Error('It holds no samples.')
            }

            setPlaying({
                fileName: file.name,
                recording,
                devicesChosenBefore: devices,
                hasEnded: false,
            })
            setPlaybackSpeed(1)
            setDevices(
                recording.devices.map(({ deviceName }) => ({
                    name: deviceName,
                    identifier: '',
                }))
            )
            setSession('playing')
            resetMonitor()
        } catch (err) {
            setSessionError(
                `Could not play ${file.name}. ${(err as Error).message}`
            )
        }
    }

    const stopPlaying = () => {
        setDevices(playing?.devicesChosenBefore ?? [])
        setPlaying(undefined)
        setSession('unlocked')
        resetMonitor()
    }

    const endSession = isPlaying ? stopPlaying : stopSession

    const showPlaybackProgress = (progress: PlaybackProgress) =>
        setPlaying((previous) => previous && { ...previous, progress })

    const markPlaybackEnded = () =>
        setPlaying((previous) => previous && { ...previous, hasEnded: true })

    const replay = () => {
        setPlaying(
            (previous) =>
                previous && {
                    ...previous,
                    hasEnded: false,
                    seek: undefined,
                    progress: undefined,
                }
        )
        resetMonitor()
    }

    const seek = (seconds: number) => {
        setPlaying(
            (previous) =>
                previous && {
                    ...previous,
                    hasEnded: false,
                    seek: { seconds },
                    progress: previous.progress && {
                        ...previous.progress,
                        elapsedSeconds: seconds,
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
            <div className="connect-devices">
                <button
                    type="button"
                    className="connect-devices__button"
                    disabled={
                        session === 'connecting' ||
                        session === 'stopping' ||
                        deviceNames.length === 0
                    }
                    onClick={isLocked ? endSession : connectDevices}
                >
                    {sessionButtonLabelFor(session, deviceNames)}
                </button>
                {!isLocked && (
                    <PlayRecordingButton
                        onChoose={(file) => void playRecordingIn(file)}
                    />
                )}
                {playing && (
                    <PlaybackControls
                        fileName={playing.fileName}
                        hasEnded={playing.hasEnded}
                        progress={playing.progress}
                        speed={playbackSpeed}
                        onReplay={replay}
                        onSeek={seek}
                        onHold={() => setIsPositionHeld(true)}
                        onRelease={() => setIsPositionHeld(false)}
                        onSpeedChange={setPlaybackSpeed}
                    />
                )}
                {!isPlaying && (
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
                )}
                {isRecordEnabled && !recordingPath && !isPlaying && (
                    <RecordPathFields
                        directory={recordDirectory}
                        name={recordName}
                        isLocked={isLocked}
                        isBrowsing={isBrowsing}
                        startedAt={
                            session === 'connecting'
                                ? recordStartedAt
                                : undefined
                        }
                        onDirectoryChange={rememberRecordDirectory}
                        onNameChange={setRecordName}
                        onBrowse={chooseRecordDirectory}
                    />
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
            <StreamMonitorComponent
                key={numMonitorResets}
                downsampling={downsampling}
                deviceStatusPort={8764}
                deviceNames={deviceNames}
                recording={playing?.recording}
                playbackSpeed={playbackSpeed}
                playbackSeek={playing?.seek}
                isPlaybackPaused={isPositionHeld}
                onPlaybackEnd={markPlaybackEnded}
                onPlaybackProgress={showPlaybackProgress}
                streamOptions={streamOptions}
                windowSecondsByDevice={windowSecondsByDevice}
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
        </main>
    )
}

export default App

type SessionState =
    'unlocked' | 'connecting' | 'locked' | 'stopping' | 'playing'

interface PlayingRecording {
    fileName: string
    recording: Recording
    devicesChosenBefore: SelectedDevice[]
    hasEnded: boolean
    seek?: PlaybackSeek
    progress?: PlaybackProgress
}

function sessionButtonLabelFor(session: SessionState, deviceNames: string[]) {
    return session === 'connecting' && deviceNames.includes(anyMuseName)
        ? 'Detecting Muse model…'
        : sessionButtonLabels[session]
}

function recordPathFor(directory: string, name: string, startedAt: Date) {
    const folder =
        directory.trim().replace(/\/+$/, '') || defaultRecordDirectory
    const prefix = withoutIllegalFileNameCharacters(name) || defaultRecordName

    return `${folder}/${prefix}${recordFileSuffixFor(startedAt)}`
}

function withoutIllegalFileNameCharacters(name: string) {
    return name.trim().replace(/[\\/:*?"<>|]/g, '-')
}

function requestedFrom(request: DeviceRequest): DeviceRequest {
    const { deviceName } = request
    return { ...request, deviceName: requestedNames[deviceName] ?? deviceName }
}

function selectedFrom(requests: DeviceRequest[]): SelectedDevice[] {
    return requests.map(({ deviceName, identifier = '' }) => ({
        name: deviceName,
        identifier,
    }))
}

function nameOfDevicesWithoutOwnIdentifier(requests: DeviceRequest[]) {
    const seen = new Set<string>()

    for (const { deviceName, identifier } of requests) {
        const family = familyOf(deviceName)
        const isRepeated =
            requests.filter((other) => familyOf(other.deviceName) === family)
                .length > 1
        const own = `${family}/${identifier}`

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

export {
    everySecond,
    now,
    setEverySecond,
    setNow,
} from './components/RecordPathFields'
