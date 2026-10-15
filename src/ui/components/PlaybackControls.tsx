import React from 'react'

import type { PlaybackProgress } from './StreamMonitor'

export interface PlaybackControlsProps {
    fileName: string
    hasEnded: boolean
    progress?: PlaybackProgress
    speed: number
    onReplay: () => void
    onSeek: (seconds: number) => void
    onHold: () => void
    onRelease: () => void
    onSpeedChange: (speed: number) => void
}

const PlaybackControls: React.FC<PlaybackControlsProps> = (
    props: PlaybackControlsProps
) => {
    const {
        fileName,
        hasEnded,
        progress,
        speed,
        onReplay,
        onSeek,
        onHold,
        onRelease,
        onSpeedChange,
    } = props

    const hold = (event: React.PointerEvent<HTMLInputElement>) => {
        event.currentTarget.setPointerCapture?.(event.pointerId)
        onHold()
    }

    return (
        <>
            <span className="connect-devices__playing">
                {hasEnded ? 'Finished' : 'Playing'} {fileName}
            </span>
            {progress && (
                <>
                    <input
                        type="range"
                        className="connect-devices__seek"
                        aria-label="Playback position"
                        min={0}
                        max={progress.totalSeconds}
                        step={0.1}
                        value={progress.elapsedSeconds}
                        onChange={(event) => onSeek(Number(event.target.value))}
                        onPointerDown={hold}
                        onPointerUp={onRelease}
                        onPointerCancel={onRelease}
                    />
                    <span className="connect-devices__position">
                        {timecodeOf(progress.elapsedSeconds)} /{' '}
                        {timecodeOf(progress.totalSeconds)}
                    </span>
                </>
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

function timecodeOf(exactSeconds: number) {
    const seconds = Math.floor(exactSeconds)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const paddedSeconds = String(seconds % 60).padStart(2, '0')

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
        : `${minutes}:${paddedSeconds}`
}
