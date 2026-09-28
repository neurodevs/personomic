import React from 'react'
import { Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

export interface StreamPlotProps {
    name: string
    samples?: number[]
    timestamps?: number[]
    width?: number
    height?: number
    windowSeconds?: number
}

const StreamPlot: React.FC<StreamPlotProps> = (props: StreamPlotProps) => {
    const {
        name,
        samples = [],
        timestamps = [],
        width = 300,
        height = 100,
        windowSeconds = 10,
    } = props

    const channelCount =
        timestamps.length > 0 ? samples.length / timestamps.length : 0

    const latestTimestamp = timestamps[timestamps.length - 1]

    const min = Math.min(...samples)
    const valueSpan = Math.max(...samples) - min

    const toX = (timestamp: number) =>
        width - ((latestTimestamp - timestamp) / windowSeconds) * width

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
        <View testID={`stream-plot-${name}`}>
            <Text>{name}</Text>
            <Svg width={width} height={height}>
                {Array.from({ length: channelCount }, (_, channel) => (
                    <Path
                        key={channel}
                        testID={`stream-plot-${name}-channel-${channel}`}
                        d={pathForChannel(channel)}
                        fill="none"
                        stroke="black"
                    />
                ))}
            </Svg>
        </View>
    )
}

export default StreamPlot
