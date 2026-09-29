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

    private static readonly streams = [
        { name: this.generateId(), wssPort: 1234 },
        { name: this.generateId(), wssPort: 5678 },
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
        await rerender(<StreamMonitor streams={sameStreams} />)

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

        await rerender(<StreamMonitor streams={newStreams} />)

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
        await render(<StreamMonitor streams={this.streams} windowSeconds={1} />)

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
        await render(<StreamMonitor streams={this.streams} windowSeconds={3} />)

        assert.isEqualDeep(
            passedStreamPlotProps.map((props) => props.windowSeconds),
            this.streams.map(() => 3),
            'Did not pass windowSeconds to each plot!'
        )
    }

    @test()
    protected static async passesDownsamplingToEachPlot() {
        this.setFakeStreamPlot()
        await render(
            <StreamMonitor streams={this.streams} downsampling="heavy" />
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
                streams={[{ ...this.streams[0], downsampling: 'light' }]}
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
            <StreamMonitor streams={[{ ...this.streams[0], detectPeaks }]} />
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
        FakeRetryTimer.runPending()

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

        FakeRetryTimer.runPending()
        this.latestSocketFor(this.streams[0]).open()
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
                streams={this.streams.map((stream) => ({
                    ...stream,
                    wssPort: stream.wssPort + 1,
                }))}
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
        FakeRetryTimer.runPending()

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

        FakeRetryTimer.runPending()
        this.latestSocketFor(this.streams[0]).open()
        await this.dropConnection(this.latestSocketFor(this.streams[1]))

        const numCallsBeforeRetry = FakeWebSocket.callsToConstructor.length
        FakeRetryTimer.runPending()

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
            FakeRetryTimer.runPending()

            await this.dropConnection(
                ...streams.map((stream) => this.latestSocketFor(stream))
            )
        }
    }

    private static async dropConnection(...sockets: FakeWebSocket[]) {
        sockets.forEach((socket) => socket.dropConnection())
        await new Promise((resolve) => setTimeout(resolve, 0))
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
        return await render(<StreamMonitor streams={this.streams} />)
    }
}
