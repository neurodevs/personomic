import { test, assert } from '@neurodevs/node-tdd'
import { render, screen } from '@testing-library/react-native'

import FakeStreamPlot, {
    passedStreamPlotProps,
    resetStreamPlotProps,
} from '../../../testDoubles/StreamPlot/FakeStreamPlot'
import FakeWebSocket from '../../../testDoubles/WebSocket/FakeWebSocket'
import StreamMonitor, {
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

        const expectedUrls = this.streams.map(
            (stream) => `wss://localhost:${stream.wssPort}`
        )

        assert.isEqualDeep(
            FakeWebSocket.callsToConstructor,
            expectedUrls,
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
        await render(<StreamMonitor streams={this.streams} />)
    }
}
