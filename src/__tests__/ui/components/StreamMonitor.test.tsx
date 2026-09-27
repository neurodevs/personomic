import { test, assert } from '@neurodevs/node-tdd'
import { render, screen } from '@testing-library/react-native'

import FakeStreamPlot, {
    passedStreamPlotProps,
    resetStreamPlotProps,
} from '../../../testDoubles/StreamPlot/FakeStreamPlot'
import FakeWebSocket from '../../../testDoubles/WebSocket/FakeWebSocket'
import StreamMonitor, {
    BiosignalStream,
    setStreamPlotComponent,
    setWebSocketComponent,
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
