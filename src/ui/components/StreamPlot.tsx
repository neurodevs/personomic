import PpgPeakDetector, {
    PpgDetector,
} from '@neurodevs/node-biosignal-processing/build/impl/PpgPeakDetector.js'
import React, { useEffect, useMemo, useRef, useState } from 'react'
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
    detectPeaks?: PeakDetectionOptions
    channelNames?: string[]
    downsampling?: Downsampling
}

export type Downsampling = 'light' | 'medium' | 'heavy'

export interface PeakDetectionOptions {
    sampleRate: number
    channels?: string[]
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
        detectPeaks,
        channelNames,
        downsampling,
    } = props

    const rootRef = useRef<HTMLDivElement>(null)
    const containerRefs = useRef<(HTMLDivElement | null)[]>([])
    const plotsRef = useRef<uPlot[]>([])

    const [containerWidth, setContainerWidth] = useState(0)
    const plotWidth = width ?? containerWidth

    const [isHidden, setIsHidden] = useState(false)

    const channelCount =
        timestamps.length > 0 ? samples.length / timestamps.length : 0

    const plottedChannelCount = isHidden ? 0 : channelCount

    const labelFor = (channel: number) =>
        channelNames?.length === channelCount
            ? channelNames[channel]
            : `CH ${channel + 1}`

    const peakSampleRate = detectPeaks?.sampleRate
    const peakChannels = detectPeaks?.channels

    const peakDetector = useMemo(
        () =>
            peakSampleRate !== undefined
                ? PpgPeakDetector.Create({ sampleRate: peakSampleRate })
                : undefined,
        [peakSampleRate]
    )

    const valuesByChannel = useMemo(
        () =>
            Array.from({ length: channelCount }, (_, channel) =>
                valuesForChannel(samples, timestamps, channelCount, channel)
            ),
        [samples, timestamps, channelCount]
    )

    const peakDetectionTick = Math.floor(
        timestamps[timestamps.length - 1] / peakDetectionIntervalSeconds
    )

    const peakTimestampsByChannel = useMemo(
        () =>
            peakDetector &&
            valuesByChannel.map((values, channel) =>
                (peakChannels?.includes(labelFor(channel)) ?? true)
                    ? peakTimestampsFor(peakDetector, values, timestamps)
                    : new Set<number>()
            ),
        [
            peakDetector,
            peakDetectionTick,
            channelCount,
            peakChannels,
            channelNames,
        ]
    )

    const peakMarkersByChannel = useMemo(
        () =>
            peakTimestampsByChannel?.map((peakTimestamps, channel) =>
                timestamps.map((timestamp, i) =>
                    peakTimestamps.has(timestamp)
                        ? valuesByChannel[channel][i]
                        : null
                )
            ),
        [peakTimestampsByChannel, valuesByChannel]
    )

    const hasPeakMarkers = peakDetector !== undefined

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
            { length: plottedChannelCount },
            (_, channel) =>
                new uPlot(
                    optionsFor(plotWidth, height, color, hasPeakMarkers),
                    hasPeakMarkers ? [[], [], []] : [[], []],
                    containerRefs.current[channel]!
                )
        )

        plotsRef.current = plots

        return () => plots.forEach((plot) => plot.destroy())
    }, [plottedChannelCount, color, hasPeakMarkers])

    useEffect(() => {
        plotsRef.current.forEach((plot) =>
            plot.setSize({ width: plotWidth, height })
        )
    }, [plotWidth, height, plottedChannelCount])

    useEffect(() => {
        const rightEdgeTimestamp =
            nowTimestamp ?? timestamps[timestamps.length - 1]

        const firstVisible = firstIndexAtOrAfter(
            timestamps,
            rightEdgeTimestamp - windowSeconds
        )

        const pointsPerPixel = downsampling
            ? pointsPerPixelByDownsampling[downsampling]
            : 0

        const numBuckets = (plotWidth * pointsPerPixel) / 2
        const bucketSeconds = windowSeconds / numBuckets

        plotsRef.current.forEach((plot, channel) => {
            const values = valuesByChannel[channel]
            const peakMarkers = peakMarkersByChannel?.[channel]

            const keptIndices =
                numBuckets > 0
                    ? decimatedIndices(
                          { timestamps, values, peakMarkers },
                          firstVisible,
                          bucketSeconds
                      )
                    : undefined

            const visible = <T,>(series: T[]) =>
                keptIndices
                    ? keptIndices.map((i) => series[i])
                    : series.slice(firstVisible)

            plot.batch(() => {
                plot.setData([
                    visible(timestamps),
                    visible(values),
                    ...(peakMarkers ? [visible(peakMarkers)] : []),
                ])

                if (rightEdgeTimestamp !== undefined) {
                    plot.setScale('x', {
                        min: rightEdgeTimestamp - windowSeconds,
                        max: rightEdgeTimestamp,
                    })
                }
            })
        })
    }, [
        timestamps,
        valuesByChannel,
        peakMarkersByChannel,
        nowTimestamp,
        windowSeconds,
        plotWidth,
        downsampling,
        plottedChannelCount,
    ])

    const streamColorStyle: StreamColorStyle = { '--stream-color': color }

    return (
        <section
            ref={rootRef}
            className="stream-plot"
            style={streamColorStyle}
            data-testid={`stream-plot-${name}`}
            onClick={() => setIsHidden((wasHidden) => !wasHidden)}
        >
            <header className="stream-plot__header">
                <span className="stream-plot__indicator" />
                <span className="stream-plot__name">{name}</span>
                <span className="stream-plot__meta">
                    {metaFor(channelCount, windowSeconds, isHidden)}
                </span>
            </header>
            {Array.from({ length: plottedChannelCount }, (_, channel) => (
                <div key={channel} className="stream-plot__channel">
                    <span className="stream-plot__channel-label">
                        {labelFor(channel)}
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

function metaFor(
    channelCount: number,
    windowSeconds: number,
    isHidden: boolean
) {
    if (channelCount === 0) {
        return 'Awaiting signal'
    }

    return isHidden
        ? `${channelCount} ch · Hidden`
        : `${channelCount} ch · ${windowSeconds}s window`
}

type StreamColorStyle = React.CSSProperties & { '--stream-color': string }

const peakDetectionIntervalSeconds = 0.5

const pointsPerPixelByDownsampling: Record<Downsampling, number> = {
    light: 2,
    medium: 1,
    heavy: 0.5,
}

interface ChannelSeries {
    timestamps: number[]
    values: number[]
    peakMarkers?: (number | null)[]
}

function optionsFor(
    width: number,
    height: number,
    color: string,
    hasPeakMarkers: boolean
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
            ...(hasPeakMarkers ? [peakMarkerSeriesFor(color)] : []),
        ],
    }
}

function peakMarkerSeriesFor(color: string): uPlot.Series {
    return {
        stroke: `${color}66`,
        width: 1,
        dash: [3, 3],
        paths: verticalLinesAtPeaks,
        points: {
            show: true,
            size: 9,
            width: 2,
            fill: color,
            stroke: '#10141b',
        },
    }
}

function verticalLinesAtPeaks(
    plot: uPlot,
    seriesIdx: number,
    firstIdx: number,
    lastIdx: number
) {
    const lines = new Path2D()
    const { top, height } = plot.bbox
    const [timestamps] = plot.data
    const peakValues = plot.data[seriesIdx]

    for (let i = firstIdx; i <= lastIdx; i++) {
        if (peakValues[i] != null) {
            const x = plot.valToPos(timestamps[i], 'x', true)
            lines.moveTo(x, top)
            lines.lineTo(x, top + height)
        }
    }

    return { stroke: lines }
}

function peakTimestampsFor(
    detector: PpgDetector,
    values: number[],
    timestamps: number[]
) {
    if (values.length < 2) {
        return new Set<number>()
    }

    const { peaks } = detector.run(values, timestamps)
    return new Set(peaks.map((peak) => peak.timestamp))
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

function decimatedIndices(
    series: ChannelSeries,
    firstVisible: number,
    bucketSeconds: number
) {
    const { timestamps, values, peakMarkers } = series
    const kept: number[] = []

    let bucket: number | undefined
    let minIdx = 0
    let maxIdx = 0
    let peakIdxs: number[] = []

    const keepBucket = () => {
        if (peakIdxs.length === 0) {
            kept.push(Math.min(minIdx, maxIdx))

            if (minIdx !== maxIdx) {
                kept.push(Math.max(minIdx, maxIdx))
            }
        } else {
            const idxs = new Set([minIdx, maxIdx, ...peakIdxs])
            kept.push(...[...idxs].sort((a, b) => a - b))
        }
    }

    for (let i = firstVisible; i < timestamps.length; i++) {
        const bucketOfSample = Math.floor(timestamps[i] / bucketSeconds)

        if (bucketOfSample !== bucket) {
            if (bucket !== undefined) {
                keepBucket()
            }

            bucket = bucketOfSample
            minIdx = i
            maxIdx = i
            peakIdxs = []
        } else if (values[i] < values[minIdx]) {
            minIdx = i
        } else if (values[i] > values[maxIdx]) {
            maxIdx = i
        }

        if (peakMarkers?.[i] != null) {
            peakIdxs.push(i)
        }
    }

    if (bucket !== undefined) {
        keepBucket()
    }

    return kept
}

function firstIndexAtOrAfter(timestamps: number[], cutoff: number) {
    const index = timestamps.findIndex((timestamp) => timestamp >= cutoff)
    return index === -1 ? timestamps.length : index
}
