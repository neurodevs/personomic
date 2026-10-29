import React from 'react'

import RecordPathFields, { RecordPathFieldsProps } from './RecordPathFields'

export interface RecordXdfControlsProps extends RecordPathFieldsProps {
    isOn: boolean
    onIsOnChange: (isOn: boolean) => void
    xdfRecordPath?: string
    onRevealRecording?: () => void
}

const RecordXdfControls: React.FC<RecordXdfControlsProps> = (
    props: RecordXdfControlsProps
) => {
    const {
        isOn,
        onIsOnChange,
        xdfRecordPath,
        onRevealRecording,
        ...pathFieldsProps
    } = props

    return (
        <>
            <label className="connect-devices__record-toggle">
                <input
                    type="checkbox"
                    checked={isOn}
                    disabled={pathFieldsProps.isLocked}
                    onChange={(event) => onIsOnChange(event.target.checked)}
                />
                Record XDF
            </label>
            {isOn && !xdfRecordPath && (
                <RecordPathFields {...pathFieldsProps} />
            )}
            {xdfRecordPath && (
                <span className="connect-devices__recording">
                    Recording to{' '}
                    <button
                        type="button"
                        className="connect-devices__recording-path"
                        title="Show in Finder"
                        onClick={onRevealRecording}
                    >
                        {xdfRecordPath}
                    </button>
                </span>
            )}
        </>
    )
}

export default RecordXdfControls
