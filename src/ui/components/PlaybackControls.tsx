import React from 'react'

import type { PlaybackProgress } from './StreamMonitor'

export interface PlaybackControlsProps {
    fileName: string
    hasEnded: boolean
    progress?: PlaybackProgress
    speed: number
    onReplay: () => void
    onSpeedChange: (speed: number) => void
}

const PlaybackControls: React.FC<PlaybackControlsProps> = (
    props: PlaybackControlsProps
) => {
    const { fileName, hasEnded, progress, speed, onReplay, onSpeedChange } =
        props

    return (
        <>
            <span className="connect-devices__playing">
                {hasEnded ? 'Finished' : 'Playing'} {fileName}
            </span>
            {progress && (
                <span className="connect-devices__position">
                    {timecodeOf(progress.elapsedSeconds)} /{' '}
                    {timecodeOf(progress.totalSeconds)}
                </span>
            )}
            <button
                type="button"
                className="connect-devices__play"
                onClick={onReplay}
            >
                Replay
            </button>
            <span
                className="connect-devices__speeds"
                role="group"
                aria-label="Playback speed"
            >
                {playbackSpeeds.map((offered) => (
                    <button
                        key={offered}
                        type="button"
                        className="connect-devices__speed"
                        aria-pressed={offered === speed}
                        onClick={() => onSpeedChange(offered)}
                    >
                        {offered}×
                    </button>
                ))}
            </span>
        </>
    )
}

export default PlaybackControls

const playbackSpeeds = [1, 2, 5, 10, 20, 50, 100]

function timecodeOf(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const paddedSeconds = String(seconds % 60).padStart(2, '0')

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
        : `${minutes}:${paddedSeconds}`
}
