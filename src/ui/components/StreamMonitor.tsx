import React, { useEffect, useRef, useState } from 'react'

import { RecordedStream, Recording } from '../../functions/readXdfRecording'
import DevicePanel from './DevicePanel'
import { DeviceIdentifier } from './IdentifierInput'
import StreamPlot, {
    BandPowerOptions,
    Downsampling,
    PeakDetectionOptions,
    YLimits,
} from './StreamPlot'

export type { DeviceIdentifier } from './IdentifierInput'

export const streamColors = [
    '#3987e5',
    '#d95926',
    '#199e70',
    '#c98500',
    '#d55181',
    '#008300',
    '#9085e9',
    '#e66767',
] as const

export interface StreamMonitorProps {
    deviceNames: string[]
    deviceStatusPort: number
    recording?: Recording
    playbackSpeed?: number
    playbackSeek?: PlaybackSeek
    isPlaybackPaused?: boolean
    onPlaybackEnd?: () => void
    onPlaybackProgress?: (progress: PlaybackProgress) => void
    streamOptions?: Record<string, StreamOptions>
    windowSeconds?: number
    windowSecondsByDevice?: Record<string, number>
    downsampling?: Downsampling
    isConnecting?: boolean
    identifiers?: Record<string, DeviceIdentifier>
    rememberedIdentifiers?: Record<string, readonly string[]>
    onForgetIdentifier?: (name: string, identifier: string) => void
    onIdentifierChange?: (name: string, value: string) => void
    onRemoveDevice?: (name: string) => void
}

const StreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    const {
        deviceNames,
        deviceStatusPort,
        recording: recording,
        playbackSpeed = 1,
        playbackSeek,
        isPlaybackPaused = false,
        onPlaybackEnd,
        onPlaybackProgress,
        streamOptions = {},
        windowSeconds = 10,
        windowSecondsByDevice = {},
        downsampling,
        onRemoveDevice,
        isConnecting = false,
        identifiers = {},
        rememberedIdentifiers = {},
        onForgetIdentifier,
        onIdentifierChange,
    } = props

    const [dataByPort, setDataByPort] = useState<Record<number, StreamData>>({})
    const [arrivalsByPort, setArrivalsByPort] = useState<
        Record<number, LatestArrival>
    >({})
    const [nowMs, setNowMs] = useState(0)
    const [chosenWindowSecondsByPort, setChosenWindowSecondsByPort] = useState<
        Record<number, number>
    >({})
    const [gatewayDevices, setGatewayDevices] = useState<GatewayDevice[]>([])
    const [isGatewayConnected, setIsGatewayConnected] = useState(false)
    const [runOutDevices, setRunOutDevices] = useState<boolean[]>([])

    const reportedDevices = recording
        ? gatewayDevicesPlaying(recording, runOutDevices)
        : gatewayDevices
    const isReportingDevices = isGatewayConnected || recording !== undefined

    const deviceKeys = deviceKeysFor(deviceNames)
    const devices = deviceNames.map((name, index) =>
        deviceFor(
            {
                key: deviceKeys[index],
                name,
                label: deviceLabelFor(index, deviceNames),
            },
            reportedDevices,
            streamOptions
        )
    )
    const streams = devices.flatMap((device) => device.streams)
    const streamNames = [...new Set(streams.map((stream) => stream.name))]

    const windowSecondsByPort: Record<number, number> = Object.fromEntries(
        devices.flatMap((device) =>
            device.streams.map((stream) => [
                stream.wssPort,
                chosenWindowSecondsByPort[stream.wssPort] ??
                    windowSecondsByDevice[device.name] ??
                    windowSeconds,
            ])
        )
    )

    const windowSecondsByPortRef = useRef(windowSecondsByPort)
    windowSecondsByPortRef.current = windowSecondsByPort

    const sessionByPortRef = useRef<Record<number, StreamData>>({})

    const playbackSpeedRef = useRef(playbackSpeed)
    playbackSpeedRef.current = playbackSpeed

    const isPlaybackPausedRef = useRef(isPlaybackPaused)
    isPlaybackPausedRef.current = isPlaybackPaused

    const playbackSeekRef = useRef(playbackSeek)
    playbackSeekRef.current = playbackSeek

    const scheduleFrameRef = useRef<() => void>(undefined)

    const onPlaybackEndRef = useRef(onPlaybackEnd)
    onPlaybackEndRef.current = onPlaybackEnd

    const onPlaybackProgressRef = useRef(onPlaybackProgress)
    onPlaybackProgressRef.current = onPlaybackProgress

    const retainedSecondsFor = (port: number, windowSeconds: number) => {
        const stream = streams.find((stream) => stream.wssPort === port)

        return Math.max(
            windowSeconds,
            stream?.detectPeaks?.heartRateWindowSeconds ?? 0,
            stream?.bandPowers?.windowSeconds ?? 0
        )
    }

    const chooseWindowSeconds = (port: number, seconds: number) => {
        setChosenWindowSecondsByPort((previous) => ({
            ...previous,
            [port]: seconds,
        }))

        const session = sessionByPortRef.current[port]

        if (session) {
            setDataByPort((previous) => ({
                ...previous,
                [port]: latestSecondsOf(
                    session,
                    retainedSecondsFor(port, seconds)
                ),
            }))
        }
    }

    const wssPorts = streams.map((stream) => stream.wssPort).join(',')

    useEffect(() => {
        let pendingByPort: Record<number, StreamData[]> = {}
        const latestArrivalByPort: Record<number, LatestArrival> = {}
        let isFrameScheduled = false
        let isClosed = false
        let shownRunOutDevices: boolean[] = []
        let hasPlaybackEnded = false
        let reportedElapsedSeconds: number | undefined
        let appliedSeek = playbackSeekRef.current

        const retainedSecondsOfPort = (port: number) =>
            retainedSecondsFor(port, windowSecondsFor(port))

        const playback = recording && playbackOf(recording, clock())

        const scheduleNextFrame = () => {
            if (!isFrameScheduled) {
                isFrameScheduled = true
                scheduleFrame(renderFrame)
            }
        }

        const renderFrame = () => {
            isFrameScheduled = false

            if (isClosed) {
                return
            }

            const frameMs = playback
                ? playback.pacedClockAt(clock(), currentPlaybackSpeed())
                : clock()

            if (playback && playbackSeekRef.current !== appliedSeek) {
                seekInPlace(playback, frameMs)
            }

            const batches = playback?.takeSamplesDueBy(frameMs) ?? pendingByPort
            pendingByPort = {}

            recordLatestArrivals(batches, frameMs)
            renderBatches(batches)
            setNowMs(frameMs)

            if (isAnyDataStillOnScreen(frameMs) || playback?.isUnfinished()) {
                scheduleNextFrame()
            }

            if (playback) {
                showDevicesThatRanOut(playback.runOutDevices())
                reportProgressEachWholeSecond(playback.progressAt(frameMs))
            }

            if (playback && !playback.isUnfinished() && !hasPlaybackEnded) {
                hasPlaybackEnded = true
                onPlaybackEndRef.current?.()
            }
        }

        const seekInPlace = (playback: Playback, frameMs: number) => {
            appliedSeek = playbackSeekRef.current

            playback.seekTo(appliedSeek?.seconds ?? 0, retainedSecondsOfPort)
            clearShownData()
            hasPlaybackEnded = false
            reportedElapsedSeconds = playback.progressAt(frameMs).elapsedSeconds
        }

        const clearShownData = () => {
            sessionByPortRef.current = {}

            for (const port of Object.keys(latestArrivalByPort)) {
                delete latestArrivalByPort[Number(port)]
            }

            setDataByPort({})
            setArrivalsByPort({})
        }

        const currentPlaybackSpeed = () =>
            isPlaybackPausedRef.current ? 0 : playbackSpeedRef.current

        const reportProgressEachWholeSecond = (progress: PlaybackProgress) => {
            if (progress.elapsedSeconds !== reportedElapsedSeconds) {
                reportedElapsedSeconds = progress.elapsedSeconds
                onPlaybackProgressRef.current?.(progress)
            }
        }

        const showDevicesThatRanOut = (runOut: boolean[]) => {
            const hasChanged = runOut.some(
                (hasRunOut, index) =>
                    hasRunOut !== (shownRunOutDevices[index] ?? false)
            )

            if (hasChanged && !isPlaybackPausedRef.current) {
                shownRunOutDevices = runOut
                setRunOutDevices(runOut)
            }
        }

        const recordLatestArrivals = (
            batches: Record<number, StreamData[]>,
            frameMs: number
        ) => {
            let hasNewArrivals = false

            for (const [port, pending] of Object.entries(batches)) {
                const timestamps = pending.flatMap((data) => data.timestamps)

                if (timestamps.length > 0) {
                    latestArrivalByPort[Number(port)] = {
                        timestamp: timestamps[timestamps.length - 1],
                        arrivedAtMs: frameMs,
                    }
                    hasNewArrivals = true
                }
            }

            if (hasNewArrivals) {
                setArrivalsByPort({ ...latestArrivalByPort })
            }
        }

        const windowSecondsFor = (port: number) =>
            windowSecondsByPortRef.current[port] ?? windowSeconds

        const isAnyDataStillOnScreen = (frameMs: number) =>
            Object.entries(latestArrivalByPort).some(
                ([port, arrival]) =>
                    frameMs - arrival.arrivedAtMs <=
                    windowSecondsFor(Number(port)) * 1000
            )

        const renderBatches = (batches: Record<number, StreamData[]>) => {
            if (Object.keys(batches).length === 0) {
                return
            }

            const sessionByPort = sessionByPortRef.current

            for (const [port, pending] of Object.entries(batches)) {
                for (const data of pending) {
                    sessionByPort[Number(port)] = appendToSession(
                        sessionByPort[Number(port)],
                        data
                    )
                }
            }

            setDataByPort((previous) => {
                const next = { ...previous }

                for (const port of Object.keys(batches).map(Number)) {
                    next[port] = latestSecondsOf(
                        sessionByPortRef.current[port],
                        retainedSecondsFor(port, windowSecondsFor(port))
                    )
                }

                return next
            })
        }

        const socketsByPort: Record<number, WebSocket> = {}
        const disconnected = new Set<BiosignalStream>()
        let numFailedRetries = 0
        let retryTimerId: unknown

        const scheduleRetry = () => {
            if (isClosed || retryTimerId !== undefined) {
                return
            }

            retryTimerId = retryTimer.set(
                retryDisconnectedTogether,
                retryDelayMsAfter(numFailedRetries)
            )
        }

        const retryDisconnectedTogether = async () => {
            retryTimerId = undefined

            const streamsToRetry = [...disconnected]
            disconnected.clear()

            const results = await Promise.all(
                streamsToRetry.map((stream) => connect(stream, true))
            )

            if (!results.some((isOpen) => isOpen)) {
                numFailedRetries++
            }

            if (disconnected.size > 0) {
                scheduleRetry()
            }
        }

        const connect = (stream: BiosignalStream, isRetry = false) =>
            new Promise<boolean>((resolve) => {
                const socket = new WebSocketComponent(
                    `ws://localhost:${stream.wssPort}`
                )

                socketsByPort[stream.wssPort] = socket
                let wasOpen = false

                socket.onopen = () => {
                    wasOpen = true
                    numFailedRetries = 0
                    resolve(true)
                }

                socket.onclose = () => {
                    if (isClosed) {
                        return
                    }

                    disconnected.add(stream)
                    resolve(false)

                    if (wasOpen || !isRetry) {
                        scheduleRetry()
                    }
                }

                socket.onmessage = (event) => {
                    const { samples, timestamps } = JSON.parse(event.data)

                    pendingByPort[stream.wssPort] ??= []
                    pendingByPort[stream.wssPort].push({ samples, timestamps })

                    scheduleNextFrame()
                }
            })

        if (playback) {
            playback.seekTo(appliedSeek?.seconds ?? 0, retainedSecondsOfPort)
            scheduleFrameRef.current = scheduleNextFrame
            scheduleNextFrame()
        } else {
            streams.forEach((stream) => void connect(stream))
        }

        return () => {
            isClosed = true
            scheduleFrameRef.current = undefined
            if (retryTimerId !== undefined) {
                retryTimer.clear(retryTimerId)
            }

            Object.values(socketsByPort).forEach((socket) => socket.close())
        }
    }, [wssPorts, recording])

    useEffect(() => {
        scheduleFrameRef.current?.()
    }, [playbackSeek])

    useEffect(() => {
        if (recording) {
            return undefined
        }

        let socket: WebSocket
        let retryTimerId: unknown
        let isClosed = false

        const connect = () => {
            retryTimerId = undefined
            socket = new WebSocketComponent(
                `ws://localhost:${deviceStatusPort}`
            )

            socket.onmessage = (event) => {
                setGatewayDevices(JSON.parse(event.data).devices)
                setIsGatewayConnected(true)
            }

            socket.onclose = () => {
                if (isClosed) {
                    return
                }

                setIsGatewayConnected(false)
                retryTimerId = retryTimer.set(connect, deviceStatusRetryDelayMs)
            }
        }

        connect()

        return () => {
            isClosed = true
            if (retryTimerId !== undefined) {
                retryTimer.clear(retryTimerId)
            }

            socket.close()
        }
    }, [deviceStatusPort, isConnecting, recording])

    const sharedNowTimestamp = sharedNowTimestampFor(arrivalsByPort, nowMs)

    return (
        <div className="stream-monitor" data-testid="stream-monitor">
            {devices.map((device) => {
                const status = statusWhile(
                    isConnecting,
                    isReportingDevices
                        ? deviceStatusFor(device, reportedDevices)
                        : 'disconnected'
                )

                return (
                    <DevicePanel
                        key={device.key}
                        device={device}
                        status={status}
                        hasRunOut={
                            recording !== undefined && status === 'disconnected'
                        }
                        onRemove={onRemoveDevice}
                        identifier={identifiers[device.key]}
                        rememberedIdentifiers={
                            rememberedIdentifiers[device.name]
                        }
                        onForgetIdentifier={onForgetIdentifier}
                        onIdentifierChange={onIdentifierChange}
                    >
                        {quickestFirst(device.streams).map((stream) => (
                            <StreamPlotComponent
                                key={stream.name}
                                {...stream}
                                downsampling={
                                    stream.downsampling ?? downsampling
                                }
                                color={
                                    streamColors[
                                        streamNames.indexOf(stream.name)
                                    ]
                                }
                                {...dataByPort[stream.wssPort]}
                                windowSeconds={
                                    windowSecondsByPort[stream.wssPort]
                                }
                                onWindowSecondsChange={(seconds) =>
                                    chooseWindowSeconds(stream.wssPort, seconds)
                                }
                                nowTimestamp={sharedNowTimestamp}
                            />
                        ))}
                    </DevicePanel>
                )
            })}
        </div>
    )
}

export default StreamMonitor

function quickestFirst(streams: BiosignalStream[]) {
    return [...streams].sort(
        (a, b) => (b.sampleRateHz ?? 0) - (a.sampleRateHz ?? 0)
    )
}

function sharedNowTimestampFor(
    arrivalsByPort: Record<number, LatestArrival>,
    nowMs: number
) {
    const estimates = Object.values(arrivalsByPort).map(
        (arrival) => arrival.timestamp + (nowMs - arrival.arrivedAtMs) / 1000
    )

    return estimates.length > 0 ? Math.max(...estimates) : undefined
}

const deviceStatusRetryDelayMs = 1000

function retryDelayMsAfter(numFailedRetries: number) {
    return numFailedRetries < 10 ? 1000 : 10000
}

function appendToSession(
    session: StreamData | undefined,
    data: StreamData
): StreamData {
    const isSameShape =
        data.timestamps.length === 0 ||
        channelCountOf(session ?? data) === channelCountOf(data)

    const continued =
        session && isSameShape ? session : { samples: [], timestamps: [] }

    data.samples.forEach((sample) => continued.samples.push(sample))
    data.timestamps.forEach((timestamp) => continued.timestamps.push(timestamp))

    return continued
}

function latestSecondsOf(session: StreamData, seconds: number): StreamData {
    const { samples, timestamps } = session
    const channelCount = channelCountOf(session)
    const cutoff = timestamps[timestamps.length - 1] - seconds

    let firstKept = timestamps.length

    while (firstKept > 0 && timestamps[firstKept - 1] >= cutoff) {
        firstKept--
    }

    return {
        samples: samples.slice(firstKept * channelCount),
        timestamps: timestamps.slice(firstKept),
    }
}

interface LatestArrival {
    timestamp: number
    arrivedAtMs: number
}

export interface StreamData {
    samples: number[]
    timestamps: number[]
}

// Test doubles

export let WebSocketComponent = WebSocket

export function setWebSocketComponent(component: typeof WebSocket) {
    WebSocketComponent = component
}

export let scheduleFrame = (callback: () => void) => {
    requestAnimationFrame(callback)
}

export function setFrameScheduler(scheduler: typeof scheduleFrame) {
    scheduleFrame = scheduler
}

export let clock = () => performance.now()

export function setClock(nextClock: typeof clock) {
    clock = nextClock
}

export let retryTimer: RetryTimer = {
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: (id) => clearTimeout(id),
}

export function setRetryTimer(timer: RetryTimer) {
    retryTimer = timer
}

export interface RetryTimer {
    set(callback: () => void, delayMs: number): unknown
    clear(id: any): void
}

export let StreamPlotComponent = StreamPlot

export function setStreamPlotComponent(component: typeof StreamPlot) {
    StreamPlotComponent = component
}

function deviceFor(
    shown: ShownDevice,
    gatewayDevices: GatewayDevice[],
    streamOptions: Record<string, StreamOptions>
): BiosignalDevice {
    const gatewayStreams = gatewayDeviceFor(shown, gatewayDevices)?.streams

    return {
        ...shown,
        streams: (gatewayStreams ?? []).map((stream) =>
            streamFor(stream, streamOptions[stream.type])
        ),
    }
}

function streamFor(
    stream: GatewayStream,
    options: StreamOptions = {}
): BiosignalStream {
    const { type, listenPort, channelNames, sampleRateHz } = stream
    const { detectPeaks, bandPowers, downsampling, yLimits, units } = options

    return {
        name: type,
        wssPort: listenPort,
        sampleRateHz,
        channelNames: channelNames.map((channel) =>
            withoutTypePrefix(channel, type)
        ),
        detectPeaks: detectPeaks && {
            ...detectPeaks,
            sampleRate: sampleRateHz,
        },
        bandPowers: bandPowers && {
            ...bandPowers,
            sampleRate: sampleRateHz,
        },
        downsampling,
        yLimits,
        units,
    }
}

function withoutTypePrefix(channel: string, type: string) {
    const prefix = `${type}_`
    return channel.startsWith(prefix) ? channel.slice(prefix.length) : channel
}

function deviceStatusFor(
    shown: ShownDevice,
    gatewayDevices: GatewayDevice[]
): DeviceStatus {
    const gatewayDevice = gatewayDeviceFor(shown, gatewayDevices)

    return gatewayDevice
        ? deviceStatusByState[gatewayDevice.state]
        : 'disconnected'
}

function statusWhile(
    isConnecting: boolean,
    reported: DeviceStatus
): DeviceStatus {
    return isConnecting && reported === 'disconnected' ? 'connecting' : reported
}

function gatewayDeviceFor(shown: ShownDevice, gatewayDevices: GatewayDevice[]) {
    const sameNamed = gatewayDevices.filter(
        (device) => device.deviceName === shown.name
    )
    return sameNamed[occurrenceOf(shown) - 1]
}

function occurrenceOf(shown: ShownDevice) {
    return shown.key === shown.name
        ? 1
        : Number(shown.key.slice(shown.name.length + repeatSeparator.length))
}

const repeatSeparator = ' #'

function deviceLabelFor(index: number, deviceNames: string[]) {
    const name = deviceNames[index]
    const isRepeated =
        deviceNames.indexOf(name) !== deviceNames.lastIndexOf(name)
    const occurrence = deviceNames
        .slice(0, index + 1)
        .filter((earlier) => earlier === name).length

    return isRepeated ? `${name}${repeatSeparator}${occurrence}` : name
}

export function deviceKeysFor(deviceNames: string[]) {
    const numSeenByName: Record<string, number> = {}

    return deviceNames.map((name) => {
        const occurrence = (numSeenByName[name] ?? 0) + 1
        numSeenByName[name] = occurrence

        return occurrence === 1
            ? name
            : `${name}${repeatSeparator}${occurrence}`
    })
}

const deviceStatusByState: Record<GatewayDeviceState, DeviceStatus> = {
    disconnected: 'disconnected',
    connecting: 'connecting',
    connected: 'connected',
    streaming: 'connected',
}

export type DeviceStatus = 'disconnected' | 'connecting' | 'connected'

type GatewayDeviceState =
    'disconnected' | 'connecting' | 'connected' | 'streaming'

interface GatewayDevice {
    deviceName: string
    state: GatewayDeviceState
    streams: GatewayStream[]
}

interface GatewayStream {
    type: string
    listenPort: number
    channelNames: string[]
    sampleRateHz: number
}

export interface StreamOptions {
    detectPeaks?: Omit<PeakDetectionOptions, 'sampleRate'>
    bandPowers?: Omit<BandPowerOptions, 'sampleRate'>
    downsampling?: Downsampling
    yLimits?: YLimits
    units?: string
}

interface ShownDevice {
    key: string
    name: string
    label: string
}

export interface BiosignalDevice extends ShownDevice {
    streams: BiosignalStream[]
}

interface BiosignalStream {
    name: string
    wssPort: number
    sampleRateHz?: number
    detectPeaks?: PeakDetectionOptions
    bandPowers?: BandPowerOptions
    channelNames?: string[]
    downsampling?: Downsampling
    yLimits?: YLimits
    units?: string
}

function gatewayDevicesPlaying(
    recording: Recording,
    runOutDevices: boolean[]
): GatewayDevice[] {
    let numStreamsBefore = 0

    return recording.devices.map(({ deviceName, streams }, index) => ({
        deviceName,
        state: runOutDevices[index] ? 'disconnected' : 'streaming',
        streams: streams.map(({ type, channelNames, sampleRateHz }) => ({
            type,
            channelNames,
            sampleRateHz,
            listenPort: playbackPortOf(numStreamsBefore++),
        })),
    }))
}

function playbackPortOf(streamIndex: number) {
    return streamIndex + 1
}

function playbackOf(recording: Recording, clockMs: number) {
    const streams = recording.devices.flatMap((device) => device.streams)
    const numPlayed = streams.map(() => 0)
    const recordingStart = Math.min(
        ...streams.map((stream) => stream.timestamps[0])
    )
    const recordingEnd = Math.max(
        ...streams.map((stream) => stream.timestamps.at(-1)!)
    )
    const totalSeconds = Math.floor(recordingEnd - recordingStart)
    let startedAtMs = clockMs
    let lastClockMs = clockMs
    let pacedMs = clockMs

    const pacedClockAt = (clockMs: number, speed: number) => {
        pacedMs += (clockMs - lastClockMs) * speed
        lastClockMs = clockMs
        return pacedMs
    }

    const seekTo = (
        seconds: number,
        retainedSecondsOfPort: (port: number) => number
    ) => {
        startedAtMs = pacedMs - seconds * 1000
        const position = recordingStart + seconds

        streams.forEach((stream, index) => {
            const firstShown =
                position - retainedSecondsOfPort(playbackPortOf(index))
            numPlayed[index] = endOfSamplesBefore(firstShown, stream)
        })
    }

    const takeSamplesDueBy = (nowMs: number) => {
        const dueBy = recordingStart + (nowMs - startedAtMs) / 1000
        const due: Record<number, StreamData[]> = {}

        streams.forEach((stream, index) => {
            const first = numPlayed[index]
            const end = endOfSamplesDueBy(dueBy, stream, first)

            if (end > first) {
                numPlayed[index] = end
                due[playbackPortOf(index)] = [
                    samplesBetween(first, end, stream),
                ]
            }
        })

        return due
    }

    const progressAt = (nowMs: number): PlaybackProgress => ({
        elapsedSeconds: Math.min(
            Math.floor((nowMs - startedAtMs) / 1000),
            totalSeconds
        ),
        totalSeconds,
    })

    const isUnfinished = () =>
        streams.some(
            (stream, index) => numPlayed[index] < stream.timestamps.length
        )

    const deviceIndexOfStream = recording.devices.flatMap((device, index) =>
        device.streams.map(() => index)
    )

    const runOutDevices = () =>
        recording.devices.map((_, deviceIndex) =>
            streams.every(
                (stream, index) =>
                    deviceIndexOfStream[index] !== deviceIndex ||
                    numPlayed[index] >= stream.timestamps.length
            )
        )

    return {
        pacedClockAt,
        takeSamplesDueBy,
        progressAt,
        isUnfinished,
        runOutDevices,
        seekTo,
    }
}

type Playback = ReturnType<typeof playbackOf>

function endOfSamplesBefore(cutoff: number, stream: RecordedStream) {
    const index = stream.timestamps.findIndex(
        (timestamp) => timestamp >= cutoff
    )
    return index === -1 ? stream.timestamps.length : index
}

function endOfSamplesDueBy(
    dueBy: number,
    stream: RecordedStream,
    first: number
) {
    const { timestamps } = stream
    let end = first

    while (end < timestamps.length && timestamps[end] <= dueBy) {
        end++
    }

    return end
}

function samplesBetween(
    first: number,
    end: number,
    stream: RecordedStream
): StreamData {
    const channelCount = channelCountOf(stream)

    return {
        samples: stream.samples.slice(first * channelCount, end * channelCount),
        timestamps: stream.timestamps.slice(first, end),
    }
}

export interface PlaybackSeek {
    seconds: number
}

export interface PlaybackProgress {
    elapsedSeconds: number
    totalSeconds: number
}

function channelCountOf(data: { samples: number[]; timestamps: number[] }) {
    return data.samples.length / data.timestamps.length
}
