import React, { useState } from 'react'

import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../../functions/sendToOrchestrator'
import AddBiosensorButton from '../components/AddBiosensorButton'
import DevicePanel from '../components/DevicePanel'
import { deviceLabelFor } from '../components/StreamMonitor'
import useBiosensorChoices, {
    DeviceRequest,
    disableStreamsOf,
    requestedFrom,
    SelectedDevice,
} from '../hooks/useBiosensorChoices'

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

    if (files === undefined) {
        return <p className="protocols__empty">Loading protocols…</p>
    }

    const selected =
        selectedIndex === undefined ? undefined : files[selectedIndex]

    const error = actionError ?? listingError

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
        if (files[index].fileName === undefined) {
            removeAt(index)
            return
        }

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
                                        title="Download"
                                        onClick={() =>
                                            downloadFile(
                                                fileName ??
                                                    fileNameFrom(protocol.name),
                                                fileTextOf(protocol)
                                            )
                                        }
                                    >
                                        ↓
                                    </button>
                                    {confirmingRemoveAt === index ? (
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
                                    ) : (
                                        <button
                                            type="button"
                                            className="protocols__remove"
                                            aria-label={`Remove ${displayNameOf(protocol)}`}
                                            title="Remove"
                                            onClick={() => askToRemove(index)}
                                        >
                                            ×
                                        </button>
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
                    <section className="protocols__editor">
                        <label className="protocols__field">
                            Name
                            <input
                                key={selectedIndex}
                                type="text"
                                value={selected.protocol.name}
                                placeholder={untitledName}
                                autoFocus
                                onChange={(event) =>
                                    changeSelectedProtocol({
                                        name: event.target.value,
                                    })
                                }
                            />
                        </label>
                        <ProtocolBiosensors
                            key={selectedIndex}
                            devices={selected.protocol.devices}
                            onDevicesChange={(devices) =>
                                changeSelectedProtocol({ devices })
                            }
                        />
                        <div className="protocols__actions">
                            <button
                                type="button"
                                className="protocols__save"
                                onClick={saveSelected}
                            >
                                Save
                            </button>
                            {savedTo && (
                                <span
                                    className="protocols__saved"
                                    role="status"
                                >
                                    Saved to{' '}
                                    <button
                                        type="button"
                                        className="saved-path"
                                        title="Show in Finder"
                                        onClick={() =>
                                            revealProtocol(
                                                selected.fileName!,
                                                setActionError
                                            )
                                        }
                                    >
                                        {savedTo}
                                    </button>
                                </span>
                            )}
                        </div>
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
        <section className="protocols__devices">
            <h3 id="protocol-devices-heading">Biosensors</h3>
            {devices.length === 0 ? (
                <p className="protocols__no-devices">No biosensors yet.</p>
            ) : (
                <ul
                    className="protocols__device-list"
                    aria-labelledby="protocol-devices-heading"
                >
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
        </section>
    )
}

interface ProtocolBiosensorsProps {
    devices: SelectedDevice[]
    onDevicesChange: (devices: SelectedDevice[]) => void
}

const schemaVersion = 1

const untitledName = 'Untitled protocol'
const untitledFileStem = 'untitled-protocol'

function selectedIndexAfterRemoving(removed: number, selected?: number) {
    if (selected === undefined || selected === removed) {
        return undefined
    }

    return selected > removed ? selected - 1 : selected
}

function fileNameFrom(name: string) {
    const stem = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return `${stem || untitledFileStem}.json`
}

export function fileContentsOf(protocol: Protocol) {
    const { name, devices } = protocol

    return { schemaVersion, name, devices: devices.map(requestOf) }
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

export function displayNameOf(protocol: Protocol) {
    return protocol.name.trim() || untitledName
}

// Test doubles

export let downloadFile: FileDownloader = downloadThroughBrowser

export function setDownloadFile(nextDownloadFile: FileDownloader) {
    downloadFile = nextDownloadFile
}

type FileDownloader = (fileName: string, text: string) => void
