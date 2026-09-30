import { test, assert } from '@neurodevs/node-tdd'
import { act, render, screen } from '@testing-library/react'

import FakeStreamPlot, {
    passedStreamPlotProps,
    resetStreamPlotProps,
} from '../../../testDoubles/StreamPlot/FakeStreamPlot'
import FakeFrameScheduler from '../../../testDoubles/FrameScheduler/FakeFrameScheduler'
import FakeRetryTimer from '../../../testDoubles/RetryTimer/FakeRetryTimer'
import FakeWebSocket from '../../../testDoubles/WebSocket/FakeWebSocket'
import StreamMonitor, {
    BiosignalDevice,
    BiosignalStream,
    setClock,
    setFrameScheduler,
    setRetryTimer,
    setStreamPlotComponent,
    setWebSocketComponent,
    StreamData,
    streamColors,
} from '../../../ui/components/StreamMonitor'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class StreamMonitorTest extends AbstractPackageTest {
    private static nowMs = 0

    private static readonly deviceName = this.generateId()

    private static readonly streams = [
        { name: this.generateId(), wssPort: 1234 },
        { name: this.generateId(), wssPort: 5678 },
    ]

    private static readonly twoDevices: BiosignalDevice[] = [
        { name: this.generateId(), streams: [this.streams[0]] },
        { name: this.generateId(), streams: [this.streams[1]] },
    ]

    protected static async beforeEach() {
        await super.beforeEach()

        this.setFakeWebSocket()
        setFrameScheduler(FakeFrameScheduler.schedule)
        FakeFrameScheduler.resetTestDouble()
        this.nowMs = 0
        setClock(() => this.nowMs)
        setRetryTimer(FakeRetryTimer)
        FakeRetryTimer.resetTestDouble()
    }

    @test()
    protected static async rendersTopLevelView() {
        await this.render()

        assert.isTruthy(
            screen.getByTestId('stream-monitor'),
            'Failed to render top-level view!'
        )
    }

    @test()
    protected static async rendersTitleForEachStream() {
        await this.render()

        this.streams.forEach((stream) => {
            const title = screen.getByText(stream.name)

            assert.isTruthy(
                title,
                `Failed to render title for stream ${stream.name}!`
            )
        })
    }

    @test()
    protected static async createsWebSocketClientForEachStream() {
        await this.render()

        assert.isEqualDeep(
            FakeWebSocket.callsToConstructor,
            this.urlsFor(this.streams),
            'WebSocket clients not created with expected URLs!'
        )
    }

    @test()
    protected static async monitorCreatesPlotForEachStream() {
        await this.renderWithFakePlot()

        assert.isEqual(
            passedStreamPlotProps.length,
            this.streams.length,
            'Incorrect number of StreamPlot components created!'
        )
    }

    @test()
    protected static async closesWebSocketForEachStreamOnUnmount() {
        const { unmount } = await this.render()

        await unmount()

        assert.isEqual(
            FakeWebSocket.numCallsToClose,
            this.streams.length,
            'Did not close a WebSocket for each stream on unmount!'
        )
    }

    @test()
    protected static async doesNotReopenWebSocketsOnRerenderWithSameStreams() {
        const { rerender } = await this.render()

        const sameStreams = this.streams.map((stream) => ({ ...stream }))
        await rerender(<StreamMonitor devices={this.devicesFor(sameStreams)} />)

        assert.isEqual(
            FakeWebSocket.callsToConstructor.length,
            this.streams.length,
            'Reopened WebSockets on rerender with same streams!'
        )
    }

    @test()
    protected static async reopensWebSocketsOnRerenderWithNewPorts() {
        const { rerender } = await this.render()

        const newStreams = this.streams.map((stream) => ({
            ...stream,
            wssPort: stream.wssPort + 1,
        }))

        await rerender(<StreamMonitor devices={this.devicesFor(newStreams)} />)

        assert.isEqualDeep(
            {
                numCallsToClose: FakeWebSocket.numCallsToClose,
                callsToConstructor: FakeWebSocket.callsToConstructor,
            },
            {
                numCallsToClose: this.streams.length,
                callsToConstructor: [
                    ...this.urlsFor(this.streams),
                    ...this.urlsFor(newStreams),
                ],
            },
            'Did not reopen WebSockets on rerender with new ports!'
        )
    }

    @test()
    protected static async passesSamplesFromEachStreamToItsPlot() {
        await this.renderWithFakePlot()

        const chunks = await this.sendChunkToEachStream()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.samples
            ),
            chunks.map((chunk) => chunk.samples),
            'Did not pass samples from each stream to its plot!'
        )
    }

    @test()
    protected static async passesTimestampsFromEachStreamToItsPlot() {
        await this.renderWithFakePlot()

        const chunks = await this.sendChunkToEachStream()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.timestamps
            ),
            chunks.map((chunk) => chunk.timestamps),
            'Did not pass timestamps from each stream to its plot!'
        )
    }

    @test()
    protected static async accumulatesChunksWithinWindow() {
        await this.renderWithFakePlot()

        await this.sendChunk({ samples: [1, 2], timestamps: [0, 1] })
        await this.sendChunk({ samples: [3, 4], timestamps: [2, 3] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3, 4], timestamps: [0, 1, 2, 3] },
            'Did not accumulate chunks within window!'
        )
    }

    @test()
    protected static async dropsSamplesOlderThanTenSecondsByDefault() {
        await this.renderWithFakePlot()

        await this.sendChunk({
            samples: [1, 10, 2, 20, 3, 30],
            timestamps: [0, 1, 2],
        })

        await this.sendChunk({ samples: [4, 40], timestamps: [12] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [3, 30, 4, 40], timestamps: [2, 12] },
            'Did not drop samples older than 10 seconds!'
        )
    }

    @test()
    protected static async dropsSamplesOlderThanWindowSeconds() {
        this.setFakeStreamPlot()
        await render(
            <StreamMonitor
                devices={this.devicesFor(this.streams)}
                windowSeconds={1}
            />
        )

        await this.sendChunk({ samples: [1, 2, 3], timestamps: [0, 1, 2] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [2, 3], timestamps: [1, 2] },
            'Did not drop samples older than windowSeconds!'
        )
    }

    @test()
    protected static async startsFreshWhenChannelCountChanges() {
        await this.renderWithFakePlot()

        await this.sendChunk({ samples: [1, 2], timestamps: [0, 1] })
        await this.sendChunk({ samples: [10, 20, 30, 40], timestamps: [2, 3] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [10, 20, 30, 40], timestamps: [2, 3] },
            'Did not start fresh when channel count changed!'
        )
    }

    @test()
    protected static async passesWindowSecondsToEachPlot() {
        this.setFakeStreamPlot()
        await render(
            <StreamMonitor
                devices={this.devicesFor(this.streams)}
                windowSeconds={3}
            />
        )

        assert.isEqualDeep(
            passedStreamPlotProps.map((props) => props.windowSeconds),
            this.streams.map(() => 3),
            'Did not pass windowSeconds to each plot!'
        )
    }

    @test()
    protected static async showsNoDeviceStatusWithoutStatusPort() {
        await this.renderWithFakePlot()

        assert.isUndefined(
            this.deviceStatusOf(this.deviceName),
            'Showed a device status without a status port!'
        )
    }

    @test()
    protected static async connectsToDeviceStatusPort() {
        await this.renderWithDeviceStatus()

        assert.isTrue(
            FakeWebSocket.callsToConstructor.includes(this.deviceStatusUrl),
            'Did not connect to device status port!'
        )
    }

    @test()
    protected static async showsDisconnectedUntilDeviceStatusArrives() {
        await this.renderWithDeviceStatus()

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            'disconnected',
            'Did not show disconnected until device status arrived!'
        )
    }

    @test('disconnected shows disconnected', 'disconnected', 'disconnected')
    @test('connecting shows connecting', 'connecting', 'connecting')
    @test('connected shows connected', 'connected', 'connected')
    @test('streaming shows connected', 'streaming', 'connected')
    protected static async showsDeviceStatusForGatewayState(
        state: string,
        expectedStatus: string
    ) {
        await this.renderWithDeviceStatus()

        this.receiveDeviceStatus([
            { state, listenPorts: this.portsOf(this.streams) },
        ])

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            expectedStatus,
            `Did not show ${expectedStatus} for ${state} device!`
        )
    }

    @test()
    protected static async matchesEachDeviceByItsStreamPorts() {
        await this.renderWithDeviceStatus(this.twoDevices)

        this.receiveDeviceStatus([
            { state: 'streaming', listenPorts: [this.streams[1].wssPort] },
            { state: 'connecting', listenPorts: [this.streams[0].wssPort] },
        ])

        assert.isEqualDeep(
            this.twoDevices.map((device) => this.deviceStatusOf(device.name)),
            ['connecting', 'connected'],
            'Did not match each device by its stream ports!'
        )
    }

    @test()
    protected static async showsDisconnectedWhenDeviceStatusConnectionDrops() {
        await this.renderWithDeviceStatus()

        this.receiveDeviceStatus([
            { state: 'streaming', listenPorts: this.portsOf(this.streams) },
        ])
        await this.dropConnection(this.latestDeviceStatusSocket)

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            'disconnected',
            'Did not show disconnected when device status connection dropped!'
        )
    }

    @test()
    protected static async reconnectsToDeviceStatusAfterDrop() {
        await this.renderWithDeviceStatus()

        await this.dropConnection(this.latestDeviceStatusSocket)
        this.runPendingRetries()

        assert.isEqual(
            FakeWebSocket.callsToConstructor.filter(
                (url) => url === this.deviceStatusUrl
            ).length,
            2,
            'Did not reconnect to device status after drop!'
        )
    }

    @test()
    protected static async closesDeviceStatusSocketOnUnmount() {
        const { unmount } = await this.renderWithDeviceStatus()

        unmount()

        assert.isEqual(
            this.latestDeviceStatusSocket.readyState,
            WebSocket.CLOSED,
            'Did not close device status socket on unmount!'
        )
    }

    @test()
    protected static async showsNameOfEachDevice() {
        this.setFakeStreamPlot()
        await render(<StreamMonitor devices={this.twoDevices} />)

        assert.isTruthy(
            this.twoDevices.every((device) => screen.getByText(device.name)),
            'Did not show name of each device!'
        )
    }

    @test()
    protected static async groupsStreamsUnderTheirDevice() {
        this.setFakeStreamPlot()
        await render(<StreamMonitor devices={this.twoDevices} />)

        assert.isEqualDeep(
            this.twoDevices.map((device) =>
                Array.from(
                    screen
                        .getByTestId(`device-${device.name}`)
                        .querySelectorAll('[data-testid^="stream-plot-"]'),
                    (plot) => plot.getAttribute('data-testid')
                )
            ),
            this.twoDevices.map((device) =>
                device.streams.map((stream) => `stream-plot-${stream.name}`)
            ),
            'Did not group streams under their device!'
        )
    }

    @test()
    protected static async givesEachStreamItsOwnColorAcrossDevices() {
        this.setFakeStreamPlot()
        await render(<StreamMonitor devices={this.twoDevices} />)

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.color
            ),
            [...streamColors.slice(0, this.streams.length)],
            'Did not give each stream its own color across devices!'
        )
    }

    @test()
    protected static async connectsToStreamsOfEveryDevice() {
        await render(<StreamMonitor devices={this.twoDevices} />)

        assert.isEqualDeep(
            FakeWebSocket.callsToConstructor,
            this.urlsFor(this.streams),
            'Did not connect to streams of every device!'
        )
    }

    @test()
    protected static async passesDownsamplingToEachPlot() {
        this.setFakeStreamPlot()
        await render(
            <StreamMonitor
                devices={this.devicesFor(this.streams)}
                downsampling="heavy"
            />
        )

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.downsampling
            ),
            this.streams.map(() => 'heavy' as const),
            'Did not pass downsampling to each plot!'
        )
    }

    @test()
    protected static async streamDownsamplingOverridesMonitorValue() {
        this.setFakeStreamPlot()
        await render(
            <StreamMonitor
                devices={this.devicesFor([
                    { ...this.streams[0], downsampling: 'light' },
                ])}
                downsampling="heavy"
            />
        )

        assert.isEqual(
            this.latestPlotPropsFor(this.streams[0].name)?.downsampling,
            'light',
            'Stream downsampling did not override monitor value!'
        )
    }

    @test()
    protected static async givesEachStreamItsOwnColor() {
        this.setFakeStreamPlot()
        await this.render()

        const colors = this.streams.map(
            (stream) => this.latestPlotPropsFor(stream.name)?.color
        )

        assert.isEqualDeep(
            colors,
            [...streamColors.slice(0, this.streams.length)],
            'Did not give each stream its own color!'
        )
    }

    @test()
    protected static async passesPeakDetectionToPlot() {
        this.setFakeStreamPlot()
        const detectPeaks = { sampleRate: 64 }

        await render(
            <StreamMonitor
                devices={this.devicesFor([{ ...this.streams[0], detectPeaks }])}
            />
        )

        assert.isEqualDeep(
            this.latestPlotPropsFor(this.streams[0].name)?.detectPeaks,
            detectPeaks,
            'Did not pass peak detection to plot!'
        )
    }

    @test()
    protected static async rendersMessagesOncePerFrame() {
        await this.renderWithFakePlot()

        this.receiveChunk({ samples: [1], timestamps: [0] })
        this.receiveChunk({ samples: [2], timestamps: [1] })
        this.receiveChunk({ samples: [3], timestamps: [2] })

        const numFrames = FakeFrameScheduler.pending.length
        const rendersBeforeFrame = this.plotRendersFor(this.streams[0].name)

        await this.runFrame()

        assert.isEqualDeep(
            {
                numFrames,
                newRenders:
                    this.plotRendersFor(this.streams[0].name) -
                    rendersBeforeFrame,
                chunk: this.latestFirstPlotChunk,
            },
            {
                numFrames: 1,
                newRenders: 1,
                chunk: { samples: [1, 2, 3], timestamps: [0, 1, 2] },
            },
            'Did not render messages once per frame!'
        )
    }

    @test()
    protected static async keepsPlotsMovingWithoutNewData() {
        await this.renderWithFakePlot()

        this.nowMs = 1000
        await this.sendChunk({ samples: [1], timestamps: [5] })

        this.nowMs = 3000
        await this.runFrame()

        assert.isEqual(
            this.latestPlotPropsFor(this.streams[0].name)?.nowTimestamp,
            7,
            'Did not keep plots moving without new data!'
        )
    }

    @test()
    protected static async sharesTimeAxisAcrossStreams() {
        await this.renderWithFakePlot()

        this.receiveChunk({ samples: [1], timestamps: [10] })
        this.receiveChunk({ samples: [2], timestamps: [8] }, 1)
        await this.runFrame()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.nowTimestamp
            ),
            [10, 10],
            'Did not share time axis across streams!'
        )
    }

    @test()
    protected static async stopsAnimatingOnceOldDataIsGone() {
        await this.renderWithFakePlot()

        await this.sendChunk({ samples: [1], timestamps: [5] })

        this.nowMs = 5000
        await this.runFrame()
        const framesWhileVisible = FakeFrameScheduler.pending.length

        this.nowMs = 10001
        await this.runFrame()

        assert.isEqualDeep(
            {
                framesWhileVisible,
                framesAfterGone: FakeFrameScheduler.pending.length,
            },
            { framesWhileVisible: 1, framesAfterGone: 0 },
            'Did not stop animating once old data was gone!'
        )
    }

    @test()
    protected static async reconnectsOneSecondAfterUnexpectedClose() {
        await this.render()

        await this.dropConnection(FakeWebSocket.instances[0])
        this.runPendingRetries()

        assert.isEqualDeep(
            {
                delaysMs: FakeRetryTimer.delaysMs,
                callsToConstructor: FakeWebSocket.callsToConstructor,
            },
            {
                delaysMs: [1000],
                callsToConstructor: [
                    ...this.urlsFor(this.streams),
                    ...this.urlsFor([this.streams[0]]),
                ],
            },
            'Did not reconnect one second after unexpected close!'
        )
    }

    @test()
    protected static async retriesEverySecondTenTimesThenEveryTenSeconds() {
        await this.render()

        await this.failToReconnect(12)

        assert.isEqualDeep(
            FakeRetryTimer.delaysMs,
            [...Array(10).fill(1000), 10000, 10000],
            'Did not retry every second ten times then every ten seconds!'
        )
    }

    @test()
    protected static async retriesEverySecondAgainAfterReconnecting() {
        await this.render()

        await this.failToReconnect(11)

        this.runPendingRetries()
        this.openSocket(this.latestSocketFor(this.streams[0]))
        await this.dropConnection(this.latestSocketFor(this.streams[0]))

        assert.isEqual(
            FakeRetryTimer.delaysMs.at(-1),
            1000,
            'Did not retry every second again after reconnecting!'
        )
    }

    @test()
    protected static async doesNotReconnectAfterUnmount() {
        const { unmount } = await this.render()

        await this.dropConnection(FakeWebSocket.instances[0])
        await unmount()

        assert.isEqualDeep(
            {
                pending: FakeRetryTimer.pending.length,
                delaysMs: FakeRetryTimer.delaysMs,
            },
            { pending: 0, delaysMs: [1000] },
            'Reconnected after unmount!'
        )
    }

    @test()
    protected static async doesNotReconnectAfterPortsChange() {
        const { rerender } = await this.render()

        await rerender(
            <StreamMonitor
                devices={this.devicesFor(
                    this.streams.map((stream) => ({
                        ...stream,
                        wssPort: stream.wssPort + 1,
                    }))
                )}
            />
        )

        assert.isEqual(
            FakeRetryTimer.delaysMs.length,
            0,
            'Reconnected after ports changed!'
        )
    }

    @test()
    protected static async retriesAllDisconnectedStreamsTogether() {
        await this.render()

        await this.dropConnection(...FakeWebSocket.instances)
        this.runPendingRetries()

        assert.isEqualDeep(
            {
                delaysMs: FakeRetryTimer.delaysMs,
                callsToConstructor: FakeWebSocket.callsToConstructor,
            },
            {
                delaysMs: [1000],
                callsToConstructor: [
                    ...this.urlsFor(this.streams),
                    ...this.urlsFor(this.streams),
                ],
            },
            'Did not retry all disconnected streams together!'
        )
    }

    @test()
    protected static async retriesEverySecondWhenAnyStreamReconnects() {
        await this.render()

        await this.failToReconnect(11, this.streams)

        this.runPendingRetries()
        this.openSocket(this.latestSocketFor(this.streams[0]))
        await this.dropConnection(this.latestSocketFor(this.streams[1]))

        const numCallsBeforeRetry = FakeWebSocket.callsToConstructor.length
        this.runPendingRetries()

        assert.isEqualDeep(
            {
                delayMs: FakeRetryTimer.delaysMs.at(-1),
                retried:
                    FakeWebSocket.callsToConstructor.slice(numCallsBeforeRetry),
            },
            {
                delayMs: 1000,
                retried: this.urlsFor([this.streams[1]]),
            },
            'Did not retry every second when any stream reconnected!'
        )
    }

    private static async failToReconnect(
        times: number,
        streams = [this.streams[0]]
    ) {
        await this.dropConnection(
            ...streams.map((stream) => this.latestSocketFor(stream))
        )

        for (let i = 1; i < times; i++) {
            this.runPendingRetries()

            await this.dropConnection(
                ...streams.map((stream) => this.latestSocketFor(stream))
            )
        }
    }

    private static async dropConnection(...sockets: FakeWebSocket[]) {
        await act(async () => {
            sockets.forEach((socket) => socket.dropConnection())
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    private static openSocket(socket: FakeWebSocket) {
        act(() => socket.open())
    }

    private static runPendingRetries() {
        act(() => FakeRetryTimer.runPending())
    }

    private static latestSocketFor(stream: BiosignalStream) {
        const url = this.urlsFor([stream])[0]
        const index = FakeWebSocket.callsToConstructor.lastIndexOf(url)
        return FakeWebSocket.instances[index]
    }

    private static plotRendersFor(name: string) {
        return passedStreamPlotProps.filter((props) => props.name === name)
            .length
    }

    private static async sendChunk(chunk: StreamData) {
        this.receiveChunk(chunk)
        await this.runFrame()
    }

    private static receiveChunk(chunk: StreamData, streamIndex = 0) {
        FakeWebSocket.instances[streamIndex].receive(chunk)
    }

    private static async runFrame() {
        await act(() => FakeFrameScheduler.runFrame())
    }

    private static get latestFirstPlotChunk() {
        const props = this.latestPlotPropsFor(this.streams[0].name)
        return { samples: props?.samples, timestamps: props?.timestamps }
    }

    private static async sendChunkToEachStream() {
        const chunks = this.streams.map(() => ({
            samples: [Math.random(), Math.random()],
            timestamps: [Math.random(), Math.random()],
        }))

        FakeWebSocket.instances.forEach((socket, i) =>
            socket.receive(chunks[i])
        )
        await this.runFrame()

        return chunks
    }

    private static latestPlotPropsFor(name: string) {
        return passedStreamPlotProps
            .filter((props) => props.name === name)
            .at(-1)
    }

    private static readonly deviceStatusPort = 4321

    private static get deviceStatusUrl() {
        return `ws://localhost:${this.deviceStatusPort}`
    }

    private static get latestDeviceStatusSocket() {
        const index = FakeWebSocket.callsToConstructor.lastIndexOf(
            this.deviceStatusUrl
        )
        return FakeWebSocket.instances[index]
    }

    private static async renderWithDeviceStatus(
        devices = this.devicesFor(this.streams)
    ) {
        this.setFakeStreamPlot()
        return await render(
            <StreamMonitor
                devices={devices}
                deviceStatusPort={this.deviceStatusPort}
            />
        )
    }

    private static receiveDeviceStatus(
        devices: { state: string; listenPorts: number[] }[]
    ) {
        act(() => this.latestDeviceStatusSocket.receive({ devices }))
    }

    private static deviceStatusOf(deviceName: string) {
        return (
            screen
                .getByTestId(`device-${deviceName}`)
                .querySelector('.stream-monitor__device-status')
                ?.getAttribute('aria-label') ?? undefined
        )
    }

    private static portsOf(streams: BiosignalStream[]) {
        return streams.map((stream) => stream.wssPort)
    }

    private static devicesFor(streams: BiosignalStream[]): BiosignalDevice[] {
        return [{ name: this.deviceName, streams }]
    }

    private static urlsFor(streams: BiosignalStream[]) {
        return streams.map((stream) => `ws://localhost:${stream.wssPort}`)
    }

    private static setFakeWebSocket() {
        setWebSocketComponent(FakeWebSocket as any)
        FakeWebSocket.resetTestDouble()
    }

    private static setFakeStreamPlot() {
        setStreamPlotComponent(FakeStreamPlot)
        resetStreamPlotProps()
    }

    private static async renderWithFakePlot() {
        this.setFakeStreamPlot()
        await this.render()
    }

    private static async render() {
        return await render(
            <StreamMonitor devices={this.devicesFor(this.streams)} />
        )
    }
}
