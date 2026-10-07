import React, { useEffect, useState } from 'react'

import StreamPlot, { Downsampling, PeakDetectionOptions } from './StreamPlot'

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
    streamOptions?: Record<string, StreamOptions>
    windowSeconds?: number
    downsampling?: Downsampling
    isConnecting?: boolean
    identifiers?: Record<string, DeviceIdentifier>
    onIdentifierChange?: (name: string, value: string) => void
    onRemoveDevice?: (name: string) => void
}

const StreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    const {
        deviceNames,
        deviceStatusPort,
        streamOptions = {},
        windowSeconds = 10,
        downsampling,
        onRemoveDevice,
        isConnecting = false,
        identifiers = {},
        onIdentifierChange,
    } = props

    const [dataByPort, setDataByPort] = useState<Record<number, StreamData>>({})
    const [arrivalsByPort, setArrivalsByPort] = useState<
        Record<number, LatestArrival>
    >({})
    const [nowMs, setNowMs] = useState(0)
    const [gatewayDevices, setGatewayDevices] = useState<GatewayDevice[]>([])
    const [isGatewayConnected, setIsGatewayConnected] = useState(false)

    const devices = deviceNames.map((name) =>
        deviceFor(name, gatewayDevices, streamOptions)
    )
    const streams = devices.flatMap((device) => device.streams)

    const wssPorts = streams.map((stream) => stream.wssPort).join(',')

    useEffect(() => {
        let pendingByPort: Record<number, StreamData[]> = {}
        const latestArrivalByPort: Record<number, LatestArrival> = {}
        let isFrameScheduled = false
        let isClosed = false

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

            const frameMs = clock()
            const batches = pendingByPort
            pendingByPort = {}

            recordLatestArrivals(batches, frameMs)
            renderBatches(batches)
            setNowMs(frameMs)

            if (isAnyDataStillOnScreen(frameMs)) {
                scheduleNextFrame()
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

        const isAnyDataStillOnScreen = (frameMs: number) =>
            Object.values(latestArrivalByPort).some(
                (arrival) =>
                    frameMs - arrival.arrivedAtMs <= windowSeconds * 1000
            )

        const renderBatches = (batches: Record<number, StreamData[]>) => {
            if (Object.keys(batches).length === 0) {
                return
            }

            setDataByPort((previous) => {
                const next = { ...previous }

                for (const [port, pending] of Object.entries(batches)) {
                    for (const data of pending) {
                        next[Number(port)] = appendToWindow(
                            next[Number(port)],
                            data,
                            windowSeconds
                        )
                    }
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

        streams.forEach((stream) => void connect(stream))

        return () => {
            isClosed = true
            if (retryTimerId !== undefined) {
                retryTimer.clear(retryTimerId)
            }

            Object.values(socketsByPort).forEach((socket) => socket.close())
        }
    }, [wssPorts])

    useEffect(() => {
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
    }, [deviceStatusPort, isConnecting])

    const sharedNowTimestamp = sharedNowTimestampFor(arrivalsByPort, nowMs)

    return (
        <div className="stream-monitor" data-testid="stream-monitor">
            {devices.map((device) => (
                <DevicePanel
                    key={device.name}
                    device={device}
                    status={
                        isGatewayConnected
                            ? deviceStatusFor(device.name, gatewayDevices)
                            : statusBeforeGatewayReports(isConnecting)
                    }
                    onRemove={onRemoveDevice}
                    identifier={identifiers[device.name]}
                    onIdentifierChange={onIdentifierChange}
                >
                    {device.streams.map((stream) => (
                        <StreamPlotComponent
                            key={stream.name}
                            {...stream}
                            downsampling={stream.downsampling ?? downsampling}
                            color={streamColors[streams.indexOf(stream)]}
                            {...dataByPort[stream.wssPort]}
                            windowSeconds={windowSeconds}
                            nowTimestamp={sharedNowTimestamp}
                        />
                    ))}
                </DevicePanel>
            ))}
        </div>
    )
}

export default StreamMonitor

function sharedNowTimestampFor(
    arrivalsByPort: Record<number, LatestArrival>,
    nowMs: number
) {
    const estimates = Object.values(arrivalsByPort).map(
        (arrival) => arrival.timestamp + (nowMs - arrival.arrivedAtMs) / 1000
    )

    return estimates.length > 0 ? Math.max(...estimates) : undefined
}

const DevicePanel: React.FC<DevicePanelProps> = ({
    device,
    status,
    onRemove,
    identifier,
    onIdentifierChange,
    children,
}) => {
    const hasStreams = device.streams.length > 0

    const isLocked = onIdentifierChange === undefined

    const isIdentifierShown =
        identifier !== undefined &&
        (isLocked ? identifier.value.trim() !== '' : status === 'disconnected')

    const [arePlotsHidden, setArePlotsHidden] = useState(false)

    const togglePlotsUnlessClickedOnContents = (event: React.MouseEvent) => {
        const clicked = event.target as Element

        if (!clicked.closest(`input, button, .${deviceStreamsClassName}`)) {
            setArePlotsHidden((wereHidden) => !wereHidden)
        }
    }

    return (
        <section
            className={`stream-monitor__device stream-monitor__device--${status}`}
            data-testid={`device-${device.name}`}
            onClick={togglePlotsUnlessClickedOnContents}
        >
            <header className="stream-monitor__device-header">
                <DeviceStatusIndicator status={status} />
                <span className="stream-monitor__device-name">
                    {device.name}
                </span>
                {identifier && isIdentifierShown && (
                    <input
                        type="text"
                        className="stream-monitor__device-identifier"
                        aria-label={`${device.name} ${identifier.label} (optional)`}
                        placeholder={`${identifier.label} (optional)`}
                        value={identifier.value}
                        readOnly={isLocked}
                        onChange={(event) =>
                            onIdentifierChange?.(
                                device.name,
                                event.target.value
                            )
                        }
                    />
                )}
                {hasStreams && (
                    <span className="stream-monitor__device-meta">
                        {device.streams.length} streams
                    </span>
                )}
                {onRemove && (
                    <button
                        type="button"
                        className="stream-monitor__device-remove"
                        aria-label={`Remove ${device.name}`}
                        title={`Remove ${device.name}`}
                        onClick={() => onRemove(device.name)}
                    >
                        ×
                    </button>
                )}
            </header>
            {hasStreams && !arePlotsHidden && (
                <div className={deviceStreamsClassName}>{children}</div>
            )}
        </section>
    )
}

const deviceStreamsClassName = 'stream-monitor__device-streams'

interface DevicePanelProps {
    device: BiosignalDevice
    status: DeviceStatus
    onRemove?: (name: string) => void
    identifier?: DeviceIdentifier
    onIdentifierChange?: (name: string, value: string) => void
    children?: React.ReactNode
}

const DeviceStatusIndicator: React.FC<{ status: DeviceStatus }> = ({
    status,
}) => (
    <span
        className={`stream-monitor__device-status stream-monitor__device-status--${status}`}
        aria-label={status}
        title={status}
    />
)

function deviceFor(
    name: string,
    gatewayDevices: GatewayDevice[],
    streamOptions: Record<string, StreamOptions>
): BiosignalDevice {
    const gatewayStreams = gatewayDeviceNamed(name, gatewayDevices)?.streams

    return {
        name,
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
    const { detectPeaks, downsampling } = options

    return {
        name: type,
        wssPort: listenPort,
        channelNames: channelNames.map((channel) =>
            withoutTypePrefix(channel, type)
        ),
        detectPeaks: detectPeaks && {
            ...detectPeaks,
            sampleRate: sampleRateHz,
        },
        downsampling,
    }
}

function withoutTypePrefix(channel: string, type: string) {
    const prefix = `${type}_`
    return channel.startsWith(prefix) ? channel.slice(prefix.length) : channel
}

function deviceStatusFor(
    name: string,
    gatewayDevices: GatewayDevice[]
): DeviceStatus {
    const gatewayDevice = gatewayDeviceNamed(name, gatewayDevices)

    return gatewayDevice
        ? deviceStatusByState[gatewayDevice.state]
        : 'disconnected'
}

function statusBeforeGatewayReports(isConnecting: boolean): DeviceStatus {
    return isConnecting ? 'connecting' : 'disconnected'
}

function gatewayDeviceNamed(name: string, gatewayDevices: GatewayDevice[]) {
    return gatewayDevices.find((device) => device.deviceName === name)
}

const deviceStatusByState: Record<GatewayDeviceState, DeviceStatus> = {
    disconnected: 'disconnected',
    connecting: 'connecting',
    connected: 'connected',
    streaming: 'connected',
}

const deviceStatusRetryDelayMs = 1000

function retryDelayMsAfter(numFailedRetries: number) {
    return numFailedRetries < 10 ? 1000 : 10000
}

function appendToWindow(
    previous: StreamData | undefined,
    data: StreamData,
    windowSeconds: number
): StreamData {
    const channelCount = channelCountOf(data)
    const kept =
        previous && channelCountOf(previous) === channelCount
            ? previous
            : undefined

    const samples = [...(kept?.samples ?? []), ...data.samples]
    const timestamps = [...(kept?.timestamps ?? []), ...data.timestamps]

    const cutoff = timestamps[timestamps.length - 1] - windowSeconds
    const firstKept = timestamps.findIndex((timestamp) => timestamp >= cutoff)

    return {
        samples: samples.slice(firstKept * channelCount),
        timestamps: timestamps.slice(firstKept),
    }
}

function channelCountOf(data: StreamData) {
    return data.samples.length / data.timestamps.length
}

interface LatestArrival {
    timestamp: number
    arrivedAtMs: number
}

export interface StreamData {
    samples: number[]
    timestamps: number[]
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

export interface DeviceIdentifier {
    label: string
    value: string
}

export interface StreamOptions {
    detectPeaks?: Omit<PeakDetectionOptions, 'sampleRate'>
    downsampling?: Downsampling
}

interface BiosignalDevice {
    name: string
    streams: BiosignalStream[]
}

interface BiosignalStream {
    name: string
    wssPort: number
    detectPeaks?: PeakDetectionOptions
    channelNames?: string[]
    downsampling?: Downsampling
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
