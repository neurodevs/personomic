import simulatedMuseStreams, {
    simulatedMuse,
    simulatedMuseModel,
} from './simulatedMuse'

const orchestratorPort = 8763
const deviceStatusPort = 8764
const firstStreamPort = 8765

const protocolsDirectory = '~/Personomic/Protocols'
const recordingsDirectory = '~/Personomic/Recordings'

export default class DemoWebSocket {
    public static latencyMs = 400
    public static pushIntervalMs = 40
    public static reconnectAfterMs = 2000
    public static resumeDataAfterMs = 1000
    public static clock = () => performance.now()

    private static session?: RunningSession
    private static protocols = demoProtocols()
    private static statusSockets = new Set<DemoWebSocket>()
    private static signalTimeoutIds = new Set<ReturnType<typeof setTimeout>>()

    public readyState: number = WebSocket.CONNECTING
    public onopen?: () => void
    public onmessage?: (event: { data: string }) => void
    public onclose?: () => void

    private port: number
    private timeoutIds = new Set<ReturnType<typeof setTimeout>>()
    private pushIntervalId?: ReturnType<typeof setInterval>

    public constructor(url: string) {
        this.port = Number(new URL(url).port)
        this.later(() => this.open(), DemoWebSocket.latencyMs)
    }

    public send(data: string) {
        if (this.port !== orchestratorPort) {
            return
        }

        const message: OrchestratorMessage = JSON.parse(data)
        const latencyMs =
            message.command === 'start'
                ? DemoWebSocket.latencyMs * 3
                : DemoWebSocket.latencyMs

        this.later(
            () => this.receive(DemoWebSocket.replyTo(message)),
            latencyMs
        )
    }

    public close() {
        if (this.readyState === WebSocket.CLOSED) {
            return
        }

        this.readyState = WebSocket.CLOSED
        this.timeoutIds.forEach((id) => clearTimeout(id))
        clearInterval(this.pushIntervalId)
        DemoWebSocket.statusSockets.delete(this)
        this.onclose?.()
    }

    public static reset() {
        this.cancelSignalTimeouts()
        this.session = undefined
        this.protocols = demoProtocols()
    }

    public static loseSignal() {
        const { session } = this

        if (!session) {
            return
        }

        session.state = 'reconnecting'
        session.isDataPaused = true
        this.broadcastStatus()

        this.laterForSignal(() => {
            session.state = 'streaming'
            this.broadcastStatus()

            this.laterForSignal(() => {
                session.isDataPaused = false
            }, this.resumeDataAfterMs)
        }, this.reconnectAfterMs)
    }

    private static cancelSignalTimeouts() {
        this.signalTimeoutIds.forEach((id) => clearTimeout(id))
        this.signalTimeoutIds.clear()
    }

    private static laterForSignal(callback: () => void, ms: number) {
        const id = setTimeout(() => {
            this.signalTimeoutIds.delete(id)
            callback()
        }, ms)

        this.signalTimeoutIds.add(id)
    }

    private open() {
        const stream =
            DemoWebSocket.session?.streams[this.port - firstStreamPort]
        const isStreamPort = this.port >= firstStreamPort

        if (isStreamPort && !stream) {
            this.close()
            return
        }

        this.readyState = WebSocket.OPEN
        this.onopen?.()

        if (this.port === deviceStatusPort) {
            DemoWebSocket.statusSockets.add(this)
            this.receive(statusOf(DemoWebSocket.session))
        } else if (stream) {
            this.pushSamplesOf(stream, DemoWebSocket.session!.startedAtMs)
        }
    }

    private pushSamplesOf(stream: SessionStream, startedAtMs: number) {
        const { sampleRateHz, sampleAt } = stream
        const numDueAt = (ms: number) =>
            Math.floor(((ms - startedAtMs) / 1000) * sampleRateHz)

        let numPushed = numDueAt(DemoWebSocket.clock())

        this.pushIntervalId = setInterval(() => {
            const numDue = numDueAt(DemoWebSocket.clock())

            if (DemoWebSocket.session?.isDataPaused) {
                numPushed = numDue
                return
            }

            if (numDue <= numPushed) {
                return
            }

            const indexes = Array.from(
                { length: numDue - numPushed },
                (_, i) => numPushed + i
            )
            numPushed = numDue

            this.receive({
                samples: indexes.flatMap(sampleAt),
                timestamps: indexes.map(
                    (index) => startedAtMs / 1000 + index / sampleRateHz
                ),
            })
        }, DemoWebSocket.pushIntervalMs)
    }

    private receive(payload: unknown) {
        this.onmessage?.({ data: JSON.stringify(payload) })
    }

    private later(callback: () => void, ms: number) {
        const id = setTimeout(() => {
            this.timeoutIds.delete(id)
            callback()
        }, ms)

        this.timeoutIds.add(id)
    }

    private static start(request: StartRequest) {
        const { devices, xdfRecordPath } = request

        if (!devices.every(({ deviceName }) => isMuse(deviceName))) {
            return { error: 'The demo only simulates Muse headbands.' }
        }

        const started = devices.map((device) => ({
            ...device,
            deviceName:
                device.deviceName === 'Muse'
                    ? simulatedMuseModel
                    : device.deviceName,
        }))

        this.session = {
            devices: started,
            xdfRecordPath,
            startedAtMs: this.clock(),
            state: 'streaming',
            isDataPaused: false,
            streams: started.flatMap((device) =>
                simulatedMuseStreams.map((stream) => ({
                    ...stream,
                    deviceName: device.deviceName,
                }))
            ),
        }
        this.broadcastStatus()

        return { devices: started, xdfRecordPath }
    }

    private static stop() {
        this.cancelSignalTimeouts()
        this.session = undefined
        this.broadcastStatus()

        return {}
    }

    private static saveProtocol(request: SaveProtocolRequest) {
        const { protocol } = request
        const fileName = request.fileName ?? `${slugOf(protocol.name)}.json`

        this.protocols = [
            ...this.protocols.filter((listed) => listed.fileName !== fileName),
            { fileName, protocol },
        ]

        return { fileName, filePath: `${protocolsDirectory}/${fileName}` }
    }

    private static broadcastStatus() {
        this.statusSockets.forEach((socket) =>
            socket.receive(statusOf(this.session))
        )
    }

    private static replyTo(message: OrchestratorMessage) {
        const { session } = this

        switch (message.command) {
            case 'status':
                return session
                    ? {
                          devices: session.devices,
                          xdfRecordPath: session.xdfRecordPath,
                      }
                    : {}
            case 'listProtocols':
                return { protocols: this.protocols }
            case 'scan':
                return scanFor(message)
            case 'start':
                return this.start(message)
            case 'stop':
                return this.stop()
            case 'saveProtocol':
                return this.saveProtocol(message)
            case 'chooseDirectory':
                return { directory: recordingsDirectory }
            default:
                return {}
        }
    }
}

function statusOf(session?: RunningSession) {
    let listenPort = firstStreamPort

    return {
        devices: (session?.devices ?? []).map(({ deviceName }) => {
            const streams = simulatedMuseStreams.map(
                ({ type, channelNames, sampleRateHz }) => ({
                    name: `${deviceName} ${type} (${simulatedMuse.bleName})`,
                    type,
                    channelNames,
                    sampleRateHz,
                    listenPort: listenPort++,
                })
            )

            return {
                deviceName,
                state: session!.state,
                listenPorts: streams.map((stream) => stream.listenPort),
                streams,
            }
        }),
    }
}

function scanFor({ deviceNames }: ScanRequest) {
    return {
        scanned: Object.fromEntries(
            deviceNames.filter(isMuse).map((name) => [
                name,
                [
                    {
                        value: simulatedMuse.uuid,
                        source: simulatedMuse.bleName,
                    },
                ],
            ])
        ),
    }
}

function isMuse(deviceName: string) {
    return deviceName === 'Muse' || deviceName.startsWith('Muse ')
}

function slugOf(name: string) {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return slug || 'untitled-protocol'
}

function demoProtocols(): ListedProtocol[] {
    return [
        {
            fileName: 'muse-meditation.json',
            protocol: {
                schemaVersion: 1,
                name: 'Muse meditation',
                devices: [{ deviceName: simulatedMuseModel }],
            },
        },
    ]
}

interface RunningSession {
    devices: RequestedDevice[]
    xdfRecordPath?: string
    startedAtMs: number
    state: 'streaming' | 'reconnecting'
    isDataPaused: boolean
    streams: SessionStream[]
}

type SessionStream = (typeof simulatedMuseStreams)[number] & {
    deviceName: string
}

interface RequestedDevice {
    deviceName: string
    identifier?: string
    nickname?: string
    disableStreams?: string[]
}

type OrchestratorMessage =
    | ({ command: 'scan' } & ScanRequest)
    | ({ command: 'start' } & StartRequest)
    | ({ command: 'saveProtocol' } & SaveProtocolRequest)
    | {
          command:
              | 'status'
              | 'listProtocols'
              | 'stop'
              | 'chooseDirectory'
              | 'revealProtocol'
              | 'removeProtocol'
              | 'revealRecording'
      }

interface StartRequest {
    devices: RequestedDevice[]
    xdfRecordPath?: string
}

interface ScanRequest {
    deviceNames: string[]
}

interface SaveProtocolRequest {
    fileName?: string
    protocol: ListedProtocol['protocol']
}

interface ListedProtocol {
    fileName: string
    protocol: { name: string } & Record<string, unknown>
}
