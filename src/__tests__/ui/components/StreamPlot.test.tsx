import { test, assert } from '@neurodevs/node-tdd'
import { render, screen } from '@testing-library/react'

import FakeUPlot from '../../../testDoubles/UPlot/FakeUPlot'
import StreamPlot, { StreamPlotProps } from '../../../ui/components/StreamPlot'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class StreamPlotTest extends AbstractPackageTest {
    private static readonly plotName = this.generateId()

    protected static async beforeEach() {
        await super.beforeEach()

        FakeUPlot.resetTestDouble()
    }

    @test()
    protected static async rendersTopLevelView() {
        await this.render()

        assert.isTruthy(
            screen.getByTestId(`stream-plot-${this.plotName}`),
            'Failed to render top-level view!'
        )
    }

    @test()
    protected static async rendersName() {
        await this.render()

        assert.isTruthy(
            screen.getByText(this.plotName),
            'Failed to render plot name!'
        )
    }

    @test()
    protected static async createsPlotWithSize() {
        await this.render({ width: 100, height: 50 })

        assert.isEqualDeep(
            {
                width: FakeUPlot.latest.options.width,
                height: FakeUPlot.latest.options.height,
            },
            { width: 100, height: 50 },
            'Did not create plot with size!'
        )
    }

    @test()
    protected static async plotsEachChannelAgainstTimestamps() {
        await this.render({
            samples: [1, 10, 2, 20, 3, 30],
            timestamps: [0, 1, 2],
        })

        assert.isEqualDeep(
            {
                numSeries: FakeUPlot.latest.options.series.length,
                data: FakeUPlot.latest.data,
            },
            {
                numSeries: 3,
                data: [
                    [0, 1, 2],
                    [1, 2, 3],
                    [10, 20, 30],
                ],
            },
            'Did not plot each channel against timestamps!'
        )
    }

    @test()
    protected static async showsWindowEndingAtLatestSample() {
        await this.render({ samples: [0, 5, 10], timestamps: [4, 5, 6] })

        assert.isEqualDeep(
            FakeUPlot.latest.scales.x,
            { min: -4, max: 6 },
            'Did not show window ending at latest sample!'
        )
    }

    @test()
    protected static async showsWindowEndingAtNowTimestamp() {
        await this.render({
            samples: [0, 10],
            timestamps: [4, 5],
            windowSeconds: 2,
            nowTimestamp: 7,
        })

        assert.isEqualDeep(
            FakeUPlot.latest.scales.x,
            { min: 5, max: 7 },
            'Did not show window ending at nowTimestamp!'
        )
    }

    @test()
    protected static async destroysPlotOnUnmount() {
        const { unmount } = await this.render()

        unmount()

        assert.isTrue(
            FakeUPlot.latest.isDestroyed,
            'Did not destroy plot on unmount!'
        )
    }

    private static async render(props?: Partial<StreamPlotProps>) {
        return render(<StreamPlot name={this.plotName} {...props} />)
    }
}
