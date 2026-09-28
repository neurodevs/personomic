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
        height = 100,
        windowSeconds = 10,
        nowTimestamp,
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const plotRef = useRef<uPlot | null>(null)

    const channelCount =
        timestamps.length > 0 ? samples.length / timestamps.length : 0

    useEffect(() => {
        const plot = new uPlot(
            optionsFor(channelCount, width, height),
            toAlignedData([], [], channelCount),
            containerRef.current!
        )

        plotRef.current = plot

        return () => plot.destroy()
    }, [channelCount, width, height])

    useEffect(() => {
        const plot = plotRef.current!
        const rightEdgeTimestamp =
            nowTimestamp ?? timestamps[timestamps.length - 1]

        plot.batch(() => {
            plot.setData(toAlignedData(samples, timestamps, channelCount))

            if (rightEdgeTimestamp !== undefined) {
                plot.setScale('x', {
                    min: rightEdgeTimestamp - windowSeconds,
                    max: rightEdgeTimestamp,
                })
            }
        })
    }, [samples, timestamps, nowTimestamp, windowSeconds, channelCount])

    return (
        <div data-testid={`stream-plot-${name}`}>
            <span>{name}</span>
            <div ref={containerRef} />
        </div>
    )
}

export default StreamPlot

function optionsFor(
    channelCount: number,
    width: number,
    height: number
): uPlot.Options {
    return {
        width,
        height,
        legend: { show: false },
        cursor: { show: false },
        scales: { x: { time: false } },
        axes: [{ show: false }, { show: false }],
        series: [
            {},
            ...Array.from({ length: channelCount }, () => ({
                stroke: 'black',
                width: 1,
            })),
        ],
    }
}

function toAlignedData(
    samples: number[],
    timestamps: number[],
    channelCount: number
): uPlot.AlignedData {
    return [
        timestamps,
        ...Array.from({ length: channelCount }, (_, channel) =>
            timestamps.map((_, i) => samples[i * channelCount + channel])
        ),
    ]
}
