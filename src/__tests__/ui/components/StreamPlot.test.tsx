import { test, assert } from '@neurodevs/node-tdd'
import { act, render, screen } from '@testing-library/react'

import FakeResizeObserver from '../../../testDoubles/ResizeObserver/FakeResizeObserver'
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
    protected static async createsPlotForEachChannel() {
        await this.render(this.twoChannels)

        assert.isEqual(
            FakeUPlot.instances.length,
            2,
            'Did not create a plot for each channel!'
        )
    }

    @test()
    protected static async plotsEachChannelSeparately() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => ({
                numSeries: plot.options.series.length,
                data: plot.data,
            })),
            [
                {
                    numSeries: 2,
                    data: [
                        [0, 1, 2],
                        [1, 2, 3],
                    ],
                },
                {
                    numSeries: 2,
                    data: [
                        [0, 1, 2],
                        [10, 20, 30],
                    ],
                },
            ],
            'Did not plot each channel separately!'
        )
    }

    @test()
    protected static async createsEachChannelPlotWithSize() {
        await this.render({ ...this.twoChannels, width: 100, height: 50 })

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => ({
                width: plot.options.width,
                height: plot.options.height,
            })),
            [
                { width: 100, height: 50 },
                { width: 100, height: 50 },
            ],
            'Did not create each channel plot with size!'
        )
    }

    @test()
    protected static async showsWindowEndingAtLatestSample() {
        await this.render({
            samples: [0, 0, 5, 5, 10, 10],
            timestamps: [4, 5, 6],
        })

        assert.isEqualDeep(
            this.xScales,
            [
                { min: -4, max: 6 },
                { min: -4, max: 6 },
            ],
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
            this.xScales,
            [{ min: 5, max: 7 }],
            'Did not show window ending at nowTimestamp!'
        )
    }

    @test()
    protected static async dropsSamplesThatScrolledOutOfWindow() {
        await this.render({
            samples: [1, 2, 3],
            timestamps: [0, 1, 2],
            windowSeconds: 10,
            nowTimestamp: 11,
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data,
            [
                [1, 2],
                [2, 3],
            ],
            'Did not drop samples that scrolled out of window!'
        )
    }

    @test()
    protected static async clearsPlotOnceAllSamplesScrollOut() {
        await this.render({
            samples: [1, 2, 3],
            timestamps: [0, 1, 2],
            windowSeconds: 10,
            nowTimestamp: 13,
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data,
            [[], []],
            'Did not clear plot once all samples scrolled out!'
        )
    }

    @test()
    protected static async destroysPlotsOnUnmount() {
        const { unmount } = await this.render(this.twoChannels)

        unmount()

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.isDestroyed),
            [true, true],
            'Did not destroy plots on unmount!'
        )
    }

    @test()
    protected static async fillsContainerWidthByDefault() {
        await this.render(this.twoChannels)

        act(() => FakeResizeObserver.latest.resize(800))

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.size?.width),
            [800, 800],
            'Did not fill container width by default!'
        )
    }

    @test()
    protected static async usesGivenWidthInsteadOfContainerWidth() {
        await this.render({ ...this.twoChannels, width: 100 })

        assert.isEqual(
            FakeResizeObserver.instances.length,
            0,
            'Observed container width despite a given width!'
        )
    }

    @test()
    protected static async stopsObservingContainerOnUnmount() {
        const { unmount } = await this.render(this.twoChannels)

        unmount()

        assert.isTrue(
            FakeResizeObserver.latest.isDisconnected,
            'Did not stop observing container on unmount!'
        )
    }

    private static readonly twoChannels = {
        samples: [1, 10, 2, 20, 3, 30],
        timestamps: [0, 1, 2],
    }

    private static get xScales() {
        return FakeUPlot.instances.map((plot) => plot.scales.x)
    }

    private static async render(props?: Partial<StreamPlotProps>) {
        return render(<StreamPlot name={this.plotName} {...props} />)
    }
}
