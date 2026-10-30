import React, { useRef, useState } from 'react'

import displayNameOfDevice from '../../functions/displayNameOf'
import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../../functions/sendToOrchestrator'
import AddBiosensorButton from '../components/AddBiosensorButton'
import BiosensorsSection from '../components/BiosensorsSection'
import DevicePanel from '../components/DevicePanel'
import { defaultCueVoice, objectsIn } from '../components/PlannedEvents'
import ProtocolForm from '../components/ProtocolForm'
import ProtocolPhases, { Phase, phasesFrom } from '../components/ProtocolPhases'
import { phaseLengthsOf } from '../components/ScheduleSummary'
import { deviceLabelFor } from '../components/StreamMonitor'
import useBiosensorChoices, {
    DeviceRequest,
    disableStreamsOf,
    requestedFrom,
    SelectedDevice,
    selectedNameOf,
} from '../hooks/useBiosensorChoices'
import useDirectoryBrowser from '../hooks/useDirectoryBrowser'

export interface ProtocolsViewProps {
    files?: ProtocolFile[]
    listingError?: string
    onFilesChange: (change: (files: ProtocolFile[]) => ProtocolFile[]) => void
    selectedIndex?: number
    onSelectedIndexChange: React.Dispatch<
        React.SetStateAction<number | undefined>
    >
}

const ProtocolsView: React.FC<ProtocolsViewProps> = (
    props: ProtocolsViewProps
) => {
    const {
        files,
        listingError,
        onFilesChange,
        selectedIndex,
        onSelectedIndexChange: setSelectedIndex,
    } = props

    const [savedTo, setSavedTo] = useState<string>()
    const [actionError, setActionError] = useState<string>()
    const [confirmingRemoveAt, setConfirmingRemoveAt] = useState<number>()
    const [shouldDeleteFile, setShouldDeleteFile] = useState(false)

    const { isBrowsing, browse: browseForRecordDirectory } =
        useDirectoryBrowser((recordDirectory) => {
            onFilesChange((previous) =>
                previous.map((file, index) =>
                    index === selectedIndex
                        ? {
                              ...file,
                              protocol: { ...file.protocol, recordDirectory },
                          }
                        : file
                )
            )
            setSavedTo(undefined)
        }, setActionError)

    if (files === undefined) {
        return <p className="protocols__empty">Loading protocols…</p>
    }

    const selected =
        selectedIndex === undefined ? undefined : files[selectedIndex]

    const error = actionError ?? listingError

    const protocolWithSameName =
        selected && selected.protocol.name.trim()
            ? files.find(
                  (file, index) =>
                      index !== selectedIndex &&
                      isSameProtocolName(
                          file.protocol.name,
                          selected.protocol.name
                      )
              )
            : undefined

    const select = (index?: number) => {
        setSelectedIndex(index)
        setSavedTo(undefined)
        setActionError(undefined)
    }

    const close = () => select(undefined)

    const toggle = (index: number) =>
        index === selectedIndex ? close() : select(index)

    const addProtocol = () => {
        onFilesChange((previous) => [
            ...previous,
            { protocol: { name: '', devices: [], recordXdf: true } },
        ])
        select(files.length)
    }

    const uploadProtocolIn = async (file: UploadedFile) => {
        setActionError(undefined)

        const contents = parsedJsonOf(await file.text())

        if (!isPlainObject(contents)) {
            setActionError(
                `Could not upload ${file.name}. It does not hold a protocol.`
            )
            return
        }

        onFilesChange((previous) => [
            ...previous,
            { protocol: protocolFrom(contents) },
        ])
        select(files.length)
    }

    const changeFileAt = (index: number, change: Partial<ProtocolFile>) =>
        onFilesChange((previous) =>
            previous.map((file, other) =>
                other === index ? { ...file, ...change } : file
            )
        )

    const changeSelectedProtocol = (change: Partial<Protocol>) => {
        changeFileAt(selectedIndex!, {
            protocol: { ...selected!.protocol, ...change },
        })
        setSavedTo(undefined)
    }

    const saveSelected = () => {
        const index = selectedIndex!
        const { fileName, protocol } = selected!

        setSavedTo(undefined)
        setActionError(undefined)

        sendToOrchestrator<{ fileName?: string; filePath?: string }>(
            {
                command: 'saveProtocol',
                fileName,
                protocol: fileContentsOf(protocol),
            },
            {
                onReply: ({ error, fileName, filePath }) => {
                    setActionError(error)

                    if (fileName) {
                        changeFileAt(index, {
                            fileName,
                            savedProtocol: protocol,
                        })
                        setSavedTo(filePath ?? fileName)
                    }
                },
                onUnreachable: () =>
                    setActionError(orchestratorUnreachableMessage),
            }
        )
    }

    const discardSelectedChanges = () => {
        const { savedProtocol } = selected!

        if (savedProtocol) {
            changeFileAt(selectedIndex!, { protocol: savedProtocol })
        } else {
            removeAt(selectedIndex!)
        }

        setSavedTo(undefined)
        setActionError(undefined)
    }

    const removeAt = (index: number) => {
        onFilesChange((previous) =>
            previous.filter((_, other) => other !== index)
        )
        setSelectedIndex((previous) =>
            selectedIndexAfterRemoving(index, previous)
        )
        setConfirmingRemoveAt(undefined)
    }

    const askToRemove = (index: number) => {
        setConfirmingRemoveAt(index)
        setShouldDeleteFile(false)
        setActionError(undefined)
    }

    const confirmRemove = () => {
        const index = confirmingRemoveAt!
        const { fileName } = files[index]

        setActionError(undefined)

        sendToOrchestrator(
            { command: 'removeProtocol', fileName, shouldDeleteFile },
            {
                onReply: ({ error }) => {
                    if (error) {
                        setActionError(error)
                    } else {
                        removeAt(index)
                    }
                },
                onUnreachable: () =>
                    setActionError(orchestratorUnreachableMessage),
            }
        )
    }

    if (files.length === 0) {
        return (
            <FirstProtocolWelcome
                error={error}
                onNew={addProtocol}
                onUpload={(file) => void uploadProtocolIn(file)}
            />
        )
    }

    return (
        <div className="protocols">
            <nav className="protocols__list" aria-label="Protocols">
                <ul className="protocols__items">
                    {files.map((file, index) => {
                        const { fileName, protocol } = file

                        return (
                            <li key={index} className="protocols__row">
                                <button
                                    type="button"
                                    className="protocols__item"
                                    aria-current={index === selectedIndex}
                                    onClick={() => toggle(index)}
                                >
                                    {displayNameOf(protocol)}
                                </button>
                                {hasUnsavedChanges(file) && (
                                    <span
                                        className="protocols__unsaved"
                                        role="img"
                                        aria-label="Unsaved changes"
                                        title="Unsaved changes"
                                    />
                                )}
                                <button
                                    type="button"
                                    className="protocols__download"
                                    aria-label={`Download ${displayNameOf(protocol)}`}
                                    title={
                                        hasUnsavedChanges(file)
                                            ? 'Download (save or cancel changes)'
                                            : 'Download'
                                    }
                                    disabled={hasUnsavedChanges(file)}
                                    onClick={() =>
                                        downloadFile(
                                            fileName!,
                                            fileTextOf(protocol)
                                        )
                                    }
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    className="protocols__remove"
                                    aria-label={`Remove ${displayNameOf(protocol)}`}
                                    title={removeTooltipFor(
                                        file,
                                        confirmingRemoveAt === index
                                    )}
                                    disabled={
                                        confirmingRemoveAt === index ||
                                        hasUnsavedChanges(file)
                                    }
                                    onClick={() => askToRemove(index)}
                                >
                                    ×
                                </button>
                                {confirmingRemoveAt === index && (
                                    <div className="protocols__confirm-remove">
                                        <p>Remove {displayNameOf(protocol)}?</p>
                                        <label className="protocols__delete-file">
                                            <input
                                                type="checkbox"
                                                checked={shouldDeleteFile}
                                                onChange={(event) =>
                                                    setShouldDeleteFile(
                                                        event.target.checked
                                                    )
                                                }
                                            />
                                            Delete {fileName}
                                        </label>
                                        <div className="protocols__confirm-actions">
                                            <button
                                                type="button"
                                                onClick={confirmRemove}
                                            >
                                                Remove
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setConfirmingRemoveAt(
                                                        undefined
                                                    )
                                                }
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
                <button
                    type="button"
                    className="protocols__new"
                    onClick={addProtocol}
                >
                    New protocol
                </button>
                <UploadProtocolButton
                    onChoose={(file) => void uploadProtocolIn(file)}
                />
            </nav>
            <div className="protocols__main">
                {error && (
                    <p className="protocols__error" role="alert">
                        {error}
                    </p>
                )}
                {!selected && (
                    <ul className="protocols__cards" aria-label="All protocols">
                        {files.map(({ protocol }, index) => (
                            <li key={index}>
                                <button
                                    type="button"
                                    className="protocols__card card"
                                    onClick={() => select(index)}
                                >
                                    <span className="protocols__card-header">
                                        <span className="protocols__card-name">
                                            {displayNameOf(protocol)}
                                        </span>
                                        {protocol.recordXdf && (
                                            <span className="protocols__card-badge">
                                                Records XDF
                                            </span>
                                        )}
                                    </span>
                                    <span className="protocols__card-detail">
                                        {biosensorsSummaryOf(protocol)}
                                    </span>
                                    <span className="protocols__card-detail">
                                        {phasesSummaryOf(protocol)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {selected && (
                    <section className="protocols__editor card">
                        <button
                            type="button"
                            className="protocols__remove protocols__close"
                            aria-label={`Close ${displayNameOf(selected.protocol)}`}
                            title="Close"
                            onClick={close}
                        >
                            ×
                        </button>
                        <ProtocolForm
                            key={selectedIndex}
                            isOpen
                            name={selected.protocol.name}
                            namePlaceholder={untitledName}
                            onNameChange={(name) =>
                                changeSelectedProtocol({ name })
                            }
                            takenName={
                                protocolWithSameName &&
                                displayNameOf(protocolWithSameName.protocol)
                            }
                            record={{
                                isOn: selected.protocol.recordXdf ?? false,
                                onIsOnChange: (recordXdf) =>
                                    changeSelectedProtocol({ recordXdf }),
                                directory:
                                    selected.protocol.recordDirectory ?? '',
                                name: selected.protocol.recordFileStub ?? '',
                                directoryPlaceholder: recordDirectoryFor(
                                    selected.protocol
                                ),
                                isLocked: false,
                                isBrowsing,
                                onDirectoryChange: (recordDirectory) =>
                                    changeSelectedProtocol({ recordDirectory }),
                                onNameChange: (recordFileStub) =>
                                    changeSelectedProtocol({ recordFileStub }),
                                onBrowse: browseForRecordDirectory,
                            }}
                            isSaveDisabled={
                                !hasUnsavedChanges(selected) ||
                                protocolWithSameName !== undefined
                            }
                            onSave={saveSelected}
                            isCancelDisabled={!hasUnsavedChanges(selected)}
                            onCancel={discardSelectedChanges}
                            savedTo={savedTo}
                            onRevealSaved={() =>
                                revealProtocol(
                                    selected.fileName!,
                                    setActionError
                                )
                            }
                        >
                            <ProtocolBiosensors
                                devices={selected.protocol.devices}
                                onDevicesChange={(devices) =>
                                    changeSelectedProtocol({ devices })
                                }
                            />
                            <ProtocolPhases
                                phases={selected.protocol.phases ?? []}
                                voice={
                                    selected.protocol.voice || defaultCueVoice
                                }
                                onChange={(phases) =>
                                    changeSelectedProtocol({ phases })
                                }
                                onVoiceChange={(voice) =>
                                    changeSelectedProtocol({ voice })
                                }
                            />
                        </ProtocolForm>
                    </section>
                )}
            </div>
        </div>
    )
}

export default ProtocolsView

export interface ProtocolFile {
    fileName?: string
    protocol: Protocol
    savedProtocol?: Protocol
}

export interface Protocol {
    name: string
    devices: SelectedDevice[]
    recordXdf?: boolean
    recordDirectory?: string
    recordFileStub?: string
    voice?: string
    phases?: Phase[]
}

const ProtocolBiosensors: React.FC<ProtocolBiosensorsProps> = ({
    devices,
    onDevicesChange,
}) => {
    const {
        deviceNames,
        deviceKeys,
        addableNames,
        addDevice,
        removeDevice,
        moveDevice,
        setIdentifierValue,
        setNickname,
        nicknames,
        setDisabledStreams,
        disabledStreams,
        setExgType,
        exgTypes,
        identifiers,
        scanningDeviceNames,
        scannedIdentifiers,
        rememberedIdentifiers,
        forgetIdentifier,
    } = useBiosensorChoices({
        devices,
        changeDevices: (change) => onDevicesChange(change(devices)),
        isLocked: false,
    })

    return (
        <BiosensorsSection isEmpty={devices.length === 0}>
            {devices.length > 0 && (
                <ul className="protocols__device-list" aria-label="Biosensors">
                    {deviceKeys.map((key, index) => {
                        const name = deviceNames[index]

                        return (
                            <li key={key}>
                                <DevicePanel
                                    device={{
                                        key,
                                        name,
                                        label: deviceLabelFor(
                                            index,
                                            deviceNames
                                        ),
                                        streams: [],
                                        describedStreams: [],
                                    }}
                                    status="disconnected"
                                    isStatusShown={false}
                                    onRemove={removeDevice}
                                    onMove={moveDevice}
                                    identifier={identifiers[key]}
                                    rememberedIdentifiers={
                                        rememberedIdentifiers[name]
                                    }
                                    scannedIdentifiers={
                                        scannedIdentifiers[name]
                                    }
                                    isScanning={scanningDeviceNames.includes(
                                        name
                                    )}
                                    onForgetIdentifier={forgetIdentifier}
                                    onIdentifierChange={setIdentifierValue}
                                    nickname={nicknames[key]}
                                    onNicknameChange={setNickname}
                                    disabledStreams={disabledStreams[key]}
                                    onDisabledStreamsChange={setDisabledStreams}
                                    exgType={exgTypes[key]}
                                    onExgTypeChange={setExgType}
                                />
                            </li>
                        )
                    })}
                </ul>
            )}
            {addableNames.length > 0 && (
                <AddBiosensorButton names={addableNames} onAdd={addDevice} />
            )}
        </BiosensorsSection>
    )
}

interface ProtocolBiosensorsProps {
    devices: SelectedDevice[]
    onDevicesChange: (devices: SelectedDevice[]) => void
}

const FirstProtocolWelcome: React.FC<FirstProtocolWelcomeProps> = ({
    error,
    onNew,
    onUpload,
}) => (
    <div className="protocols-welcome">
        {error && (
            <p className="protocols__error" role="alert">
                {error}
            </p>
        )}
        <section
            className="protocols-welcome__card card"
            aria-labelledby="protocols-welcome-heading"
        >
            <h2
                id="protocols-welcome-heading"
                className="protocols-welcome__heading"
            >
                Create your first protocol
            </h2>
            <p className="protocols-welcome__lead">
                A protocol saves a session's setup as a JSON file, so you can
                run it the same way every time and share it with collaborators.
            </p>
            <ul
                className="protocols-welcome__topics"
                aria-label="What a protocol holds"
            >
                {welcomeTopics.map(({ name, description }) => (
                    <li key={name} className="protocols-welcome__topic">
                        <h3 className="protocols-welcome__topic-name">
                            {name}
                        </h3>
                        <p>{description}</p>
                    </li>
                ))}
            </ul>
            <div className="protocols-welcome__actions">
                <button
                    type="button"
                    className="protocols__save"
                    onClick={onNew}
                >
                    New protocol
                </button>
                <UploadProtocolButton
                    className="protocols__save protocols__cancel"
                    onChoose={onUpload}
                />
            </div>
        </section>
    </div>
)

interface FirstProtocolWelcomeProps {
    error?: string
    onNew: () => void
    onUpload: (file: UploadedFile) => void
}

const welcomeTopics = [
    {
        name: 'Biosensors',
        description: 'Which devices to connect and which streams to keep.',
    },
    {
        name: 'Phases',
        description: 'A timed sequence of blocks, tasks, and more.',
    },
    {
        name: 'Recording',
        description: 'Where to save each session as an XDF file.',
    },
]

interface UploadProtocolButtonProps {
    className?: string
    onChoose: (file: UploadedFile) => void
}

const UploadProtocolButton: React.FC<UploadProtocolButtonProps> = ({
    className = 'protocols__new',
    onChoose,
}) => {
    const protocolToUploadInput = useRef<HTMLInputElement>(null)

    const chooseProtocol = (event: React.ChangeEvent<HTMLInputElement>) => {
        const [file] = event.target.files ?? []
        event.target.value = ''

        if (file) {
            onChoose(file)
        }
    }

    return (
        <>
            <button
                type="button"
                className={className}
                onClick={() => protocolToUploadInput.current?.click()}
            >
                Upload protocol
            </button>
            <input
                ref={protocolToUploadInput}
                type="file"
                accept=".json,application/json"
                hidden
                aria-label="Protocol to upload"
                onChange={chooseProtocol}
            />
        </>
    )
}

type UploadedFile = Pick<File, 'name' | 'text'>

function parsedJsonOf(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        return undefined
    }
}

function isPlainObject(value: unknown): value is ProtocolContents {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const schemaVersion = 1

const untitledName = 'Untitled protocol'
const untitledFileStem = 'untitled-protocol'
const protocolsDirectory = '~/Personomic/Protocols'

function biosensorsSummaryOf({ devices }: Protocol) {
    if (devices.length === 0) {
        return 'No biosensors'
    }

    return devices.map(biosensorLabelOf).join(' · ')
}

function biosensorLabelOf({ name, nickname }: SelectedDevice) {
    const deviceName = displayNameOfDevice(name)

    return nickname.trim() ? `${deviceName} (${nickname.trim()})` : deviceName
}

function phasesSummaryOf({ phases = [] }: Protocol) {
    if (phases.length === 0) {
        return 'No phases'
    }

    const lengths = phaseLengthsOf(phases)
    const timedPhases = phases.map(
        (phase, index) => `${phase.name || 'unnamed phase'} ${lengths[index]}`
    )
    const count = `${phases.length} ${phases.length === 1 ? 'phase' : 'phases'}`

    return `${count}: ${timedPhases.join(' · ')}`
}

function removeTooltipFor(file: ProtocolFile, isAskingToRemove: boolean) {
    if (isAskingToRemove) {
        return 'Remove (confirm or cancel below)'
    }

    return hasUnsavedChanges(file)
        ? 'Remove (save or cancel changes)'
        : 'Remove'
}

function selectedIndexAfterRemoving(removed: number, selected?: number) {
    if (selected === undefined || selected === removed) {
        return undefined
    }

    return selected > removed ? selected - 1 : selected
}

function fileStemFrom(name: string) {
    const stem = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return stem || untitledFileStem
}

export function recordDirectoryFor(protocol: Protocol) {
    return `${protocolsDirectory}/${fileStemFrom(protocol.name)}`
}

export function fileContentsOf(protocol: Protocol) {
    const { name, devices } = protocol

    return {
        schemaVersion,
        name,
        devices: devices.map(requestOf),
        ...recordDefaultsOf(protocol),
        ...(protocol.phases?.length && {
            voice: protocol.voice || defaultCueVoice,
            phases: protocol.phases,
        }),
    }
}

function recordDefaultsOf(protocol: Protocol) {
    const { recordXdf, recordDirectory, recordFileStub } = protocol

    if (!recordXdf) {
        return {}
    }

    return {
        recordXdf,
        recordDirectory: recordDirectory?.trim() || undefined,
        recordFileStub: recordFileStub?.trim() || undefined,
    }
}

function requestOf(device: SelectedDevice): DeviceRequest {
    const { name, identifier, nickname, disabledStreams, exgType } = device

    return requestedFrom({
        deviceName: name,
        identifier: identifier.trim() || undefined,
        nickname: nickname.trim() || undefined,
        disableStreams: disableStreamsOf(disabledStreams),
        exgType,
    })
}

function fileTextOf(protocol: Protocol) {
    return `${JSON.stringify(fileContentsOf(protocol), null, 4)}\n`
}

function downloadThroughBrowser(fileName: string, text: string) {
    const url = URL.createObjectURL(
        new Blob([text], { type: 'application/json' })
    )
    const link = document.createElement('a')

    link.href = url
    link.download = fileName
    link.click()

    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function revealProtocol(
    fileName: string,
    onError: (error?: string) => void
) {
    onError(undefined)

    sendToOrchestrator(
        { command: 'revealProtocol', fileName },
        {
            onReply: ({ error }) => onError(error),
            onUnreachable: () => onError(orchestratorUnreachableMessage),
        }
    )
}

export function hasUnsavedChanges(file: ProtocolFile) {
    const { protocol, savedProtocol } = file

    return (
        savedProtocol === undefined ||
        fileTextOf(protocol) !== fileTextOf(savedProtocol)
    )
}

export function protocolFrom(contents: ProtocolContents): Protocol {
    return {
        name: textOr(contents.name),
        devices: devicesFrom(contents),
        recordXdf: contents.recordXdf === true,
        recordDirectory: textOr(contents.recordDirectory),
        recordFileStub: textOr(contents.recordFileStub),
        voice: textOr(contents.voice) || defaultCueVoice,
        phases: Array.isArray(contents.phases)
            ? phasesFrom(contents.phases)
            : phasesFromEventMarkersIn(contents),
    }
}

export interface ProtocolContents {
    name?: unknown
    devices?: unknown
    recordXdf?: unknown
    recordDirectory?: unknown
    recordFileStub?: unknown
    voice?: unknown
    eventMarkers?: unknown
    phases?: unknown
}

function phasesFromEventMarkersIn(contents: ProtocolContents) {
    return phasesFrom(
        objectsIn(contents.eventMarkers).map(({ name, waitAfterMs }) => ({
            name,
            durationMs: waitAfterMs,
        }))
    )
}

function devicesFrom(contents: ProtocolContents): SelectedDevice[] {
    if (!Array.isArray(contents.devices)) {
        return []
    }

    return contents.devices
        .filter((device) => typeof device?.deviceName === 'string')
        .map(
            ({
                deviceName,
                identifier,
                nickname,
                disableStreams,
                exgType,
            }) => ({
                name: selectedNameOf(deviceName),
                identifier: textOr(identifier),
                nickname: textOr(nickname),
                disabledStreams: textsIn(disableStreams),
                exgType: typeof exgType === 'string' ? exgType : undefined,
            })
        )
}

function textOr(value: unknown) {
    return typeof value === 'string' ? value : ''
}

function textsIn(value: unknown) {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
}

export function isSameProtocolName(name: string, other: string) {
    return name.trim().toLowerCase() === other.trim().toLowerCase()
}

export function displayNameOf(protocol: Protocol) {
    return protocol.name.trim() || untitledName
}

// Test doubles

export let downloadFile: FileDownloader = downloadThroughBrowser

export function setDownloadFile(nextDownloadFile: FileDownloader) {
    downloadFile = nextDownloadFile
}

type FileDownloader = (fileName: string, text: string) => void
