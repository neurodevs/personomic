import PpgPeakDetector, {
    PpgDetector,
} from '@neurodevs/node-biosignal-processing/build/impl/PpgPeakDetector.js'
import { createFft } from '@neurodevs/node-signal-processing'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import uPlot from 'uplot'

import BandPowers, { frequencyBands } from './BandPowers'
import WindowPicker, {
    windowLabelFor,
    windowPickerClassName,
} from './WindowPicker'

export interface StreamPlotProps {
    name: string
    samples?: number[]
    timestamps?: number[]
    width?: number
    height?: number
    windowSeconds?: number
    onWindowSecondsChange?: (seconds: number) => void
    nowTimestamp?: number
    markedTimestamp?: number
    onMarkTimestamp?: (timestamp: number) => void
    onScrubTo?: (rightEdgeTimestamp: number) => void
    sessionStartTimestamp?: number
    color?: string
    detectPeaks?: PeakDetectionOptions
    knownPeakTimestamps?: number[][]
    bandPowers?: BandPowerOptions
    channelNames?: string[]
    downsampling?: Downsampling
    yLimits?: YLimits
    units?: string
}

export interface YLimits {
    min?: number
    max?: number
}

export type Downsampling = 'light' | 'medium' | 'heavy'

export interface PeakDetectionOptions {
    sampleRate: number
    channels?: string[]
    heartRateWindowSeconds?: number
    hrvWindowSeconds?: number
    hrvProvisionalAfterSeconds?: number
}

export interface BandPowerOptions {
    sampleRate: number
    windowSeconds: number
    channelsLeftOut?: string[]
}

const StreamPlot: React.FC<StreamPlotProps> = (props: StreamPlotProps) => {
    const {
        name,
        samples = [],
        timestamps = [],
        width,
        height = 60,
        windowSeconds = 10,
        onWindowSecondsChange,
        nowTimestamp,
        markedTimestamp,
        onMarkTimestamp,
        onScrubTo,
        sessionStartTimestamp = 0,
        color = '#8b93a7',
        detectPeaks,
        knownPeakTimestamps,
        bandPowers,
        channelNames,
        downsampling,
        yLimits,
        units,
    } = props

    const yMinLimit = yLimits?.min
    const yMaxLimit = yLimits?.max

    const channelsRef = useRef<HTMLDivElement>(null)
    const containerRefs = useRef<(HTMLDivElement | null)[]>([])
    const plotsRef = useRef<uPlot[]>([])

    const [containerWidth, setContainerWidth] = useState(0)
    const plotWidth = width ?? containerWidth

    const [isHidden, setIsHidden] = useState(false)

    const channelCount =
        timestamps.length > 0 ? samples.length / timestamps.length : 0

    const plottedChannelCount = isHidden ? 0 : channelCount

    const toggleHiddenUnlessClickedOnWindowPicker = (
        event: React.MouseEvent
    ) => {
        const clicked = event.target as Element

        if (!clicked.closest(`.${windowPickerClassName}`)) {
            setIsHidden((wasHidden) => !wasHidden)
        }
    }

    const markTimestampIfGraphClicked = (
        event: React.MouseEvent,
        channel: number
    ) => {
        if (hasScrubbedRef.current) {
            hasScrubbedRef.current = false
            event.stopPropagation()
            return
        }

        const plot = plotsRef.current[channel]

        if (onMarkTimestamp && isOnGraph(plot, event)) {
            const graphLeft = plot.over.getBoundingClientRect().left

            event.stopPropagation()
            onMarkTimestamp(plot.posToVal(event.clientX - graphLeft, 'x'))
        }
    }

    const onScrubToRef = useRef(onScrubTo)
    onScrubToRef.current = onScrubTo

    const hasScrubbedRef = useRef(false)
    const stopScrubbingRef = useRef<() => void>(undefined)

    useEffect(() => () => stopScrubbingRef.current?.(), [])

    const startScrubbingIfGraphPressed = (
        event: React.MouseEvent,
        channel: number
    ) => {
        const plot = plotsRef.current[channel]

        if (!onScrubTo || !isOnGraph(plot, event)) {
            return
        }

        event.preventDefault()

        const { min = 0, max = 0 } = plot.scales.x
        const secondsPerPixel =
            (max - min) / plot.over.getBoundingClientRect().width
        const pressedX = event.clientX

        hasScrubbedRef.current = false

        const scrub = (move: MouseEvent) => {
            const draggedPixels = move.clientX - pressedX

            if (
                hasScrubbedRef.current ||
                Math.abs(draggedPixels) >= minScrubPixels
            ) {
                hasScrubbedRef.current = true
                onScrubToRef.current?.(max - draggedPixels * secondsPerPixel)
            }
        }

        const stopScrubbing = () => {
            window.removeEventListener('mousemove', scrub)
            window.removeEventListener('mouseup', stopScrubbing)
            stopScrubbingRef.current = undefined
        }

        stopScrubbingRef.current?.()
        window.addEventListener('mousemove', scrub)
        window.addEventListener('mouseup', stopScrubbing)
        stopScrubbingRef.current = stopScrubbing
    }

    const markedTimestampRef = useRef(markedTimestamp)
    markedTimestampRef.current = markedTimestamp

    const sessionStartTimestampRef = useRef(sessionStartTimestamp)
    sessionStartTimestampRef.current = sessionStartTimestamp

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

    const isPeakChannel = (channel: number) =>
        peakChannels?.includes(labelFor(channel)) ?? true

    const shownChannels = Array.from(
        { length: plottedChannelCount },
        (_, channel) => channel
    ).sort(
        (a, b) => Number(isShownBelowPeaks(a)) - Number(isShownBelowPeaks(b))
    )

    function isShownBelowPeaks(channel: number) {
        return detectPeaks !== undefined && !isPeakChannel(channel)
    }

    const lastShownChannel = shownChannels[shownChannels.length - 1]

    const detectedPeakTimestampsByChannel = useMemo(
        () =>
            peakDetector &&
            !knownPeakTimestamps &&
            valuesByChannel.map((values, channel) =>
                isPeakChannel(channel)
                    ? peakTimestampsFor(peakDetector, values, timestamps)
                    : new Set<number>()
            ),
        [
            peakDetector,
            peakDetectionTick,
            channelCount,
            peakChannels,
            channelNames,
            knownPeakTimestamps,
        ]
    )

    const knownPeakTimestampsByChannel = useMemo(
        () =>
            peakDetector &&
            knownPeakTimestamps &&
            valuesByChannel.map((_, channel) =>
                isPeakChannel(channel)
                    ? peakTimestampsWithin(
                          knownPeakTimestamps[channel] ?? [],
                          timestamps
                      )
                    : new Set<number>()
            ),
        [
            peakDetector,
            knownPeakTimestamps,
            timestamps,
            channelCount,
            peakChannels,
            channelNames,
        ]
    )

    const peakTimestampsByChannel =
        knownPeakTimestampsByChannel ||
        detectedPeakTimestampsByChannel ||
        undefined

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

    const latestTimestamp = timestamps[timestamps.length - 1]
    const [firstTimestamp, setFirstTimestamp] = useState<number>()

    if (
        timestamps.length > 0 &&
        (firstTimestamp === undefined || latestTimestamp < firstTimestamp)
    ) {
        setFirstTimestamp(timestamps[0])
    }

    const heartRateWindowSeconds = detectPeaks?.heartRateWindowSeconds

    const heartRateStatus =
        heartRateWindowSeconds !== undefined && firstTimestamp !== undefined
            ? heartRateStatusFor(
                  peakTimestampsByChannel ?? [],
                  heartRateWindowSeconds,
                  { first: firstTimestamp, latest: latestTimestamp }
              )
            : undefined

    const hrvWindowSeconds = detectPeaks?.hrvWindowSeconds
    const beatsByChannelRef = useRef<number[][]>([])
    const [hrvMilliseconds, setHrvMilliseconds] = useState<number>()

    useEffect(() => {
        if (
            hrvWindowSeconds === undefined ||
            peakTimestampsByChannel === undefined ||
            latestTimestamp === undefined
        ) {
            return
        }

        const hasRestarted =
            beatsByChannelRef.current.length !==
                peakTimestampsByChannel.length ||
            beatsByChannelRef.current.some(
                (beats) => beats[beats.length - 1] > latestTimestamp
            )

        const beatsSoFar = hasRestarted
            ? peakTimestampsByChannel.map(() => [])
            : beatsByChannelRef.current

        beatsByChannelRef.current = beatsSoFar.map((beats, channel) =>
            withSettledBeats(beats, peakTimestampsByChannel[channel], {
                earliest: latestTimestamp - hrvWindowSeconds,
                latest: latestTimestamp - beatSettlingSeconds,
            })
        )

        setHrvMilliseconds(rmssdMillisecondsFor(beatsByChannelRef.current))
    }, [peakTimestampsByChannel, hrvWindowSeconds])

    const hrvStatus =
        hrvWindowSeconds !== undefined && firstTimestamp !== undefined
            ? hrvStatusFor(
                  hrvMilliseconds,
                  {
                      reliableAfterSeconds: hrvWindowSeconds,
                      provisionalAfterSeconds:
                          detectPeaks?.hrvProvisionalAfterSeconds,
                  },
                  { first: firstTimestamp, latest: latestTimestamp }
              )
            : undefined

    const bandPowerSampleRate = bandPowers?.sampleRate
    const bandPowerWindowSeconds = bandPowers?.windowSeconds

    const bandPowerWindowEnd = nowTimestamp ?? latestTimestamp

    const bandPowerTick = Math.floor(
        bandPowerWindowEnd / bandPowerIntervalSeconds
    )

    const bandPowersByChannel = useMemo(
        () =>
            bandPowerSampleRate !== undefined &&
            bandPowerWindowSeconds !== undefined
                ? valuesByChannel.map((values) =>
                      relativeBandPowersFor(values, timestamps, {
                          sampleRate: bandPowerSampleRate,
                          windowSeconds: bandPowerWindowSeconds,
                          windowEnd: bandPowerWindowEnd,
                      })
                  )
                : undefined,
        [
            bandPowerSampleRate,
            bandPowerWindowSeconds,
            bandPowerTick,
            channelCount,
        ]
    )

    const channelsLeftOut = bandPowers?.channelsLeftOut

    const hasBandPowers = (channel: number) =>
        !channelsLeftOut?.includes(labelFor(channel))

    const averageBandPowers =
        bandPowersByChannel &&
        averageBandPowersOf(
            bandPowersByChannel.filter((_, channel) => hasBandPowers(channel))
        )

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
                    channelPlotOptionsFor({
                        width: plotWidth,
                        height,
                        labelsTime: channel === lastShownChannel,
                        color,
                        hasPeakMarkers,
                        yLimits: { min: yMinLimit, max: yMaxLimit },
                        occurrencesOf: () => occurrencesRef.current[channel],
                        markedTimestampOf: () => markedTimestampRef.current,
                        sessionStartTimestampOf: () =>
                            sessionStartTimestampRef.current,
                    }),
                    hasPeakMarkers ? [[], [], []] : [[], []],
                    containerRefs.current[channel]!
                )
        )

        plotsRef.current = plots

        return () => plots.forEach((plot) => plot.destroy())
    }, [
        plottedChannelCount,
        lastShownChannel,
        color,
        hasPeakMarkers,
        yMinLimit,
        yMaxLimit,
    ])

    useEffect(() => {
        plotsRef.current.forEach((plot) => plot.redraw(false))
    }, [markedTimestamp, sessionStartTimestamp])

    useEffect(() => {
        plotsRef.current.forEach((plot, channel) =>
            plot.setSize({
                width: plotWidth,
                height: heightWithXAxis(height, channel === lastShownChannel),
            })
        )
    }, [plotWidth, height, plottedChannelCount, lastShownChannel])

    useEffect(() => {
        const rightEdgeTimestamp =
            nowTimestamp ?? timestamps[timestamps.length - 1]

        const leftEdgeTimestamp = Number.isFinite(windowSeconds)
            ? rightEdgeTimestamp - windowSeconds
            : (timestamps[0] ?? rightEdgeTimestamp)

        const shownSeconds = rightEdgeTimestamp - leftEdgeTimestamp

        const firstVisible = firstIndexAtOrAfter(timestamps, leftEdgeTimestamp)

        const pointsPerPixel = downsampling
            ? pointsPerPixelByDownsampling[downsampling]
            : 0

        const numBuckets = (plotWidth * pointsPerPixel) / 2
        const bucketSeconds = shownSeconds / numBuckets

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
                        min: leftEdgeTimestamp,
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
        '--channel-name-length': Math.max(
            0,
            ...Array.from(
                { length: channelCount },
                (_, channel) => labelFor(channel).length
            )
        ),
    }

    return (
        <section
            className={[
                'stream-plot',
                onMarkTimestamp && 'stream-plot--marks-time',
                onScrubTo && 'stream-plot--scrubs-time',
            ]
                .filter(Boolean)
                .join(' ')}
            style={plotStyle}
            data-testid={`stream-plot-${name}`}
            onClick={toggleHiddenUnlessClickedOnWindowPicker}
        >
            <header className="stream-plot__header">
                <span className="stream-plot__indicator" />
                <span className="stream-plot__name">{name}</span>
                {bandPowersByChannel && channelCount > 0 && (
                    <span className="stream-plot__average-band-powers">
                        <span className="stream-plot__readout-label">
                            Average (last{' '}
                            {durationLabelFor(bandPowerWindowSeconds!)})
                        </span>
                        <BandPowers powers={averageBandPowers} />
                    </span>
                )}
                {units !== undefined && channelCount > 0 && (
                    <Readout
                        kind="latest"
                        label="Latest"
                        value={latestValuesWithUnits(
                            samples.slice(-channelCount),
                            units
                        )}
                    />
                )}
                {heartRateStatus && (
                    <Readout
                        kind="heart-rate"
                        label="Heart rate"
                        value={heartRateStatus}
                    />
                )}
                {hrvStatus && (
                    <Readout kind="hrv" label="HRV (RMSSD)" {...hrvStatus} />
                )}
                <span className="stream-plot__meta">
                    {channelCount > 0 && !isHidden ? (
                        <>
                            {channelCount} ch ·{' '}
                            <WindowPicker
                                seconds={windowSeconds}
                                onChange={onWindowSecondsChange}
                            />
                        </>
                    ) : (
                        metaWithoutWindowFor(channelCount)
                    )}
                </span>
            </header>
            <div ref={channelsRef} className="stream-plot__channels">
                {shownChannels.map((channel) => (
                    <div
                        key={channel}
                        ref={(container) => {
                            containerRefs.current[channel] = container
                        }}
                        className="stream-plot__channel"
                        onMouseDown={(event) =>
                            startScrubbingIfGraphPressed(event, channel)
                        }
                        onClick={(event) =>
                            markTimestampIfGraphClicked(event, channel)
                        }
                    >
                        {(channelCount > 1 || bandPowersByChannel) && (
                            <div className="stream-plot__channel-header">
                                <span className="stream-plot__channel-name">
                                    {labelFor(channel)}
                                </span>
                                {bandPowersByChannel &&
                                    hasBandPowers(channel) && (
                                        <BandPowers
                                            powers={
                                                bandPowersByChannel[channel]
                                            }
                                        />
                                    )}
                            </div>
                        )}
                    </div>
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

const minScrubPixels = 3

function isOnGraph(plot: uPlot, event: React.MouseEvent) {
    const graph = plot.over.getBoundingClientRect()

    return (
        event.clientX >= graph.left &&
        event.clientX <= graph.right &&
        event.clientY >= graph.top &&
        event.clientY <= graph.bottom
    )
}

function metaWithoutWindowFor(channelCount: number) {
    return channelCount === 0
        ? 'Awaiting signal'
        : `${channelCount} ch · Hidden`
}

type PlotStyle = React.CSSProperties & {
    '--stream-color': string
    '--y-axis-width': string
    '--channel-name-length': number
}

const peakDetectionIntervalSeconds = 0.5
const bandPowerIntervalSeconds = 0.5

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

interface ReadoutProps {
    kind: string
    label: string
    value: string
    note?: string
}

const Readout: React.FC<ReadoutProps> = ({ kind, label, value, note }) => (
    <span className={`stream-plot__readout stream-plot__readout--${kind}`}>
        <span className="stream-plot__readout-label">{label}</span>
        <span className="stream-plot__readout-value">{value}</span>
        {note && <span className="stream-plot__readout-note">{note}</span>}
    </span>
)

function latestValuesWithUnits(values: number[], units: string) {
    const separator = units === '%' ? '' : ' '

    return values
        .map((value) => `${Number(value.toFixed(1))}${separator}${units}`)
        .join(', ')
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

interface PlotAppearance {
    width: number
    height: number
    labelsTime: boolean
    color: string
    hasPeakMarkers: boolean
    yLimits: YLimits
    occurrencesOf: () => ValueOccurrences | undefined
    markedTimestampOf: () => number | undefined
    sessionStartTimestampOf: () => number
}

function channelPlotOptionsFor(appearance: PlotAppearance): uPlot.Options {
    const {
        width,
        height,
        labelsTime,
        color,
        hasPeakMarkers,
        yLimits,
        occurrencesOf,
        markedTimestampOf,
        sessionStartTimestampOf,
    } = appearance

    return {
        width,
        height: heightWithXAxis(height, labelsTime),
        padding: [yPadding, 0, yPadding, 0],
        legend: { show: false },
        cursor: { show: false },
        scales: {
            x: { time: false },
            y: {
                range: (plot, min, max) =>
                    yRangeFor(plot, { min, max }, yLimits),
            },
        },
        axes: [labelsTime ? labeledXAxis : unlabeledXAxis, yAxis],
        hooks: {
            draw: [
                (plot) => drawOccurrenceStrip(plot, occurrencesOf(), color),
                (plot) =>
                    drawTimeMarker(plot, markedTimestampOf(), {
                        labelsTime,
                        sessionStartTimestamp: sessionStartTimestampOf(),
                    }),
            ],
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
const yPadding = 6
const numYBarsByPreference = [4, 3]
const maxYTickLabelLength = 7

const axisLabelGap = 6
const xAxisHeight = 14 + axisLabelGap
const minXIntervals = 4
const roundXTickSeconds = [
    1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400,
]

const axisLabelFontAt = (pxRatio: number) =>
    `${10 * pxRatio}px ui-monospace, "SF Mono", Menlo, monospace`

const axisLook: uPlot.Axis = {
    stroke: '#5f6878',
    font: axisLabelFontAt(1),
    ticks: { show: false },
    grid: { width: 1, stroke: 'rgba(255, 255, 255, 0.06)' },
}

const occurrenceStripWidth = 4
const occurrenceStripGap = 2

const yAxis: uPlot.Axis = {
    ...axisLook,
    side: leftSide,
    size: yAxisWidth,
    gap: occurrenceStripGap + occurrenceStripWidth + axisLabelGap,
    splits: (_, __, min, max) => tightestYBarsCovering(min, max),
    values: (_, ticks) => ticks.map(yTickLabelFor),
}

const unlabeledXAxis: uPlot.Axis = {
    ...axisLook,
    size: 0,
    splits: (_, __, min, max) => roundXTicksBackFrom(max, min),
    values: () => [],
}

const labeledXAxis: uPlot.Axis = {
    ...unlabeledXAxis,
    size: xAxisHeight,
    gap: axisLabelGap,
    values: (plot, ticks) =>
        ticks.map((tick) => xTickLabelFor(plot.scales.x.max! - tick)),
}

function heightWithXAxis(height: number, labelsTime: boolean) {
    return labelsTime ? height + xAxisHeight : height
}

function roundXTicksBackFrom(latest: number, earliest: number) {
    const shownSeconds = latest - earliest

    if (!(shownSeconds > 0)) {
        return []
    }

    const tickSeconds = roundXTickSecondsFor(shownSeconds)
    const numTicks = Math.floor(shownSeconds / tickSeconds + floatTolerance)

    return Array.from(
        { length: numTicks },
        (_, i) => latest - (numTicks - i) * tickSeconds
    )
}

function roundXTickSecondsFor(shownSeconds: number) {
    const longestAllowed = shownSeconds / minXIntervals + floatTolerance

    const longestRound = [...roundXTickSeconds]
        .reverse()
        .find((seconds) => seconds <= longestAllowed)

    return longestRound ?? roundFractionAtMost(longestAllowed)
}

function roundFractionAtMost(seconds: number) {
    const unit = 10 ** Math.floor(Math.log10(seconds))
    const mantissa = [5, 2, 1].find((mantissa) => mantissa * unit <= seconds)!

    return mantissa * unit
}

function xTickLabelFor(secondsAgo: number) {
    return `-${windowLabelFor(Math.round(secondsAgo * 1000) / 1000)}`
}

const latestYRangeByPlot = new WeakMap<uPlot, YRange>()

function yRangeFor(plot: uPlot, visible: VisibleExtremes, limits: YLimits) {
    const latest = latestYRangeByPlot.get(plot)
    const hasVisibleData = visible.min != null && visible.max != null

    if (!hasVisibleData && latest) {
        return latest
    }

    const bars = hasVisibleData
        ? tightestYBarsCovering(visible.min!, visible.max!)
        : tightestYBarsCovering(
              limits.min ?? limits.max ?? 0,
              limits.max ?? limits.min ?? 0
          )

    const range = withinYLimits([bars[0], bars[bars.length - 1]], limits)
    latestYRangeByPlot.set(plot, range)

    return range
}

function withinYLimits([low, high]: YRange, limits: YLimits): YRange {
    const { min = -Infinity, max = Infinity } = limits
    const span = high - low

    const shiftedHigh = Math.min(Math.max(high, min + span), max)
    const shiftedLow = Math.max(shiftedHigh - span, min)

    return [shiftedLow, shiftedHigh]
}

interface VisibleExtremes {
    min: number | null
    max: number | null
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

function fadingGlowFor(plot: uPlot, hexColor: string) {
    const { top, height } = plot.bbox
    const gradient = plot.ctx.createLinearGradient(0, top, 0, top + height)

    gradient.addColorStop(0, `${hexColor}33`)
    gradient.addColorStop(1, `${hexColor}00`)

    return gradient
}

const timeMarkerColor = '#e6e9ef'
const timeMarkerLabelPadding = 4

function drawTimeMarker(
    plot: uPlot,
    markedTimestamp: number | undefined,
    labeling: { labelsTime: boolean; sessionStartTimestamp: number }
) {
    if (markedTimestamp === undefined) {
        return
    }

    const { ctx, bbox } = plot
    const x = plot.valToPos(markedTimestamp, 'x', true)

    if (!(x >= bbox.left && x <= bbox.left + bbox.width)) {
        return
    }

    ctx.save()

    ctx.strokeStyle = timeMarkerColor
    ctx.lineWidth = uPlot.pxRatio
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(x, bbox.top)
    ctx.lineTo(x, bbox.top + bbox.height)
    ctx.stroke()

    if (labeling.labelsTime) {
        drawTimeMarkerLabel(
            plot,
            x,
            timeMarkerLabelFor(markedTimestamp - labeling.sessionStartTimestamp)
        )
    }

    ctx.restore()
}

function drawTimeMarkerLabel(plot: uPlot, x: number, label: string) {
    const { ctx, bbox } = plot
    const padding = timeMarkerLabelPadding * uPlot.pxRatio
    const top = bbox.top + bbox.height + (axisLabelGap / 2) * uPlot.pxRatio
    const height = (xAxisHeight - axisLabelGap / 2) * uPlot.pxRatio

    ctx.font = axisLabelFontAt(uPlot.pxRatio)
    const width = ctx.measureText(label).width + padding * 2

    ctx.fillStyle = timeMarkerColor
    ctx.fillRect(x - width / 2, top, width, height)

    ctx.fillStyle = '#10141b'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, top + height / 2)
}

function timeMarkerLabelFor(secondsSinceSessionStart: number) {
    return `${secondsSinceSessionStart.toFixed(3)}s`
}

const faintestOccurrenceOpacity = 0.15
const maxOccurrenceBins = 256

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

interface ReceivedSpan {
    first: number
    latest: number
}

function heartRateStatusFor(
    peakTimestampsByChannel: Set<number>[],
    windowSeconds: number,
    received: ReceivedSpan
) {
    const countdown = countdownUntilReady(windowSeconds, received)

    if (countdown) {
        return countdown
    }

    const beatsPerMinute = beatsPerMinuteFor(
        peakTimestampsByChannel,
        received.latest - windowSeconds
    )

    return `${beatsPerMinute ?? '--'} bpm`
}

function hrvStatusFor(
    hrvMilliseconds: number | undefined,
    thresholds: {
        reliableAfterSeconds: number
        provisionalAfterSeconds?: number
    },
    received: ReceivedSpan
) {
    const { reliableAfterSeconds, provisionalAfterSeconds } = thresholds

    const countdown = countdownUntilReady(
        provisionalAfterSeconds ?? reliableAfterSeconds,
        received
    )

    if (countdown) {
        return {
            value: countdown,
            note:
                provisionalAfterSeconds !== undefined
                    ? '(unreliable)'
                    : undefined,
        }
    }

    const secondsUntilReliable = secondsUntil(reliableAfterSeconds, received)

    return {
        value: `${hrvMilliseconds ?? '--'} ms`,
        note:
            secondsUntilReliable > 0
                ? `(unreliable, reliable in ${durationLabelFor(secondsUntilReliable)})`
                : '(reliable)',
    }
}

function countdownUntilReady(windowSeconds: number, received: ReceivedSpan) {
    const seconds = secondsUntil(windowSeconds, received)
    return seconds > 0 ? `Ready in ${durationLabelFor(seconds)}` : undefined
}

function secondsUntil(windowSeconds: number, received: ReceivedSpan) {
    return Math.ceil(windowSeconds - (received.latest - received.first))
}

const beatSettlingSeconds = 1
const minSecondsBetweenBeats = 0.25
const plausibleSecondsBetweenBeats = { min: 0.3, max: 2 }
const maxDeviationFromRecentBeats = 0.2
const numRecentBeatsCompared = 5

function withSettledBeats(
    beats: number[],
    detected: Set<number>,
    span: { earliest: number; latest: number }
) {
    const kept = beats.filter((beat) => beat >= span.earliest)

    const settled = [...detected]
        .filter((beat) => beat >= span.earliest && beat <= span.latest)
        .sort((a, b) => a - b)

    for (const beat of settled) {
        const previous = kept[kept.length - 1]

        if (
            previous === undefined ||
            beat - previous >= minSecondsBetweenBeats
        ) {
            kept.push(beat)
        }
    }

    return kept
}

function rmssdMillisecondsFor(beatsByChannel: number[][]) {
    const rmssdOfEachChannel = beatsByChannel
        .map(rmssdSecondsFor)
        .filter((rmssd) => rmssd !== undefined)

    return rmssdOfEachChannel.length > 0
        ? Math.round(meanOf(rmssdOfEachChannel) * 1000)
        : undefined
}

function rmssdSecondsFor(beats: number[]) {
    const intervals = beats.slice(1).map((beat, i) => beat - beats[i])
    const isNormal = normalIntervalFlagsFor(intervals)

    const squaredSuccessiveDifferences = intervals
        .slice(1)
        .flatMap((interval, i) =>
            isNormal[i] && isNormal[i + 1]
                ? [(interval - intervals[i]) ** 2]
                : []
        )

    return squaredSuccessiveDifferences.length > 0
        ? Math.sqrt(meanOf(squaredSuccessiveDifferences))
        : undefined
}

function normalIntervalFlagsFor(intervals: number[]) {
    const { min, max } = plausibleSecondsBetweenBeats
    const recentPlausible: number[] = []

    return intervals.map((interval) => {
        if (interval < min || interval > max) {
            return false
        }

        const typical =
            recentPlausible.length > 0
                ? medianOfSorted([...recentPlausible].sort((a, b) => a - b))
                : interval

        recentPlausible.push(interval)

        if (recentPlausible.length > numRecentBeatsCompared) {
            recentPlausible.shift()
        }

        return (
            Math.abs(interval - typical) / typical <=
            maxDeviationFromRecentBeats
        )
    })
}

function beatsPerMinuteFor(
    peakTimestampsByChannel: Set<number>[],
    earliestTimestamp: number
) {
    const secondsBetweenBeats = peakTimestampsByChannel
        .flatMap((peakTimestamps) => {
            const recent = [...peakTimestamps]
                .filter((timestamp) => timestamp >= earliestTimestamp)
                .sort((a, b) => a - b)

            return recent.slice(1).map((timestamp, i) => timestamp - recent[i])
        })
        .sort((a, b) => a - b)

    return secondsBetweenBeats.length > 0
        ? Math.round(60 / medianOfSorted(secondsBetweenBeats))
        : undefined
}

function medianOfSorted(values: number[]) {
    const middle = Math.floor(values.length / 2)

    return values.length % 2 === 1
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2
}

function peakTimestampsWithin(peakTimestamps: number[], timestamps: number[]) {
    const first = timestamps[0]
    const latest = timestamps[timestamps.length - 1]

    return new Set(
        peakTimestamps.filter(
            (timestamp) => timestamp >= first && timestamp <= latest
        )
    )
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

function averageBandPowersOf(powersByChannel: (number[] | undefined)[]) {
    const known = powersByChannel.filter((powers) => powers !== undefined)

    return known.length > 0
        ? frequencyBands.map((_, band) =>
              meanOf(known.map((powers) => powers[band]))
          )
        : undefined
}

const numHalfOverlappingSegments = 3
const minShareOfWindowReceived = 0.5

function relativeBandPowersFor(
    values: number[],
    timestamps: number[],
    options: BandPowerOptions & { windowEnd: number }
) {
    const { sampleRate, windowSeconds, windowEnd } = options
    const windowStart = windowEnd - windowSeconds

    if (!(timestamps[0] <= windowStart)) {
        return undefined
    }

    const inWindow = values.slice(firstIndexAfter(timestamps, windowStart))

    if (
        inWindow.length <
        windowSeconds * sampleRate * minShareOfWindowReceived
    ) {
        return undefined
    }

    const spectrum = summedSegmentPowerSpectrumFor(inWindow)
    const hzPerBin = sampleRate / spectrum.length

    const powers = frequencyBands.map((band) =>
        sumOf(
            spectrum.slice(
                Math.ceil(band.minHz / hzPerBin),
                Math.min(Math.ceil(band.maxHz / hzPerBin), spectrum.length / 2)
            )
        )
    )

    const totalPower = sumOf(powers)

    return totalPower > 0
        ? powers.map((power) => power / totalPower)
        : undefined
}

function summedSegmentPowerSpectrumFor(values: number[]) {
    const hop = Math.floor(values.length / (numHalfOverlappingSegments + 1))
    const segmentLength = hop * 2
    const fftLength = 2 ** Math.ceil(Math.log2(segmentLength))

    const fft = createFft({ radix: fftLength })
    const spectrum: number[] = new Array(fftLength).fill(0)

    for (let start = 0; start + segmentLength <= values.length; start += hop) {
        const segment = values.slice(start, start + segmentLength)
        const mean = meanOf(segment)

        const tapered = segment.map(
            (value, i) => (value - mean) * hannWeightAt(i, segmentLength)
        )

        const { real, imaginary } = fft.forward([
            ...tapered,
            ...new Array(fftLength - segmentLength).fill(0),
        ])

        real.forEach((re, bin) => {
            spectrum[bin] += re ** 2 + imaginary[bin] ** 2
        })
    }

    return spectrum
}

function hannWeightAt(index: number, length: number) {
    return 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / length)
}

function durationLabelFor(seconds: number) {
    return seconds < 60
        ? `${seconds}s`
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function firstIndexAfter(timestamps: number[], timestamp: number) {
    let index = timestamps.length

    while (index > 0 && timestamps[index - 1] > timestamp) {
        index--
    }

    return index
}

function meanOf(values: number[]) {
    return sumOf(values) / values.length
}

function sumOf(values: number[]) {
    return values.reduce((sum, value) => sum + value, 0)
}
