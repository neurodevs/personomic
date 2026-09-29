import PpgPeakDetector from '@neurodevs/node-biosignal-processing/build/impl/PpgPeakDetector.js'
import AbstractModuleTest from '@neurodevs/node-tdd'

import FakePpgDetector from '../testDoubles/PpgDetector/FakePpgDetector'
import FakeResizeObserver from '../testDoubles/ResizeObserver/FakeResizeObserver'
import { setResizeObserverComponent } from '../ui/components/StreamPlot'

export default class AbstractPackageTest extends AbstractModuleTest {
    protected static async beforeEach() {
        await super.beforeEach()

        setResizeObserverComponent(FakeResizeObserver as any)
        FakeResizeObserver.resetTestDouble()

        PpgPeakDetector.Class = FakePpgDetector
        FakePpgDetector.resetTestDouble()
    }
}
