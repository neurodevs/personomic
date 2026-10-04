import { test, assert } from '@neurodevs/node-tdd'
import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import FakeStreamMonitor, {
    lastStreamMonitorProps,
} from '../../testDoubles/StreamMonitor/FakeStreamMonitor'
import FakeWebSocket from '../../testDoubles/WebSocket/FakeWebSocket'
import App, { setStreamMonitorComponent } from '../../ui/App'
import { setWebSocketComponent } from '../../ui/components/StreamMonitor'
import AbstractPackageTest from '../AbstractPackageTest'

export default class AppTest extends AbstractPackageTest {
    private static element: React.ReactElement

    protected static async beforeEach() {
        await super.beforeEach()

        setStreamMonitorComponent(FakeStreamMonitor)
        setWebSocketComponent(FakeWebSocket as any)
        FakeWebSocket.resetTestDouble()

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
    protected static async monitorsMuseDeviceByDefault() {
        render(<App />)

        assert.isEqualDeep(
            lastStreamMonitorProps?.deviceNames,
            ['Muse S Gen 2'],
            'Did not monitor Muse device by default!'
        )
    }

    @test()
    protected static async detectsPeaksOnAmbientAndInfraredPpg() {
        render(<App />)

        assert.isEqualDeep(
            lastStreamMonitorProps?.streamOptions?.PPG?.detectPeaks,
            { channels: ['AMBIENT', 'INFRARED'] },
            'Did not detect peaks on ambient and infrared PPG!'
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
    protected static async monitorsChosenBiosensor() {
        render(<App />)

        this.addBiosensor('OpenBCI Cyton')

        assert.isEqualDeep(
            lastStreamMonitorProps?.deviceNames,
            ['Muse S Gen 2', 'OpenBCI Cyton'],
            'Did not monitor chosen biosensor!'
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
            lastStreamMonitorProps?.deviceNames,
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

    @test()
    protected static async passesTypedUuidBackToMonitor() {
        render(<App />)

        this.typeUuid('Muse S Gen 2', 'typed-uuid')

        assert.isEqualDeep(
            lastStreamMonitorProps?.uuids,
            { 'Muse S Gen 2': 'typed-uuid' },
            'Did not pass typed UUID back to monitor!'
        )
    }

    @test()
    protected static async placesConnectButtonBelowAddBiosensorButton() {
        render(<App />)

        const addButton = screen.getByRole('button', { name: /add biosensor/i })

        assert.isTrue(
            Boolean(
                addButton.compareDocumentPosition(this.connectButton) &
                Node.DOCUMENT_POSITION_FOLLOWING
            ),
            'Did not place connect button below add biosensor button!'
        )
    }

    @test()
    protected static async connectsToOrchestratorOnConnect() {
        render(<App />)

        this.clickConnect()

        assert.isEqualDeep(
            FakeWebSocket.callsToConstructor,
            ['ws://localhost:8763'],
            'Did not connect to orchestrator on connect!'
        )
    }

    @test()
    protected static async startsOrchestratorWithSelectedDevicesAndUuids() {
        render(<App />)

        this.addBiosensor('OpenBCI Cyton')
        this.typeUuid('Muse S Gen 2', ' muse-uuid ')
        this.typeUuid('OpenBCI Cyton', '   ')

        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            FakeWebSocket.callsToSend.map(({ data }) =>
                JSON.parse(data as string)
            ),
            [
                {
                    command: 'start',
                    devices: [
                        { deviceName: 'Muse S Gen 2', uuid: 'muse-uuid' },
                        { deviceName: 'OpenBCI Cyton' },
                    ],
                },
            ],
            'Did not start orchestrator with selected devices and UUIDs!'
        )
    }

    @test()
    protected static async showsConnectingUntilOrchestratorReplies() {
        render(<App />)

        this.clickConnect()
        const whileWaiting = this.connectButtonState

        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            [whileWaiting, this.connectButtonState],
            [
                { text: 'Connecting…', isDisabled: true },
                { text: 'Connect', isDisabled: false },
            ],
            'Did not show connecting until orchestrator replied!'
        )
    }

    @test()
    protected static async tellsMonitorItIsConnectingUntilOrchestratorReplies() {
        render(<App />)

        const beforeClick = lastStreamMonitorProps?.isConnecting
        this.clickConnect()
        const whileWaiting = lastStreamMonitorProps?.isConnecting

        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            [beforeClick, whileWaiting, lastStreamMonitorProps?.isConnecting],
            [false, true, false],
            'Did not tell monitor it is connecting until orchestrator replied!'
        )
    }

    @test()
    protected static async closesOrchestratorSocketAfterReplyWithoutError() {
        render(<App />)

        this.clickConnect()
        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            {
                numCallsToClose: FakeWebSocket.numCallsToClose,
                error: screen.queryByRole('alert'),
            },
            { numCallsToClose: 1, error: null },
            'Did not close orchestrator socket after reply without error!'
        )
    }

    @test()
    protected static async showsErrorFromOrchestrator() {
        render(<App />)

        this.clickConnect()
        act(() => this.orchestratorSocket.receive({ error: 'No Muse found' }))

        assert.isEqual(
            screen.getByRole('alert').textContent,
            'No Muse found',
            'Did not show error from orchestrator!'
        )
    }

    @test()
    protected static async showsHowToStartOrchestratorWhenUnreachable() {
        render(<App />)

        this.clickConnect()
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqualDeep(
            {
                error: screen.getByRole('alert').textContent,
                button: this.connectButtonState,
            },
            {
                error: 'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.',
                button: { text: 'Connect', isDisabled: false },
            },
            'Did not show how to start orchestrator when unreachable!'
        )
    }

    @test()
    protected static async clearsErrorWhenConnectingAgain() {
        render(<App />)

        this.clickConnect()
        act(() => this.orchestratorSocket.dropConnection())
        this.clickConnect()

        assert.isEqual(
            screen.queryByRole('alert'),
            null,
            'Did not clear error when connecting again!'
        )
    }

    @test()
    protected static async disablesConnectWithoutDevices() {
        render(<App />)

        this.removeDevice('Muse S Gen 2')

        assert.isTrue(
            this.connectButtonState.isDisabled,
            'Did not disable connect without devices!'
        )
    }

    private static typeUuid(name: string, uuid: string) {
        act(() => lastStreamMonitorProps?.onUuidChange?.(name, uuid))
    }

    private static clickConnect() {
        fireEvent.click(this.connectButton)
    }

    private static get connectButton() {
        return screen.getByRole('button', { name: /^Connect/ })
    }

    private static get connectButtonState() {
        const button = this.connectButton as HTMLButtonElement
        return { text: button.textContent, isDisabled: button.disabled }
    }

    private static get orchestratorSocket() {
        return FakeWebSocket.instances.at(-1)!
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
