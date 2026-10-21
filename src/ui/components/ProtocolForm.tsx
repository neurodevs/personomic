import React from 'react'

import RecordXdfControls, { RecordXdfControlsProps } from './RecordXdfControls'

export interface ProtocolFormProps {
    isOpen: boolean
    name: string
    namePlaceholder: string
    onNameChange: (name: string) => void
    takenName?: string
    record: RecordXdfControlsProps
    saveLabel?: string
    isSaveDisabled: boolean
    onSave: () => void
    isCancelDisabled?: boolean
    onCancel: () => void
    savedTo?: string
    onRevealSaved?: () => void
    children: React.ReactNode
}

const ProtocolForm: React.FC<ProtocolFormProps> = (
    props: ProtocolFormProps
) => {
    const {
        isOpen,
        name,
        namePlaceholder,
        onNameChange,
        takenName,
        record,
        saveLabel = 'Save',
        isSaveDisabled,
        onSave,
        isCancelDisabled = false,
        onCancel,
        savedTo,
        onRevealSaved,
        children,
    } = props

    return (
        <>
            {isOpen && (
                <div className="protocols__name">
                    <label className="protocols__field">
                        Name
                        <input
                            type="text"
                            value={name}
                            placeholder={namePlaceholder}
                            autoFocus
                            onChange={(event) =>
                                onNameChange(event.target.value)
                            }
                        />
                    </label>
                    {takenName && (
                        <span className="protocols__name-taken">
                            {takenName} is already a protocol. Please choose a
                            new name.
                        </span>
                    )}
                </div>
            )}
            {isOpen && (
                <div className="protocols__record">
                    <RecordXdfControls {...record} />
                </div>
            )}
            {children}
            {isOpen && (
                <div className="protocols__actions">
                    <button
                        type="button"
                        className="protocols__save"
                        disabled={isSaveDisabled}
                        onClick={onSave}
                    >
                        {saveLabel}
                    </button>
                    <button
                        type="button"
                        className="protocols__save protocols__cancel"
                        disabled={isCancelDisabled}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    {savedTo && (
                        <span className="protocols__saved" role="status">
                            Saved to{' '}
                            <button
                                type="button"
                                className="saved-path"
                                title="Show in Finder"
                                onClick={onRevealSaved}
                            >
                                {savedTo}
                            </button>
                        </span>
                    )}
                </div>
            )}
        </>
    )
}

export default ProtocolForm
