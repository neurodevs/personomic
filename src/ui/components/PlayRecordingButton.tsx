import React, { useImperativeHandle, useRef } from 'react'

export interface PlayRecordingButtonProps {
    onChoose: (file: File) => void
    ref?: React.Ref<RecordingPicker>
}

export interface RecordingPicker {
    open: () => void
}

const PlayRecordingButton: React.FC<PlayRecordingButtonProps> = (
    props: PlayRecordingButtonProps
) => {
    const { onChoose, ref } = props

    const recordingToPlayInput = useRef<HTMLInputElement>(null)

    const open = () => recordingToPlayInput.current?.click()

    useImperativeHandle(ref, () => ({ open }))

    const chooseRecording = (event: React.ChangeEvent<HTMLInputElement>) => {
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
                className="connect-devices__button"
                onClick={open}
            >
                {playRecordingLabel}
            </button>
            <input
                ref={recordingToPlayInput}
                type="file"
                accept=".xdf"
                hidden
                aria-label={recordingToPlayLabel}
                onChange={chooseRecording}
            />
        </>
    )
}

export default PlayRecordingButton

const playRecordingLabel = 'Play XDF'
const recordingToPlayLabel = 'Recording to play'
