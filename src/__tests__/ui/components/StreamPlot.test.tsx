import { test, assert } from '@neurodevs/node-tdd'
import { render, screen } from '@testing-library/react-native'

import StreamPlot, { StreamPlotProps } from '../../../ui/components/StreamPlot'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class StreamPlotTest extends AbstractPackageTest {
    private static readonly plotName = this.generateId()

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
    protected static async drawsLineForEachChannel() {
        await this.render({
            samples: [1, 10, 2, 20, 3, 30],
            timestamps: [0, 1, 2],
        })

        assert.isEqual(
            screen.queryAllByTestId(/-channel-/).length,
            2,
            'Did not draw a line for each channel!'
        )
    }

    @test()
    protected static async drawsLatestSampleAtRightEdge() {
        await this.render({
            samples: [0, 5, 10],
            timestamps: [4, 5, 6],
            width: 100,
            height: 50,
        })

        assert.isEqual(
            this.pathForChannel(0),
            'M80,50L90,25L100,0',
            'Did not draw latest sample at right edge!'
        )
    }

    @test()
    protected static async scalesTimeByWindowSeconds() {
        await this.render({
            samples: [0, 5, 10],
            timestamps: [4, 5, 6],
            width: 100,
            height: 50,
            windowSeconds: 2,
        })

        assert.isEqual(
            this.pathForChannel(0),
            'M0,50L50,25L100,0',
            'Did not scale time by windowSeconds!'
        )
    }

    @test()
    protected static async translatesLineLeftAsDataArrives() {
        const size = { width: 100, height: 50 }

        const { rerender } = await this.render({
            samples: [0, 10],
            timestamps: [0, 1],
            ...size,
        })

        const before = this.pathForChannel(0)

        await rerender(
            <StreamPlot
                name={this.plotName}
                samples={[0, 10, 0]}
                timestamps={[0, 1, 2]}
                {...size}
            />
        )

        assert.isEqualDeep(
            { before, after: this.pathForChannel(0) },
            { before: 'M90,50L100,0', after: 'M80,50L90,0L100,50' },
            'Did not translate line left as data arrived!'
        )
    }

    @test()
    protected static async drawsRelativeToNowTimestamp() {
        await this.render({
            samples: [0, 10],
            timestamps: [4, 5],
            width: 100,
            height: 50,
            nowTimestamp: 7,
        })

        assert.isEqual(
            this.pathForChannel(0),
            'M70,50L80,0',
            'Did not draw relative to nowTimestamp!'
        )
    }

    @test()
    protected static async drawsFlatSignalThroughMiddle() {
        await this.render({
            samples: [7, 7],
            timestamps: [0, 1],
            width: 100,
            height: 50,
            windowSeconds: 1,
        })

        assert.isEqual(
            this.pathForChannel(0),
            'M0,25L100,25',
            'Did not draw flat signal through middle!'
        )
    }

    private static pathForChannel(channel: number) {
        return screen.getByTestId(
            `stream-plot-${this.plotName}-channel-${channel}`
        ).props.d
    }

    private static async render(props?: Partial<StreamPlotProps>) {
        return await render(<StreamPlot name={this.plotName} {...props} />)
    }
}
