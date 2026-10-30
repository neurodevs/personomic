import { test, assert } from '@neurodevs/node-tdd'

import displayNameOf from '../../functions/displayNameOf'
import AbstractPackageTest from '../AbstractPackageTest'

export default class DisplayNameOfTest extends AbstractPackageTest {
    @test()
    protected static async showsZephyrBioHarnessAsVersion3Point0() {
        assert.isEqual(
            displayNameOf('Zephyr BioHarness 3'),
            'Zephyr BioHarness 3.0',
            'Did not show Zephyr BioHarness as version 3.0!'
        )
    }

    @test()
    protected static async keepsRepeatNumberAfterDisplayName() {
        assert.isEqual(
            displayNameOf('Zephyr BioHarness 3 #2'),
            'Zephyr BioHarness 3.0 #2',
            'Did not keep repeat number after display name!'
        )
    }

    @test()
    protected static async showsOtherDevicesByTheirName() {
        assert.isEqual(
            displayNameOf('Muse S Athena'),
            'Muse S Athena',
            'Did not show other devices by their name!'
        )
    }
}
