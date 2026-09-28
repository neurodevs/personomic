import AbstractModuleTest from '@neurodevs/node-tdd'

import FakeResizeObserver from '../testDoubles/ResizeObserver/FakeResizeObserver'
import { setResizeObserverComponent } from '../ui/components/StreamPlot'

export default class AbstractPackageTest extends AbstractModuleTest {
    protected static async beforeEach() {
        await super.beforeEach()

        setResizeObserverComponent(FakeResizeObserver as any)
        FakeResizeObserver.resetTestDouble()
    }
}
