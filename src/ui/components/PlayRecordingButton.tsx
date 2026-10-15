import React, { useRef } from 'react'

export interface PlayRecordingButtonProps {
    onChoose: (file: File) => void
}

const PlayRecordingButton: React.FC<PlayRecordingButtonProps> = (
    props: PlayRecordingButtonProps
) => {
    const { onChoose } = props

    const recordingToPlayInput = useRef<HTMLInputElement>(null)

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
                className="connect-devices__play"
                onClick={() => recordingToPlayInput.current?.click()}
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

const playRecordingLabel = 'Play recording…'
const recordingToPlayLabel = 'Recording to play'
