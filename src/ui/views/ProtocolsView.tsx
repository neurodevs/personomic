import React, { useId, useRef, useState } from 'react'

import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../../functions/sendToOrchestrator'
import AddBiosensorButton from '../components/AddBiosensorButton'
import BiosensorsSection from '../components/BiosensorsSection'
import DevicePanel from '../components/DevicePanel'
import ProtocolForm from '../components/ProtocolForm'
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
}

const ProtocolsView: React.FC<ProtocolsViewProps> = (
    props: ProtocolsViewProps
) => {
    const { files, listingError, onFilesChange } = props

    const [selectedIndex, setSelectedIndex] = useState<number>()
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

    const select = (index: number) => {
        setSelectedIndex(index)
        setSavedTo(undefined)
        setActionError(undefined)
    }

    const addProtocol = () => {
        onFilesChange((previous) => [
            ...previous,
            { protocol: { name: '', devices: [] } },
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

    return (
        <div className="protocols">
            <nav className="protocols__list" aria-label="Protocols">
                {files.length > 0 && (
                    <ul className="protocols__items">
                        {files.map((file, index) => {
                            const { fileName, protocol } = file

                            return (
                                <li key={index} className="protocols__row">
                                    <button
                                        type="button"
                                        className="protocols__item"
                                        aria-current={index === selectedIndex}
                                        onClick={() => select(index)}
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
                                            <p>
                                                Remove {displayNameOf(protocol)}
                                                ?
                                            </p>
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
                )}
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
                {files.length === 0 && (
                    <p className="protocols__empty">No protocols yet.</p>
                )}
                {selected && (
                    <section className="protocols__editor card">
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
                            <ProtocolEventMarkers
                                markers={selected.protocol.eventMarkers ?? []}
                                onMarkersChange={(eventMarkers) =>
                                    changeSelectedProtocol({ eventMarkers })
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
    eventMarkers?: EventMarker[]
}

export interface EventMarker {
    name: string
    waitAfterMs: number
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
        setIdentifierValue,
        setNickname,
        nicknames,
        setDisabledStreams,
        disabledStreams,
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

const ProtocolEventMarkers: React.FC<ProtocolEventMarkersProps> = ({
    markers,
    onMarkersChange,
}) => {
    const headingId = useId()

    const hasMarkerNamed = (name: string) =>
        markers.some((marker) => marker.name === name)

    const removeMarkerAt = (index: number) =>
        onMarkersChange(markers.filter((_, other) => other !== index))

    const changeMarkerAt = (index: number, change: Partial<EventMarker>) =>
        onMarkersChange(
            markers.map((marker, other) =>
                other === index ? { ...marker, ...change } : marker
            )
        )

    const addMarker = () => {
        const postBaselineIndex = markers.findIndex(
            ({ name }) => name === postBaseline.name
        )
        const index =
            postBaselineIndex === -1 ? markers.length : postBaselineIndex

        onMarkersChange([
            ...markers.slice(0, index),
            { name: '', waitAfterMs: 0 },
            ...markers.slice(index),
        ])
    }

    return (
        <section className="event-markers" aria-labelledby={headingId}>
            <h3 id={headingId} className="event-markers__heading">
                Event markers
            </h3>
            {markers.length === 0 ? (
                <p className="event-markers__empty">No event markers yet.</p>
            ) : (
                <ul className="event-markers__list" aria-label="Event markers">
                    {markers.map((marker, index) => {
                        const number = index + 1

                        return (
                            <li key={index} className="event-markers__row">
                                <span className="event-markers__time">
                                    {clockTimeOf(startMsOf(markers, index))}
                                </span>
                                <input
                                    type="text"
                                    className="event-markers__name"
                                    aria-label={`Event marker ${number} name`}
                                    placeholder="marker-name"
                                    value={marker.name}
                                    onChange={(event) =>
                                        changeMarkerAt(index, {
                                            name: kebabCaseOf(
                                                event.target.value
                                            ),
                                        })
                                    }
                                />
                                <label className="event-markers__wait">
                                    then wait
                                    <input
                                        type="number"
                                        min={0}
                                        aria-label={`Event marker ${number} wait after (seconds)`}
                                        placeholder="0"
                                        value={
                                            marker.waitAfterMs === 0
                                                ? ''
                                                : marker.waitAfterMs / 1000
                                        }
                                        onChange={(event) =>
                                            changeMarkerAt(index, {
                                                waitAfterMs: msFromSeconds(
                                                    event.target.value
                                                ),
                                            })
                                        }
                                    />
                                    s
                                </label>
                                <button
                                    type="button"
                                    className="protocols__remove"
                                    aria-label={`Remove ${marker.name.trim() || `event marker ${number}`}`}
                                    title="Remove"
                                    onClick={() => removeMarkerAt(index)}
                                >
                                    ×
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
            <div className="event-markers__add">
                <button
                    type="button"
                    className="add-biosensor__button"
                    onClick={addMarker}
                >
                    + Add event marker
                </button>
                <button
                    type="button"
                    className="add-biosensor__button"
                    disabled={hasMarkerNamed(preBaseline.name)}
                    onClick={() => onMarkersChange([preBaseline, ...markers])}
                >
                    + Add 5 min pre-baseline
                </button>
                <button
                    type="button"
                    className="add-biosensor__button"
                    disabled={hasMarkerNamed(postBaseline.name)}
                    onClick={() => onMarkersChange([...markers, postBaseline])}
                >
                    + Add 5 min post-baseline
                </button>
            </div>
        </section>
    )
}

interface ProtocolEventMarkersProps {
    markers: EventMarker[]
    onMarkersChange: (markers: EventMarker[]) => void
}

const baselineMs = 5 * 60 * 1000
const preBaseline: EventMarker = {
    name: 'pre-baseline',
    waitAfterMs: baselineMs,
}
const postBaseline: EventMarker = {
    name: 'post-baseline',
    waitAfterMs: baselineMs,
}

function msFromSeconds(typed: string) {
    return Math.max(0, Number(typed) || 0) * 1000
}

function kebabCaseOf(typed: string) {
    return typed.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-')
}

function startMsOf(markers: EventMarker[], index: number) {
    return markers
        .slice(0, index)
        .reduce((total, { waitAfterMs }) => total + waitAfterMs, 0)
}

function clockTimeOf(ms: number) {
    const seconds = Math.round(ms / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

interface UploadProtocolButtonProps {
    onChoose: (file: UploadedFile) => void
}

const UploadProtocolButton: React.FC<UploadProtocolButtonProps> = ({
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
                className="protocols__new"
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
        ...eventMarkersOf(protocol),
    }
}

function eventMarkersOf({ eventMarkers = [] }: Protocol) {
    if (eventMarkers.length === 0) {
        return {}
    }

    return {
        eventMarkers: eventMarkers.map(({ name, waitAfterMs }) => ({
            name: name.trim().replace(/^-+|-+$/g, ''),
            waitAfterMs,
        })),
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
    const { name, identifier, nickname, disabledStreams } = device

    return requestedFrom({
        deviceName: name,
        identifier: identifier.trim() || undefined,
        nickname: nickname.trim() || undefined,
        disableStreams: disableStreamsOf(disabledStreams),
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
        eventMarkers: eventMarkersFrom(contents),
    }
}

export interface ProtocolContents {
    name?: unknown
    devices?: unknown
    recordXdf?: unknown
    recordDirectory?: unknown
    recordFileStub?: unknown
    eventMarkers?: unknown
}

function eventMarkersFrom(contents: ProtocolContents): EventMarker[] {
    if (!Array.isArray(contents.eventMarkers)) {
        return []
    }

    return contents.eventMarkers
        .filter((marker) => typeof marker?.name === 'string')
        .map(({ name, waitAfterMs }) => ({
            name,
            waitAfterMs: typeof waitAfterMs === 'number' ? waitAfterMs : 0,
        }))
}

function devicesFrom(contents: ProtocolContents): SelectedDevice[] {
    if (!Array.isArray(contents.devices)) {
        return []
    }

    return contents.devices
        .filter((device) => typeof device?.deviceName === 'string')
        .map(({ deviceName, identifier, nickname, disableStreams }) => ({
            name: selectedNameOf(deviceName),
            identifier: textOr(identifier),
            nickname: textOr(nickname),
            disabledStreams: textsIn(disableStreams),
        }))
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
