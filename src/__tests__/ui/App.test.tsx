import { test, assert } from '@neurodevs/node-tdd'
import { render } from '@testing-library/react'
import React from 'react'

import FakeStreamMonitor, {
    lastStreamMonitorProps,
} from '../../testDoubles/StreamMonitor/FakeStreamMonitor'
import App, { setStreamMonitorComponent } from '../../ui/App'
import AbstractPackageTest from '../AbstractPackageTest'

export default class AppTest extends AbstractPackageTest {
    private static element: React.ReactElement

    protected static async beforeEach() {
        await super.beforeEach()

        setStreamMonitorComponent(FakeStreamMonitor)

        this.element = this.renderApp()
    }

    @test()
    protected static async canCreateApp() {
        assert.isTruthy(this.element, 'App instance should be created!')
    }

    @test()
    protected static async passesDownsamplingToMonitor() {
        render(<App downsampling="medium" />)

        assert.isEqual(
            lastStreamMonitorProps?.downsampling,
            'medium',
            'Did not pass downsampling to monitor!'
        )
    }

    @test()
    protected static async monitorsEegAndPpgOfMuseDevice() {
        render(<App />)

        assert.isEqualDeep(
            lastStreamMonitorProps?.devices.map((device) => ({
                name: device.name,
                streams: device.streams.map((stream) => stream.name),
            })),
            [{ name: 'Muse S Gen 2', streams: ['EEG', 'PPG'] }],
            'Did not monitor EEG and PPG of Muse device!'
        )
    }

    private static renderApp() {
        return <App />
    }
}
