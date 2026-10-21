import React from 'react'

import RecordPathFields, { RecordPathFieldsProps } from './RecordPathFields'

export interface RecordXdfControlsProps extends RecordPathFieldsProps {
    isOn: boolean
    onIsOnChange: (isOn: boolean) => void
    recordingPath?: string
    onRevealRecording?: () => void
}

const RecordXdfControls: React.FC<RecordXdfControlsProps> = (
    props: RecordXdfControlsProps
) => {
    const {
        isOn,
        onIsOnChange,
        recordingPath,
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
            {isOn && !recordingPath && (
                <RecordPathFields {...pathFieldsProps} />
            )}
            {recordingPath && (
                <span className="connect-devices__recording">
                    Recording to{' '}
                    <button
                        type="button"
                        className="connect-devices__recording-path"
                        title="Show in Finder"
                        onClick={onRevealRecording}
                    >
                        {recordingPath}
                    </button>
                </span>
            )}
        </>
    )
}

export default RecordXdfControls
