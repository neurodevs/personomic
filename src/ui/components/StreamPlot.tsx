import React, { useEffect, useRef, useState } from 'react'
import uPlot from 'uplot'

export interface StreamPlotProps {
    name: string
    samples?: number[]
    timestamps?: number[]
    width?: number
    height?: number
    windowSeconds?: number
    nowTimestamp?: number
    color?: string
}

const StreamPlot: React.FC<StreamPlotProps> = (props: StreamPlotProps) => {
    const {
        name,
        samples = [],
        timestamps = [],
        width,
        height = 60,
        windowSeconds = 10,
        nowTimestamp,
        color = '#8b93a7',
    } = props

    const rootRef = useRef<HTMLDivElement>(null)
    const containerRefs = useRef<(HTMLDivElement | null)[]>([])
    const plotsRef = useRef<uPlot[]>([])

    const [containerWidth, setContainerWidth] = useState(0)
    const plotWidth = width ?? containerWidth

    const channelCount =
        timestamps.length > 0 ? samples.length / timestamps.length : 0

    useEffect(() => {
        if (width !== undefined) {
            return
        }

        const observer = new ResizeObserverComponent(([entry]) =>
            setContainerWidth(entry.contentRect.width)
        )

        observer.observe(rootRef.current!)

        return () => observer.disconnect()
    }, [width])

    useEffect(() => {
        const plots = Array.from(
            { length: channelCount },
            (_, channel) =>
                new uPlot(
                    optionsFor(plotWidth, height, color),
                    [[], []],
                    containerRefs.current[channel]!
                )
        )

        plotsRef.current = plots

        return () => plots.forEach((plot) => plot.destroy())
    }, [channelCount, color])

    useEffect(() => {
        plotsRef.current.forEach((plot) =>
            plot.setSize({ width: plotWidth, height })
        )
    }, [plotWidth, height, channelCount])

    useEffect(() => {
        const rightEdgeTimestamp =
            nowTimestamp ?? timestamps[timestamps.length - 1]

        const firstVisible = firstIndexAtOrAfter(
            timestamps,
            rightEdgeTimestamp - windowSeconds
        )

        plotsRef.current.forEach((plot, channel) =>
            plot.batch(() => {
                plot.setData([
                    timestamps.slice(firstVisible),
                    valuesForChannel(
                        samples,
                        timestamps,
                        channelCount,
                        channel
                    ).slice(firstVisible),
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

    const streamColorStyle: StreamColorStyle = { '--stream-color': color }

    return (
        <section
            ref={rootRef}
            className="stream-plot"
            style={streamColorStyle}
            data-testid={`stream-plot-${name}`}
        >
            <header className="stream-plot__header">
                <span className="stream-plot__indicator" />
                <span className="stream-plot__name">{name}</span>
                <span className="stream-plot__meta">
                    {channelCount > 0
                        ? `${channelCount} ch · ${windowSeconds}s window`
                        : 'Awaiting signal'}
                </span>
            </header>
            {Array.from({ length: channelCount }, (_, channel) => (
                <div key={channel} className="stream-plot__channel">
                    <span className="stream-plot__channel-label">
                        CH {channel + 1}
                    </span>
                    <div
                        ref={(container) => {
                            containerRefs.current[channel] = container
                        }}
                    />
                </div>
            ))}
        </section>
    )
}

export default StreamPlot

export let ResizeObserverComponent = globalThis.ResizeObserver

export function setResizeObserverComponent(component: typeof ResizeObserver) {
    ResizeObserverComponent = component
}

type StreamColorStyle = React.CSSProperties & { '--stream-color': string }

function optionsFor(
    width: number,
    height: number,
    color: string
): uPlot.Options {
    return {
        width,
        height,
        padding: [6, 0, 6, 0],
        legend: { show: false },
        cursor: { show: false },
        scales: { x: { time: false } },
        axes: [{ show: false }, { show: false }],
        series: [
            {},
            {
                stroke: color,
                width: 1.5,
                fill: (plot) => fadingGlowFor(plot, color),
                fillTo: (plot) => plot.scales.y.min ?? 0,
            },
        ],
    }
}

function fadingGlowFor(plot: uPlot, hexColor: string) {
    const { top, height } = plot.bbox
    const gradient = plot.ctx.createLinearGradient(0, top, 0, top + height)

    gradient.addColorStop(0, `${hexColor}33`)
    gradient.addColorStop(1, `${hexColor}00`)

    return gradient
}

function valuesForChannel(
    samples: number[],
    timestamps: number[],
    channelCount: number,
    channel: number
) {
    return timestamps.map((_, i) => samples[i * channelCount + channel])
}

function firstIndexAtOrAfter(timestamps: number[], cutoff: number) {
    const index = timestamps.findIndex((timestamp) => timestamp >= cutoff)
    return index === -1 ? timestamps.length : index
}
