import React, { useEffect, useRef, useState } from 'react'

import StreamPlot, {
    BandPowerOptions,
    Downsampling,
    PeakDetectionOptions,
    YLimits,
} from './StreamPlot'

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

    const deviceKeys = deviceKeysFor(deviceNames)
    const devices = deviceNames.map((name, index) =>
        deviceFor(
            {
                key: deviceKeys[index],
                name,
                label: deviceLabelFor(index, deviceNames),
            },
            gatewayDevices,
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
                    key={device.key}
                    device={device}
                    status={
                        isGatewayConnected
                            ? deviceStatusFor(device, gatewayDevices)
                            : statusBeforeGatewayReports(isConnecting)
                    }
                    onRemove={onRemoveDevice}
                    identifier={identifiers[device.key]}
                    rememberedIdentifiers={rememberedIdentifiers[device.name]}
                    onForgetIdentifier={onForgetIdentifier}
                    onIdentifierChange={onIdentifierChange}
                >
                    {quickestFirst(device.streams).map((stream) => (
                        <StreamPlotComponent
                            key={stream.name}
                            {...stream}
                            downsampling={stream.downsampling ?? downsampling}
                            color={
                                streamColors[streamNames.indexOf(stream.name)]
                            }
                            {...dataByPort[stream.wssPort]}
                            windowSeconds={windowSecondsByPort[stream.wssPort]}
                            onWindowSecondsChange={(seconds) =>
                                chooseWindowSeconds(stream.wssPort, seconds)
                            }
                            nowTimestamp={sharedNowTimestamp}
                        />
                    ))}
                </DevicePanel>
            ))}
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

const DevicePanel: React.FC<DevicePanelProps> = ({
    device,
    status,
    onRemove,
    identifier,
    rememberedIdentifiers,
    onForgetIdentifier,
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
            data-testid={`device-${device.key}`}
            onClick={togglePlotsUnlessClickedOnContents}
        >
            <header className="stream-monitor__device-header">
                <DeviceStatusIndicator status={status} />
                <span className="stream-monitor__device-name">
                    {device.label}
                </span>
                {identifier && isIdentifierShown && (
                    <IdentifierInput
                        deviceLabel={device.label}
                        identifier={identifier}
                        remembered={rememberedIdentifiers}
                        onChange={
                            onIdentifierChange &&
                            ((value) => onIdentifierChange(device.key, value))
                        }
                        onForget={
                            onForgetIdentifier &&
                            ((value) => onForgetIdentifier(device.name, value))
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
                        aria-label={`Remove ${device.label}`}
                        title={`Remove ${device.label}`}
                        onClick={() => onRemove(device.key)}
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
    rememberedIdentifiers?: readonly string[]
    onForgetIdentifier?: (name: string, identifier: string) => void
    onIdentifierChange?: (name: string, value: string) => void
    children?: React.ReactNode
}

const IdentifierInput: React.FC<IdentifierInputProps> = ({
    deviceLabel,
    identifier,
    remembered = [],
    onChange,
    onForget,
}) => {
    const [isOpen, setIsOpen] = useState(false)

    const isLocked = onChange === undefined

    const choose = (value: string) => {
        onChange?.(value)
        setIsOpen(false)
    }

    return (
        <span className="stream-monitor__device-identifier-field">
            <input
                type="text"
                className="stream-monitor__device-identifier"
                aria-label={`${deviceLabel} ${identifier.label} (optional)`}
                placeholder={`${identifier.label} (optional)`}
                value={identifier.value}
                readOnly={isLocked}
                onChange={(event) => onChange?.(event.target.value)}
                onFocus={() => setIsOpen(true)}
                onClick={() => setIsOpen(true)}
                onBlur={() => setIsOpen(false)}
            />
            {isOpen && !isLocked && remembered.length > 0 && (
                <ul
                    className="stream-monitor__device-identifier-menu"
                    role="listbox"
                    aria-label={`Previous ${deviceLabel} ${identifier.label} values`}
                >
                    {remembered.map((value) => (
                        <li
                            key={value}
                            role="none"
                            className="stream-monitor__device-identifier-row"
                        >
                            <button
                                type="button"
                                role="option"
                                aria-selected={value === identifier.value}
                                className="stream-monitor__device-identifier-option"
                                onMouseDown={keepInputFocused}
                                onClick={() => choose(value)}
                            >
                                {value}
                            </button>
                            {onForget && (
                                <button
                                    type="button"
                                    className="stream-monitor__device-identifier-forget"
                                    aria-label={`Forget ${value}`}
                                    title={`Forget ${value}`}
                                    onMouseDown={keepInputFocused}
                                    onClick={() => onForget(value)}
                                >
                                    ×
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </span>
    )
}

function keepInputFocused(event: React.MouseEvent) {
    event.preventDefault()
}

interface IdentifierInputProps {
    deviceLabel: string
    identifier: DeviceIdentifier
    remembered?: readonly string[]
    onChange?: (value: string) => void
    onForget?: (value: string) => void
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

function statusBeforeGatewayReports(isConnecting: boolean): DeviceStatus {
    return isConnecting ? 'connecting' : 'disconnected'
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

interface BiosignalDevice extends ShownDevice {
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
