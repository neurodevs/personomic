import { test, assert } from '@neurodevs/node-tdd'
import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

    @test()
    protected static async watchesGatewayDeviceStatusPort() {
        render(<App />)

        assert.isEqual(
            lastStreamMonitorProps?.deviceStatusPort,
            8764,
            'Did not watch gateway device status port!'
        )
    }

    @test()
    protected static async addsChosenBiosensorAsDeviceWithoutStreams() {
        render(<App />)

        this.addBiosensor('OpenBCI Cyton')

        assert.isEqualDeep(
            lastStreamMonitorProps?.devices.at(-1),
            { name: 'OpenBCI Cyton', streams: [] },
            'Did not add chosen biosensor as device without streams!'
        )
    }

    @test()
    protected static async offersEveryBiosensorNotAlreadyShown() {
        render(<App />)

        this.openBiosensorMenu()

        assert.isEqualDeep(
            this.offeredBiosensors,
            DEVICE_NAMES.filter((name) => name !== 'Muse S Gen 2'),
            'Did not offer every biosensor not already shown!'
        )
    }

    @test()
    protected static async stopsOfferingBiosensorOnceAdded() {
        render(<App />)

        this.addBiosensor('OpenBCI Cyton')
        this.openBiosensorMenu()

        assert.isFalse(
            this.offeredBiosensors.includes('OpenBCI Cyton'),
            'Kept offering biosensor after adding it!'
        )
    }

    @test()
    protected static async removesDeviceFromMonitor() {
        render(<App />)

        this.addBiosensor('OpenBCI Cyton')
        this.removeDevice('Muse S Gen 2')

        assert.isEqualDeep(
            lastStreamMonitorProps?.devices.map((device) => device.name),
            ['OpenBCI Cyton'],
            'Did not remove device from monitor!'
        )
    }

    @test()
    protected static async offersRemovedBiosensorAgain() {
        render(<App />)

        this.removeDevice('Muse S Gen 2')
        this.openBiosensorMenu()

        assert.isTrue(
            this.offeredBiosensors.includes('Muse S Gen 2'),
            'Did not offer removed biosensor again!'
        )
    }

    @test()
    protected static async placesAddBiosensorButtonBelowDevices() {
        render(<App />)

        const monitor = screen.getByTestId('fake-stream-monitor')
        const button = screen.getByRole('button', { name: /add biosensor/i })

        assert.isTrue(
            Boolean(
                monitor.compareDocumentPosition(button) &
                Node.DOCUMENT_POSITION_FOLLOWING
            ),
            'Did not place add biosensor button below devices!'
        )
    }

    private static addBiosensor(name: string) {
        this.openBiosensorMenu()
        fireEvent.click(screen.getByRole('menuitem', { name }))
    }

    private static removeDevice(name: string) {
        act(() => lastStreamMonitorProps?.onRemoveDevice?.(name))
    }

    private static openBiosensorMenu() {
        fireEvent.click(screen.getByRole('button', { name: /add biosensor/i }))
    }

    private static get offeredBiosensors() {
        return screen
            .queryAllByRole('menuitem')
            .map((option) => option.textContent)
    }

    private static renderApp() {
        return <App />
    }
}
