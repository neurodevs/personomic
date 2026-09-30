import React, { useEffect, useState } from 'react'

import StreamPlot, { Downsampling, PeakDetectionOptions } from './StreamPlot'

export interface StreamMonitorProps {
    devices: BiosignalDevice[]
    windowSeconds?: number
    downsampling?: Downsampling
    deviceStatusPort?: number
}

const StreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    const {
        devices,
        windowSeconds = 10,
        downsampling,
        deviceStatusPort,
    } = props

    const streams = devices.flatMap((device) => device.streams)

    const [dataByPort, setDataByPort] = useState<Record<number, StreamData>>({})
    const [arrivalsByPort, setArrivalsByPort] = useState<
        Record<number, LatestArrival>
    >({})
    const [nowMs, setNowMs] = useState(0)
    const [gatewayDevices, setGatewayDevices] = useState<GatewayDevice[]>()

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
        if (deviceStatusPort === undefined) {
            return
        }

        let socket: WebSocket
        let retryTimerId: unknown
        let isClosed = false

        const connect = () => {
            retryTimerId = undefined
            socket = new WebSocketComponent(
                `ws://localhost:${deviceStatusPort}`
            )

            socket.onmessage = (event) =>
                setGatewayDevices(JSON.parse(event.data).devices)

            socket.onclose = () => {
                if (isClosed) {
                    return
                }

                setGatewayDevices(undefined)
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
    }, [deviceStatusPort])

    const sharedNowTimestamp = sharedNowTimestampFor(arrivalsByPort, nowMs)

    return (
        <div className="stream-monitor" data-testid="stream-monitor">
            {devices.map((device) => (
                <section
                    key={device.name}
                    className="stream-monitor__device"
                    data-testid={`device-${device.name}`}
                >
                    <header className="stream-monitor__device-header">
                        <span className="stream-monitor__device-name">
                            {device.name}
                        </span>
                        {deviceStatusPort !== undefined && (
                            <DeviceStatusIndicator
                                status={deviceStatusFor(device, gatewayDevices)}
                            />
                        )}
                        <span className="stream-monitor__device-meta">
                            {device.streams.length} streams
                        </span>
                    </header>
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
                </section>
            ))}
        </div>
    )
}

export default StreamMonitor

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

function sharedNowTimestampFor(
    arrivalsByPort: Record<number, LatestArrival>,
    nowMs: number
) {
    const estimates = Object.values(arrivalsByPort).map(
        (arrival) => arrival.timestamp + (nowMs - arrival.arrivedAtMs) / 1000
    )

    return estimates.length > 0 ? Math.max(...estimates) : undefined
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

function deviceStatusFor(
    device: BiosignalDevice,
    gatewayDevices: GatewayDevice[] = []
): DeviceStatus {
    const ports = device.streams.map((stream) => stream.wssPort)

    const gatewayDevice = gatewayDevices.find((candidate) =>
        candidate.listenPorts.some((port) => ports.includes(port))
    )

    return gatewayDevice
        ? deviceStatusByState[gatewayDevice.state]
        : 'disconnected'
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
    state: GatewayDeviceState
    listenPorts: number[]
}

export interface BiosignalDevice {
    name: string
    streams: BiosignalStream[]
}

export interface BiosignalStream {
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
