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
    yRange?: YRangeBounds
}

export interface YRangeBounds {
    min?: number
    max?: number
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
        yRange,
    } = props

    const yMinBound = yRange?.min
    const yMaxBound = yRange?.max

    const channelsRef = useRef<HTMLDivElement>(null)
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

    const occurrencesRef = useRef<ValueOccurrences[]>([])
    const lastCountedTimestampRef = useRef(-Infinity)

    useEffect(() => {
        const latestTimestamp = timestamps[timestamps.length - 1]

        if (
            occurrencesRef.current.length !== channelCount ||
            latestTimestamp < lastCountedTimestampRef.current
        ) {
            occurrencesRef.current = valuesByChannel.map(noOccurrences)
            lastCountedTimestampRef.current = -Infinity
        }

        const firstUncounted = firstIndexAfter(
            timestamps,
            lastCountedTimestampRef.current
        )

        valuesByChannel.forEach((values, channel) => {
            for (let i = firstUncounted; i < values.length; i++) {
                countOccurrence(occurrencesRef.current[channel], values[i])
            }
        })

        if (latestTimestamp !== undefined) {
            lastCountedTimestampRef.current = latestTimestamp
        }
    }, [timestamps, valuesByChannel])

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

        observer.observe(channelsRef.current!)

        return () => observer.disconnect()
    }, [width])

    useEffect(() => {
        const plots = Array.from(
            { length: plottedChannelCount },
            (_, channel) =>
                new uPlot(
                    optionsFor({
                        width: plotWidth,
                        height,
                        color,
                        hasPeakMarkers,
                        yBounds: { min: yMinBound, max: yMaxBound },
                        occurrencesOf: () => occurrencesRef.current[channel],
                    }),
                    hasPeakMarkers ? [[], [], []] : [[], []],
                    containerRefs.current[channel]!
                )
        )

        plotsRef.current = plots

        return () => plots.forEach((plot) => plot.destroy())
    }, [plottedChannelCount, color, hasPeakMarkers, yMinBound, yMaxBound])

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

    const plotStyle: PlotStyle = {
        '--stream-color': color,
        '--y-axis-width': `${yAxisWidth}px`,
        '--y-padding': `${yPadding}px`,
    }

    return (
        <section
            className="stream-plot"
            style={plotStyle}
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
            <div ref={channelsRef} className="stream-plot__channels">
                {Array.from({ length: plottedChannelCount }, (_, channel) => (
                    <div
                        key={channel}
                        ref={(container) => {
                            containerRefs.current[channel] = container
                        }}
                        className="stream-plot__channel"
                    />
                ))}
            </div>
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

type PlotStyle = React.CSSProperties & {
    '--stream-color': string
    '--y-axis-width': string
    '--y-padding': string
}

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

interface PlotAppearance {
    width: number
    height: number
    color: string
    hasPeakMarkers: boolean
    yBounds: YRangeBounds
    occurrencesOf: () => ValueOccurrences | undefined
}

function optionsFor(appearance: PlotAppearance): uPlot.Options {
    const { width, height, color, hasPeakMarkers, yBounds, occurrencesOf } =
        appearance

    return {
        width,
        height,
        padding: [yPadding, 0, yPadding, 0],
        legend: { show: false },
        cursor: { show: false },
        scales: {
            x: { time: false },
            y: {
                range: (plot, min, max) =>
                    widenedYRangeFor(plot, [
                        min,
                        max,
                        yBounds.min,
                        yBounds.max,
                    ]),
            },
        },
        axes: [{ show: false }, yAxis],
        hooks: {
            draw: [(plot) => drawOccurrenceStrip(plot, occurrencesOf(), color)],
        },
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

const leftSide = 3
const yAxisWidth = 54
const occurrenceStripWidth = 4
const occurrenceStripGap = 2
const faintestOccurrenceOpacity = 0.15
const maxOccurrenceBins = 256
const yPadding = 6
const numYBarsByPreference = [4, 3]
const maxYTickLabelLength = 7

const yAxis: uPlot.Axis = {
    side: leftSide,
    size: yAxisWidth,
    gap: occurrenceStripGap + occurrenceStripWidth + 4,
    stroke: '#5f6878',
    font: '10px ui-monospace, "SF Mono", Menlo, monospace',
    ticks: { show: false },
    grid: { width: 1, stroke: 'rgba(255, 255, 255, 0.06)' },
    splits: (_, __, min, max) => tightestYBarsCovering(min, max),
    values: (_, ticks) => ticks.map(yTickLabelFor),
}

interface ValueOccurrences {
    binWidth: number
    lowestBin: number
    highestBin: number
    countsByBin: Map<number, number>
}

function noOccurrences(): ValueOccurrences {
    return {
        binWidth: 0,
        lowestBin: Infinity,
        highestBin: -Infinity,
        countsByBin: new Map(),
    }
}

function countOccurrence(occurrences: ValueOccurrences, value: number) {
    if (!Number.isFinite(value)) {
        return
    }

    if (occurrences.binWidth === 0) {
        occurrences.binWidth = finestBinWidthFor(value)
    }

    const bin = Math.floor(value / occurrences.binWidth)
    const { countsByBin } = occurrences

    countsByBin.set(bin, (countsByBin.get(bin) ?? 0) + 1)
    occurrences.lowestBin = Math.min(occurrences.lowestBin, bin)
    occurrences.highestBin = Math.max(occurrences.highestBin, bin)

    while (
        occurrences.highestBin - occurrences.lowestBin >=
        maxOccurrenceBins
    ) {
        mergeNeighboringBins(occurrences)
    }
}

function finestBinWidthFor(value: number) {
    return 2 ** (Math.floor(Math.log2(Math.abs(value) || 1)) - 20)
}

function mergeNeighboringBins(occurrences: ValueOccurrences) {
    const merged = new Map<number, number>()

    for (const [bin, count] of occurrences.countsByBin) {
        const mergedBin = Math.floor(bin / 2)
        merged.set(mergedBin, (merged.get(mergedBin) ?? 0) + count)
    }

    occurrences.binWidth *= 2
    occurrences.lowestBin = Math.floor(occurrences.lowestBin / 2)
    occurrences.highestBin = Math.floor(occurrences.highestBin / 2)
    occurrences.countsByBin = merged
}

function drawOccurrenceStrip(
    plot: uPlot,
    occurrences: ValueOccurrences | undefined,
    color: string
) {
    const { ctx, bbox } = plot
    const countsByRow = occurrenceCountsByPixelRow(plot, occurrences)
    const highestCount = Math.max(...countsByRow)

    const width = occurrenceStripWidth * uPlot.pxRatio
    const left = bbox.left - occurrenceStripGap * uPlot.pxRatio - width

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.fillRect(left, bbox.top, width, countsByRow.length)

    ctx.fillStyle = color

    countsByRow.forEach((count, row) => {
        if (count > 0) {
            ctx.globalAlpha =
                faintestOccurrenceOpacity +
                (1 - faintestOccurrenceOpacity) * (count / highestCount)
            ctx.fillRect(left, bbox.top + row, width, 1)
        }
    })

    ctx.globalAlpha = 1
}

function occurrenceCountsByPixelRow(
    plot: uPlot,
    occurrences: ValueOccurrences | undefined
) {
    const { top, height } = plot.bbox
    const countsByRow: number[] = new Array(Math.round(height)).fill(0)

    if (!occurrences) {
        return countsByRow
    }

    const { binWidth, countsByBin } = occurrences
    const rowOf = (value: number) => plot.valToPos(value, 'y', true) - top

    for (const [bin, count] of countsByBin) {
        const firstRow = Math.floor(rowOf((bin + 1) * binWidth))
        const lastRow = Math.max(firstRow, Math.ceil(rowOf(bin * binWidth)) - 1)
        const countPerRow = count / (lastRow - firstRow + 1)

        for (let row = firstRow; row <= lastRow; row++) {
            if (row >= 0 && row < countsByRow.length) {
                countsByRow[row] += countPerRow
            }
        }
    }

    return countsByRow
}

const widestYRangeByPlot = new WeakMap<uPlot, YRange>()

function widenedYRangeFor(
    plot: uPlot,
    valuesToCover: (number | null | undefined)[]
) {
    const widest = widestYRangeByPlot.get(plot) ?? []
    const covered = [...valuesToCover, ...widest].filter(
        (value) => value != null
    )

    const bars = tightestYBarsCovering(
        covered.length > 0 ? Math.min(...covered) : 0,
        covered.length > 0 ? Math.max(...covered) : 0
    )

    const widened: YRange = [bars[0], bars[bars.length - 1]]
    widestYRangeByPlot.set(plot, widened)

    return widened
}

type YRange = [number, number]

function tightestYBarsCovering(min: number, max: number) {
    const spanOf = (bars: number[]) => bars[bars.length - 1] - bars[0]

    return numYBarsByPreference
        .map((numBars) => yBarsCovering(min, max, numBars))
        .reduce((tightest, bars) =>
            spanOf(bars) < spanOf(tightest) * (1 - floatTolerance)
                ? bars
                : tightest
        )
}

function yBarsCovering(min: number, max: number, numBars: number) {
    const span = max > min ? max - min : Math.abs(min) || 1
    const reachesMax = (bars: number[]) =>
        bars[numBars - 1] >= max - span * floatTolerance

    let exponent = Math.floor(Math.log10(span / (numBars - 1)))

    for (;;) {
        for (const mantissa of [1, 2, 5]) {
            const bars = yBarsFrom(min, mantissa, exponent, numBars)

            if (reachesMax(bars)) {
                return bars
            }
        }

        exponent++
    }
}

function yBarsFrom(
    min: number,
    mantissa: number,
    exponent: number,
    numBars: number
) {
    const unit = 10 ** Math.abs(exponent)
    const inUnits = (value: number) =>
        exponent >= 0 ? value / unit : value * unit
    const fromUnits = (units: number) =>
        exponent >= 0 ? units * unit : units / unit

    const lowest =
        Math.floor(inUnits(min) / mantissa + floatTolerance) * mantissa

    return Array.from(
        { length: numBars },
        (_, bar) => fromUnits(lowest + bar * mantissa) + 0
    )
}

const floatTolerance = 1e-9

function yTickLabelFor(value: number) {
    const plain = String(value)

    return plain.length <= maxYTickLabelLength
        ? plain
        : shortestFittingExponentFor(value)
}

function shortestFittingExponentFor(value: number) {
    const mostPreciseFirst = [2, 1, 0].map((digits) =>
        value.toExponential(digits)
    )

    return (
        mostPreciseFirst.find((label) => label.length <= maxYTickLabelLength) ??
        mostPreciseFirst[2]
    )
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

function firstIndexAfter(timestamps: number[], timestamp: number) {
    let index = timestamps.length

    while (index > 0 && timestamps[index - 1] > timestamp) {
        index--
    }

    return index
}

function firstIndexAtOrAfter(timestamps: number[], cutoff: number) {
    const index = timestamps.findIndex((timestamp) => timestamp >= cutoff)
    return index === -1 ? timestamps.length : index
}
