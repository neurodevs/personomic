import { test, assert } from '@neurodevs/node-tdd'
import { render, screen } from '@testing-library/react-native'

import StreamPlot from '../../../ui/components/StreamPlot'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class StreamPlotTest extends AbstractPackageTest {
    private static readonly plotName = this.generateId()

    protected static async beforeEach() {
        await super.beforeEach()

        await render(<StreamPlot name={this.plotName} />)
    }

    @test()
    protected static async rendersTopLevelView() {
        assert.isTruthy(
            screen.getByTestId(`stream-plot-${this.plotName}`),
            'Failed to render top-level view!'
        )
    }

    @test()
    protected static async rendersName() {
        assert.isTruthy(
            screen.getByText(this.plotName),
            'Failed to render plot name!'
        )
    }
}
