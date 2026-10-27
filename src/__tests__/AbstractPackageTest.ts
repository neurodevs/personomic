import {
    TextDecoder as NodeTextDecoder,
    TextEncoder as NodeTextEncoder,
} from 'node:util'

import PpgPeakDetector from '@neurodevs/node-biosignal-processing/build/impl/PpgPeakDetector.js'
import AbstractModuleTest from '@neurodevs/node-tdd'

import { setSpeaker } from '../functions/cueSpeaker'
import FakePpgDetector from '../testDoubles/PpgDetector/FakePpgDetector'
import FakeResizeObserver from '../testDoubles/ResizeObserver/FakeResizeObserver'
import FakeSpeaker from '../testDoubles/Speaker/FakeSpeaker'
import { setResizeObserverComponent } from '../ui/components/StreamPlot'

export default class AbstractPackageTest extends AbstractModuleTest {
    static {
        this.giveJsdomTheTextCodingBrowsersHave()
        this.giveJsdomTheBlobReadingBrowsersHave()
    }

    protected static async beforeEach() {
        await super.beforeEach()

        setResizeObserverComponent(FakeResizeObserver as any)
        FakeResizeObserver.resetTestDouble()

        PpgPeakDetector.Class = FakePpgDetector
        FakePpgDetector.resetTestDouble()

        setSpeaker(FakeSpeaker)
        FakeSpeaker.resetTestDouble()
    }

    private static giveJsdomTheTextCodingBrowsersHave() {
        globalThis.TextDecoder ??= NodeTextDecoder as typeof TextDecoder
        globalThis.TextEncoder ??= NodeTextEncoder as typeof TextEncoder
    }

    private static giveJsdomTheBlobReadingBrowsersHave() {
        Blob.prototype.arrayBuffer ??= function (this: Blob) {
            return new Promise<ArrayBuffer>((resolve) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as ArrayBuffer)
                reader.readAsArrayBuffer(this)
            })
        }
    }
}
