import React, { useEffect, useRef } from 'react'
import uPlot from 'uplot'

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
        height = 60,
        windowSeconds = 10,
        nowTimestamp,
    } = props

    const containerRefs = useRef<(HTMLDivElement | null)[]>([])
    const plotsRef = useRef<uPlot[]>([])

    const channelCount =
        timestamps.length > 0 ? samples.length / timestamps.length : 0

    useEffect(() => {
        const plots = Array.from(
            { length: channelCount },
            (_, channel) =>
                new uPlot(
                    optionsFor(width, height),
                    [[], []],
                    containerRefs.current[channel]!
                )
        )

        plotsRef.current = plots

        return () => plots.forEach((plot) => plot.destroy())
    }, [channelCount, width, height])

    useEffect(() => {
        const rightEdgeTimestamp =
            nowTimestamp ?? timestamps[timestamps.length - 1]

        plotsRef.current.forEach((plot, channel) =>
            plot.batch(() => {
                plot.setData([
                    timestamps,
                    valuesForChannel(
                        samples,
                        timestamps,
                        channelCount,
                        channel
                    ),
                ])

                if (rightEdgeTimestamp !== undefined) {
                    plot.setScale('x', {
                        min: rightEdgeTimestamp - windowSeconds,
                        max: rightEdgeTimestamp,
                    })
                }
            })
        )
    }, [samples, timestamps, nowTimestamp, windowSeconds, channelCount])

    return (
        <div data-testid={`stream-plot-${name}`}>
            <span>{name}</span>
            {Array.from({ length: channelCount }, (_, channel) => (
                <div
                    key={channel}
                    ref={(container) => {
                        containerRefs.current[channel] = container
                    }}
                />
            ))}
        </div>
    )
}

export default StreamPlot

function optionsFor(width: number, height: number): uPlot.Options {
    return {
        width,
        height,
        legend: { show: false },
        cursor: { show: false },
        scales: { x: { time: false } },
        axes: [{ show: false }, { show: false }],
        series: [{}, { stroke: 'black', width: 1 }],
    }
}

function valuesForChannel(
    samples: number[],
    timestamps: number[],
    channelCount: number,
    channel: number
) {
    return timestamps.map((_, i) => samples[i * channelCount + channel])
}
