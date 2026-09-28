import { test, assert } from '@neurodevs/node-tdd'
import { act, render, screen } from '@testing-library/react-native'

import FakeStreamPlot, {
    passedStreamPlotProps,
    resetStreamPlotProps,
} from '../../../testDoubles/StreamPlot/FakeStreamPlot'
import FakeWebSocket from '../../../testDoubles/WebSocket/FakeWebSocket'
import StreamMonitor, {
    BiosignalStream,
    setStreamPlotComponent,
    setWebSocketComponent,
    StreamData,
} from '../../../ui/components/StreamMonitor'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class StreamMonitorTest extends AbstractPackageTest {
    private static readonly streams = [
        { name: this.generateId(), wssPort: 1234 },
        { name: this.generateId(), wssPort: 5678 },
    ]

    protected static async beforeEach() {
        await super.beforeEach()

        this.setFakeWebSocket()
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
    protected static async passesWindowSecondsToEachPlot() {
        this.setFakeStreamPlot()
        await render(<StreamMonitor streams={this.streams} windowSeconds={3} />)

        assert.isEqualDeep(
            passedStreamPlotProps.map((props) => props.windowSeconds),
            this.streams.map(() => 3),
            'Did not pass windowSeconds to each plot!'
        )
    }

    private static async sendChunk(chunk: StreamData) {
        await act(() => {
            FakeWebSocket.instances[0].receive(chunk)
        })
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

        await act(() => {
            FakeWebSocket.instances.forEach((socket, i) =>
                socket.receive(chunks[i])
            )
        })

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
