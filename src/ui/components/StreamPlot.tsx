import React from 'react'

export interface StreamPlotProps {
    name: string
    samples?: number[]
    timestamps?: number[]
    width?: number
    height?: number
    windowSeconds?: number
    nowTimestamp?: number
}

const StreamPlot: React.FC<StreamPlotProps> = (props: StreamPlotProps) => {
    const {
        name,
        samples = [],
        timestamps = [],
        width = 300,
        height = 100,
        windowSeconds = 10,
        nowTimestamp,
    } = props

    const channelCount =
        timestamps.length > 0 ? samples.length / timestamps.length : 0

    const rightEdgeTimestamp = nowTimestamp ?? timestamps[timestamps.length - 1]

    const min = Math.min(...samples)
    const valueSpan = Math.max(...samples) - min

    const toX = (timestamp: number) =>
        width - ((rightEdgeTimestamp - timestamp) / windowSeconds) * width

    const toY = (value: number) =>
        valueSpan > 0
            ? height - ((value - min) / valueSpan) * height
            : height / 2

    const pathForChannel = (channel: number) =>
        timestamps
            .map(
                (timestamp, i) =>
                    `${toX(timestamp)},${toY(samples[i * channelCount + channel])}`
            )
            .map((point, i) => `${i === 0 ? 'M' : 'L'}${point}`)
            .join('')

    return (
        <div data-testid={`stream-plot-${name}`}>
            <span>{name}</span>
            <svg width={width} height={height} display="block">
                {Array.from({ length: channelCount }, (_, channel) => (
                    <path
                        key={channel}
                        data-testid={`stream-plot-${name}-channel-${channel}`}
                        d={pathForChannel(channel)}
                        fill="none"
                        stroke="black"
                    />
                ))}
            </svg>
        </div>
    )
}

export default StreamPlot
