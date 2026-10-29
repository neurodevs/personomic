import React, { useEffect, useRef, useState } from 'react'

import familyOf from '../../functions/familyOf'
import readXdfRecording, { Recording } from '../../functions/readXdfRecording'
import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../../functions/sendToOrchestrator'
import AddBiosensorButton from '../components/AddBiosensorButton'
import BiosensorsSection from '../components/BiosensorsSection'
import PlaybackControls from '../components/PlaybackControls'
import PlayRecordingButton, {
    RecordingPicker,
} from '../components/PlayRecordingButton'
import {
    defaultRecordDirectory,
    defaultRecordName,
    now,
    recordFileSuffixFor,
} from '../components/RecordPathFields'
import ProtocolForm from '../components/ProtocolForm'
import { defaultCueVoice } from '../components/PlannedEvents'
import ProtocolPhases, { Phase } from '../components/ProtocolPhases'
import RecordXdfControls, {
    RecordXdfControlsProps,
} from '../components/RecordXdfControls'
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
import useDirectoryBrowser from '../hooks/useDirectoryBrowser'
import useWarningBeforeLeaving from '../hooks/useWarningBeforeLeaving'
import {
    displayNameOf,
    fileContentsOf,
    hasUnsavedChanges,
    isSameProtocolName,
    recordDirectoryFor,
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

const chooseRecordingMessage = 'Choose an XDF recording to see its biosensors.'

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
        rememberedRecordDirectory
    )
    const [recordName, setRecordName] = useState(defaultRecordName)
    const [recordStartedAt, setRecordStartedAt] = useState<Date>()
    const [recordingPath, setRecordingPath] = useState<string>()
    const [session, setSession] = useState<SessionState>('unlocked')
    const [sessionError, setSessionError] = useState<string>()
    const [numMonitorResets, setNumMonitorResets] = useState(0)
    const [reportedIdentifiers, setReportedIdentifiers] = useState<
        Record<string, string>
    >({})

    const rememberReportedIdentifier = (key: string, identifier: string) =>
        setReportedIdentifiers((previous) =>
            previous[key] === identifier
                ? previous
                : { ...previous, [key]: identifier }
        )
    const [playing, setPlaying] = useState<PlayingRecording>()
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [isLooping, setIsLooping] = useState(false)
    const [isPositionHeld, setIsPositionHeld] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [mode, setMode] = useState<SessionMode>('live')
    const [protocolFileName, setProtocolFileName] = useState<string>()
    const [isEditingProtocol, setIsEditingProtocol] = useState(false)
    const [protocolName, setProtocolName] = useState('')
    const [protocolSavedTo, setProtocolSavedTo] = useState<string>()
    const [phases, setPhases] = useState<Phase[]>([])
    const [voice, setVoice] = useState(defaultCueVoice)

    const isLocked = session !== 'unlocked'
    const isPlaying = session === 'playing'
    const isLive = mode === 'live'
    const isChoosingRecording = mode === 'playback' && !isPlaying
    const recordingPicker = useRef<RecordingPicker>(null)
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

    const editedProtocol = protocolEditedFrom({
        name: protocolName,
        devices,
        recordXdf: isRecordEnabled,
        recordDirectory,
        recordFileStub: recordName,
        voice,
        phases,
    })

    const isProtocolRenamed =
        chosenProtocolFile !== undefined &&
        !isSameProtocolName(protocolName, chosenProtocolFile.protocol.name)
    const hasUnsavedProtocolEdits =
        chosenProtocolFile !== undefined &&
        isEditingProtocol &&
        hasUnsavedChanges({
            protocol: editedProtocol,
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
            fillFrom(file.protocol)
        } else {
            setRecordDirectory(rememberedRecordDirectory())
            setPhases([])
            setVoice(defaultCueVoice)
        }
    }

    const fillFrom = (protocol: Protocol) => {
        const { devices, recordXdf, recordDirectory, recordFileStub } = protocol

        setDevices(devices)
        setPhases(protocol.phases ?? [])
        setVoice(protocol.voice || defaultCueVoice)
        setIsRecordEnabled(recordXdf ?? false)

        setRecordDirectory(recordDirectory || recordDirectoryFor(protocol))

        if (recordFileStub) {
            setRecordName(recordFileStub)
        }
    }

    const editProtocol = () => {
        setIsEditingProtocol(true)
        setProtocolName(chosenProtocolFile!.protocol.name)
        setProtocolSavedTo(undefined)
    }

    const cancelEditingProtocol = () => {
        fillFrom(chosenProtocolFile!.protocol)
        setIsEditingProtocol(false)
    }

    const saveProtocol = () => {
        const protocol = editedProtocol

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

    const { isBrowsing, browse: browseForRecordDirectory } =
        useDirectoryBrowser(rememberRecordDirectory, setSessionError)

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
        setReportedIdentifiers({})
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
                ...(chosenProtocolFile && {
                    protocol: fileContentsOf({
                        ...editedProtocol,
                        name: isEditingProtocol
                            ? editedProtocol.name
                            : chosenProtocolFile.protocol.name,
                    }),
                }),
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

    const recordControls: RecordXdfControlsProps = {
        isOn: isRecordEnabled,
        onIsOnChange: setIsRecordEnabled,
        recordingPath,
        onRevealRecording: revealRecording,
        directory: recordDirectory,
        directoryPlaceholder: isEditingProtocol
            ? recordDirectoryFor({ name: protocolName, devices: [] })
            : undefined,
        name: recordName,
        isLocked,
        isBrowsing,
        startedAt: session === 'connecting' ? recordStartedAt : undefined,
        onDirectoryChange: isEditingProtocol
            ? setRecordDirectory
            : rememberRecordDirectory,
        onNameChange: setRecordName,
        onBrowse: browseForRecordDirectory,
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
                        ref={recordingPicker}
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
                {isLive && (
                    <>
                        {chosenProtocolFile && isEditingProtocol && (
                            <>
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
                            </>
                        )}
                        {protocolSavedTo && (
                            <span
                                className="session-protocol__saved"
                                role="status"
                            >
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
                    </>
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
                        isLooping={isLooping}
                        onLoopChange={setIsLooping}
                        onHold={() => setIsPositionHeld(true)}
                        onRelease={() => setIsPositionHeld(false)}
                        onSpeedChange={setPlaybackSpeed}
                    />
                )}
                {isLive && !isEditingProtocol && (
                    <ControlGroup
                        isOnOwnLine={
                            isRecordEnabled || recordingPath !== undefined
                        }
                    >
                        <RecordXdfControls {...recordControls} />
                    </ControlGroup>
                )}
                {sessionError && (
                    <span className="connect-devices__error" role="alert">
                        {sessionError}
                    </span>
                )}
            </div>
            <div className="card">
                <ProtocolForm
                    isOpen={
                        isEditingProtocol && chosenProtocolFile !== undefined
                    }
                    name={protocolName}
                    namePlaceholder="Protocol name"
                    onNameChange={setProtocolName}
                    takenName={
                        protocolWithSameName &&
                        displayNameOf(protocolWithSameName.protocol)
                    }
                    record={recordControls}
                    saveLabel={isProtocolRenamed ? 'Save as new' : 'Save'}
                    isSaveDisabled={protocolWithSameName !== undefined}
                    onSave={saveProtocol}
                    onCancel={cancelEditingProtocol}
                >
                    <BiosensorsSection
                        isEmpty={monitoredNames.length === 0}
                        emptyMessage={
                            isChoosingRecording
                                ? chooseRecordingMessage
                                : undefined
                        }
                        onEmptyClick={
                            isChoosingRecording
                                ? () => recordingPicker.current?.open()
                                : undefined
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
                            isPlaybackLooping={isLooping}
                            onPlaybackEnd={markPlaybackEnded}
                            onPlaybackProgress={showPlaybackProgress}
                            onPlaybackSeek={seek}
                            streamOptions={streamOptions}
                            windowSecondsByDevice={windowSecondsByDevice}
                            isConnecting={session === 'connecting'}
                            isRecording={isRecordEnabled}
                            identifiers={identifiers}
                            reportedIdentifiers={reportedIdentifiers}
                            onIdentifierReported={rememberReportedIdentifier}
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
                            onNicknameChange={
                                isLocked ? undefined : setNickname
                            }
                            disabledStreams={disabledStreams}
                            onDisabledStreamsChange={
                                canChangeDevices
                                    ? setDisabledStreams
                                    : undefined
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
                    {isLive && chosenProtocolFile && (
                        <ProtocolPhases
                            phases={phases}
                            isLocked={!isEditingProtocol}
                            voice={voice}
                            onChange={setPhases}
                            onVoiceChange={setVoice}
                        />
                    )}
                </ProtocolForm>
            </div>
        </>
    )
}

export default SessionView

interface ControlGroupProps {
    isOnOwnLine: boolean
    children: React.ReactNode
}

const ControlGroup: React.FC<ControlGroupProps> = ({
    isOnOwnLine,
    children,
}) => (
    <span
        className={[
            'connect-devices__group',
            isOnOwnLine && 'connect-devices__group--own-line',
        ]
            .filter(Boolean)
            .join(' ')}
    >
        {children}
    </span>
)

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

function protocolEditedFrom(edited: EditedProtocol): Protocol {
    const name = edited.name.trim()

    return {
        ...edited,
        name,
        recordDirectory: withoutDefault(
            edited.recordDirectory,
            recordDirectoryFor({ name, devices: [] })
        ),
        recordFileStub: withoutDefault(
            edited.recordFileStub,
            defaultRecordName
        ),
    }
}

type EditedProtocol = Required<Protocol>

function withoutDefault(value: string, defaultValue: string) {
    return value === defaultValue ? '' : value
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

function rememberedRecordDirectory() {
    return (
        localStorage.getItem(recordDirectoryStorageKey) ??
        defaultRecordDirectory
    )
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
