import React, { useState } from 'react'

import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../../functions/sendToOrchestrator'

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
        onFilesChange((previous) => [...previous, { protocol: { name: '' } }])
        select(files.length)
    }

    const changeFileAt = (index: number, change: Partial<ProtocolFile>) =>
        onFilesChange((previous) =>
            previous.map((file, other) =>
                other === index ? { ...file, ...change } : file
            )
        )

    const renameSelected = (name: string) => {
        changeFileAt(selectedIndex!, {
            protocol: { ...selected!.protocol, name },
        })
        setSavedTo(undefined)
    }

    const saveSelected = () => {
        const index = selectedIndex!
        const { fileName, protocol } = selected!

        setSavedTo(undefined)
        setActionError(undefined)

        sendToOrchestrator<{ fileName?: string }>(
            {
                command: 'saveProtocol',
                fileName,
                protocol: { schemaVersion, ...protocol },
            },
            {
                onReply: ({ error, fileName }) => {
                    setActionError(error)

                    if (fileName) {
                        changeFileAt(index, { fileName })
                        setSavedTo(fileName)
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
                        {files.map(({ fileName, protocol }, index) => (
                            <li key={index} className="protocols__row">
                                <button
                                    type="button"
                                    className="protocols__item"
                                    aria-current={index === selectedIndex}
                                    onClick={() => select(index)}
                                >
                                    {displayNameOf(protocol)}
                                </button>
                                {confirmingRemoveAt === index ? (
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
                        ))}
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
                                    renameSelected(event.target.value)
                                }
                            />
                        </label>
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
                                    Saved to {savedTo}
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
}

export interface Protocol {
    name: string
}

const schemaVersion = 1

const untitledName = 'Untitled protocol'

function selectedIndexAfterRemoving(removed: number, selected?: number) {
    if (selected === undefined || selected === removed) {
        return undefined
    }

    return selected > removed ? selected - 1 : selected
}

function displayNameOf(protocol: Protocol) {
    return protocol.name.trim() || untitledName
}
