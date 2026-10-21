import React, { useEffect, useState } from 'react'

import familyOf from '../../functions/familyOf'
import readXdfRecording, { Recording } from '../../functions/readXdfRecording'
import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../../functions/sendToOrchestrator'
import AddBiosensorButton from '../components/AddBiosensorButton'
import BiosensorsSection from '../components/BiosensorsSection'
import PlaybackControls from '../components/PlaybackControls'
import PlayRecordingButton from '../components/PlayRecordingButton'
import RecordPathFields, {
    defaultRecordDirectory,
    defaultRecordName,
    now,
    recordFileSuffixFor,
} from '../components/RecordPathFields'
import StreamMonitor, {
    PlaybackProgress,
    PlaybackSeek,
    StreamOptions,
} from '../components/StreamMonitor'
import { Downsampling } from '../components/StreamPlot'
import useBiosensorChoices, {
    anyMuseName,
    DeviceRequest,
    identifierLabels,
    requestedFrom,
    SelectedDevice,
    selectedFrom,
} from '../hooks/useBiosensorChoices'
import useWarningBeforeLeaving from '../hooks/useWarningBeforeLeaving'
import {
    displayNameOf,
    fileContentsOf,
    hasUnsavedChanges,
    revealProtocol,
    Protocol,
    ProtocolFile,
} from './ProtocolsView'

const recordDirectoryStorageKey = 'personomic.recordDirectory'

const streamOptions: Record<string, StreamOptions> = {
    EEG: {
        bandPowers: { windowSeconds: 4, channelsLeftOut: ['AUX'] },
    },
    PPG: {
        detectPeaks: {
            channels: ['INFRARED'],
            heartRateWindowSeconds: 30,
            hrvWindowSeconds: 300,
            hrvProvisionalAfterSeconds: 30,
        },
    },
    Temperature: { units: '°C' },
    Humidity: { yLimits: { min: 0, max: 100 }, units: '%' },
    Battery: { yLimits: { min: 0, max: 100 }, units: '%' },
}

const chooseRecordingMessage = 'Choose a recording to see its biosensors.'

const intermittentWindowSeconds = 120

const windowSecondsByDevice: Record<string, number> = {
    'Govee Thermohygrometer H5074': intermittentWindowSeconds,
}

const sessionModeLabels: Record<SessionMode, string> = {
    live: 'Live',
    playback: 'Playback',
}

const sessionModes = Object.keys(sessionModeLabels) as SessionMode[]

const sessionButtonLabels: Record<SessionState, string> = {
    unlocked: 'Connect',
    connecting: 'Connecting…',
    locked: 'Stop',
    stopping: 'Stopping…',
    playing: 'Stop',
}

export interface SessionViewProps {
    downsampling?: Downsampling
    protocolFiles?: ProtocolFile[]
    onProtocolFilesChange?: (
        change: (files: ProtocolFile[]) => ProtocolFile[]
    ) => void
}

const SessionView: React.FC<SessionViewProps> = (props: SessionViewProps) => {
    const { downsampling, protocolFiles = [], onProtocolFilesChange } = props

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
    const [session, setSession] = useState<SessionState>('unlocked')
    const [sessionError, setSessionError] = useState<string>()
    const [numMonitorResets, setNumMonitorResets] = useState(0)
    const [playing, setPlaying] = useState<PlayingRecording>()
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [isPositionHeld, setIsPositionHeld] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [mode, setMode] = useState<SessionMode>('live')
    const [protocolFileName, setProtocolFileName] = useState<string>()
    const [isEditingProtocol, setIsEditingProtocol] = useState(false)
    const [protocolName, setProtocolName] = useState('')
    const [protocolSavedTo, setProtocolSavedTo] = useState<string>()

    const isLocked = session !== 'unlocked'
    const isPlaying = session === 'playing'
    const isLive = mode === 'live'
    const isChoosingRecording = mode === 'playback' && !isPlaying
    const monitoredNames = isChoosingRecording
        ? []
        : devices.map(({ name }) => name)

    const savedProtocolFiles = protocolFiles.filter(
        ({ fileName }) => fileName !== undefined
    )
    const chosenProtocolFile = savedProtocolFiles.find(
        ({ fileName }) => fileName === protocolFileName
    )
    const isProtocolLocked =
        chosenProtocolFile !== undefined && !isEditingProtocol
    const canChangeDevices = isLive && !isLocked && !isProtocolLocked

    const isProtocolRenamed =
        chosenProtocolFile !== undefined &&
        !isSameProtocolName(protocolName, chosenProtocolFile.protocol.name)
    const hasUnsavedProtocolEdits =
        chosenProtocolFile !== undefined &&
        isEditingProtocol &&
        hasUnsavedChanges({
            protocol: { name: protocolName.trim(), devices },
            savedProtocol: chosenProtocolFile.savedProtocol,
        })

    useWarningBeforeLeaving(hasUnsavedProtocolEdits)

    const protocolWithSameName = savedProtocolFiles.find(
        (file) =>
            file !== chosenProtocolFile &&
            isSameProtocolName(protocolName, file.protocol.name)
    )

    const resetMonitor = () => setNumMonitorResets((previous) => previous + 1)

    const {
        deviceNames,
        addableNames,
        addDevice,
        removeDevice,
        setIdentifierValue,
        setNickname,
        nicknames,
        setDisabledStreams,
        disabledStreams,
        identifiers,
        scanningDeviceNames,
        scannedIdentifiers,
        deviceRequests,
        rememberedIdentifiers,
        rememberIdentifiersOf,
        forgetIdentifier,
    } = useBiosensorChoices({
        devices,
        changeDevices: setDevices,
        isLocked: isLocked || isChoosingRecording,
    })

    const chooseProtocol = (fileName: string) => {
        const file = savedProtocolFiles.find(
            (other) => other.fileName === fileName
        )

        setProtocolFileName(file?.fileName)
        setProtocolSavedTo(undefined)

        if (file) {
            setDevices(file.protocol.devices)
        }
    }

    const editProtocol = () => {
        setIsEditingProtocol(true)
        setProtocolName(chosenProtocolFile!.protocol.name)
        setProtocolSavedTo(undefined)
    }

    const cancelEditingProtocol = () => {
        setDevices(chosenProtocolFile!.protocol.devices)
        setIsEditingProtocol(false)
    }

    const saveProtocol = () => {
        const protocol: Protocol = { name: protocolName.trim(), devices }

        setSessionError(undefined)

        sendToOrchestrator<{ fileName?: string; filePath?: string }>(
            {
                command: 'saveProtocol',
                fileName: isProtocolRenamed
                    ? undefined
                    : chosenProtocolFile!.fileName,
                protocol: fileContentsOf(protocol),
            },
            {
                onReply: ({ error, fileName, filePath }) => {
                    setSessionError(error)

                    if (fileName) {
                        onProtocolFilesChange?.((previous) =>
                            withSavedProtocol(previous, {
                                fileName,
                                protocol,
                                savedProtocol: protocol,
                            })
                        )
                        setProtocolFileName(fileName)
                        setIsEditingProtocol(false)
                        setProtocolSavedTo(filePath ?? fileName)
                    }
                },
                onUnreachable: () =>
                    setSessionError(orchestratorUnreachableMessage),
            }
        )
    }

    const rememberRecordDirectory = (directory: string) => {
        setRecordDirectory(directory)
        localStorage.setItem(recordDirectoryStorageKey, directory)
    }

    const chooseRecordDirectory = () => {
        setIsBrowsing(true)
        setSessionError(undefined)

        sendToOrchestrator<OrchestratorReply>(
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

        sendToOrchestrator<OrchestratorReply>(
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
        sendToOrchestrator<OrchestratorReply>(
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

        sendToOrchestrator<OrchestratorReply>(
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

        sendToOrchestrator<OrchestratorReply>(
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
            setIsPaused(false)
            setDevices(
                recording.devices.map(({ deviceName, nickname = '' }) => ({
                    name: deviceName,
                    identifier: '',
                    nickname,
                    disabledStreams: [],
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
        setIsPaused(false)
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
        <>
            <div className="connect-devices">
                {!isChoosingRecording && (
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
                )}
                {isChoosingRecording && (
                    <PlayRecordingButton
                        onChoose={(file) => void playRecordingIn(file)}
                    />
                )}
                <div
                    className="session-mode"
                    role="radiogroup"
                    aria-label="Session mode"
                >
                    {sessionModes.map((id) => (
                        <button
                            key={id}
                            type="button"
                            role="radio"
                            className="session-mode__option"
                            aria-checked={mode === id}
                            disabled={isLocked || isEditingProtocol}
                            onClick={() => setMode(id)}
                        >
                            {sessionModeLabels[id]}
                        </button>
                    ))}
                </div>
                {isLive && (
                    <select
                        className="session-protocol__select"
                        aria-label="Protocol"
                        value={chosenProtocolFile?.fileName ?? ''}
                        disabled={isLocked || isEditingProtocol}
                        onChange={(event) => chooseProtocol(event.target.value)}
                    >
                        <option value="">No protocol</option>
                        {savedProtocolFiles.map(({ fileName, protocol }) => (
                            <option key={fileName} value={fileName}>
                                {displayNameOf(protocol)}
                            </option>
                        ))}
                    </select>
                )}
                {isLive &&
                    chosenProtocolFile &&
                    !isEditingProtocol &&
                    !isLocked && (
                        <button
                            type="button"
                            className="session-protocol__button"
                            onClick={editProtocol}
                        >
                            Edit protocol
                        </button>
                    )}
                {playing && (
                    <PlaybackControls
                        fileName={playing.fileName}
                        hasEnded={playing.hasEnded}
                        progress={playing.progress}
                        speed={playbackSpeed}
                        onReplay={replay}
                        onSeek={seek}
                        isPaused={isPaused}
                        onPause={() => setIsPaused(true)}
                        onPlay={() => setIsPaused(false)}
                        onHold={() => setIsPositionHeld(true)}
                        onRelease={() => setIsPositionHeld(false)}
                        onSpeedChange={setPlaybackSpeed}
                    />
                )}
                {isLive && (
                    <label className="connect-devices__record-toggle">
                        <input
                            type="checkbox"
                            checked={isRecordEnabled}
                            disabled={isLocked}
                            onChange={(event) =>
                                setIsRecordEnabled(event.target.checked)
                            }
                        />
                        Record XDF
                    </label>
                )}
                {isLive && isRecordEnabled && !recordingPath && (
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
                {isLive && protocolSavedTo && (
                    <span className="session-protocol__saved" role="status">
                        Saved to{' '}
                        <button
                            type="button"
                            className="saved-path"
                            title="Show in Finder"
                            onClick={() =>
                                revealProtocol(
                                    chosenProtocolFile!.fileName!,
                                    setSessionError
                                )
                            }
                        >
                            {protocolSavedTo}
                        </button>
                    </span>
                )}
                {sessionError && (
                    <span className="connect-devices__error" role="alert">
                        {sessionError}
                    </span>
                )}
            </div>
            <div className="card">
                {chosenProtocolFile && isEditingProtocol && (
                    <div className="session-protocol">
                        <span className="session-protocol__heading">
                            Editing protocol
                            {hasUnsavedProtocolEdits && (
                                <span
                                    className="session-protocol__unsaved"
                                    role="img"
                                    aria-label="Unsaved changes"
                                    title="Unsaved changes"
                                />
                            )}
                        </span>
                        <input
                            type="text"
                            className="session-protocol__name"
                            aria-label="Protocol name"
                            placeholder="Protocol name"
                            value={protocolName}
                            onChange={(event) =>
                                setProtocolName(event.target.value)
                            }
                        />
                        <button
                            type="button"
                            className="session-protocol__button session-protocol__button--primary"
                            disabled={protocolWithSameName !== undefined}
                            onClick={saveProtocol}
                        >
                            {isProtocolRenamed ? 'Save as new' : 'Save'}
                        </button>
                        <button
                            type="button"
                            className="session-protocol__button"
                            onClick={cancelEditingProtocol}
                        >
                            Cancel
                        </button>
                        {protocolWithSameName && (
                            <span className="session-protocol__hint">
                                {displayNameOf(protocolWithSameName.protocol)}{' '}
                                is already a protocol.
                            </span>
                        )}
                    </div>
                )}
                <BiosensorsSection
                    isEmpty={monitoredNames.length === 0}
                    emptyMessage={
                        isChoosingRecording ? chooseRecordingMessage : undefined
                    }
                >
                    <StreamMonitorComponent
                        key={numMonitorResets}
                        downsampling={downsampling}
                        deviceStatusPort={8764}
                        deviceNames={monitoredNames}
                        recording={playing?.recording}
                        playbackSpeed={playbackSpeed}
                        playbackSeek={playing?.seek}
                        isPlaybackPaused={isPositionHeld || isPaused}
                        onPlaybackEnd={markPlaybackEnded}
                        onPlaybackProgress={showPlaybackProgress}
                        onPlaybackSeek={seek}
                        streamOptions={streamOptions}
                        windowSecondsByDevice={windowSecondsByDevice}
                        isConnecting={session === 'connecting'}
                        isRecording={isRecordEnabled}
                        identifiers={identifiers}
                        rememberedIdentifiers={rememberedIdentifiers}
                        scannedIdentifiers={scannedIdentifiers}
                        scanningDeviceNames={scanningDeviceNames}
                        onForgetIdentifier={
                            isLocked ? undefined : forgetIdentifier
                        }
                        onIdentifierChange={
                            isLocked ? undefined : setIdentifierValue
                        }
                        nicknames={nicknames}
                        onNicknameChange={isLocked ? undefined : setNickname}
                        disabledStreams={disabledStreams}
                        onDisabledStreamsChange={
                            canChangeDevices ? setDisabledStreams : undefined
                        }
                        onRemoveDevice={
                            canChangeDevices ? removeDevice : undefined
                        }
                    />
                    {canChangeDevices && addableNames.length > 0 && (
                        <AddBiosensorButton
                            names={addableNames}
                            onAdd={addDevice}
                        />
                    )}
                </BiosensorsSection>
            </div>
        </>
    )
}

export default SessionView

type SessionMode = 'live' | 'playback'

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

function isSameProtocolName(name: string, other: string) {
    return name.trim().toLowerCase() === other.trim().toLowerCase()
}

function withSavedProtocol(files: ProtocolFile[], saved: ProtocolFile) {
    const isAlreadyListed = files.some(
        ({ fileName }) => fileName === saved.fileName
    )

    return isAlreadyListed
        ? files.map((file) => (file.fileName === saved.fileName ? saved : file))
        : [...files, saved]
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

type OrchestratorReply = Partial<RunningSession> & {
    directory?: string
}

interface RunningSession {
    devices: DeviceRequest[]
    xdfRecordPath?: string
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
} from '../components/RecordPathFields'
