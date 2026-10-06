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
    protected static async monitorsNoDevicesByDefault() {
        render(<App />)

        assert.isEqualDeep(
            lastStreamMonitorProps?.deviceNames,
            [],
            'Did not monitor no devices by default!'
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
            ['OpenBCI Cyton'],
            'Did not monitor chosen biosensor!'
        )
    }

    @test()
    protected static async offersEveryBiosensorAtFirst() {
        render(<App />)

        this.openBiosensorMenu()

        assert.isEqualDeep(
            this.offeredBiosensors,
            [...DEVICE_NAMES],
            'Did not offer every biosensor at first!'
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
        this.renderWithMuse()

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
        this.renderWithMuse()

        this.removeDevice('Muse S Gen 2')
        this.openBiosensorMenu()

        assert.isTrue(
            this.offeredBiosensors.includes('Muse S Gen 2'),
            'Did not offer removed biosensor again!'
        )
    }

    @test()
    protected static async removesDeviceWithoutContactingOrchestrator() {
        this.renderWithMuse()

        this.removeDevice('Muse S Gen 2')

        assert.isLength(
            FakeWebSocket.callsToConstructor,
            0,
            'Contacted orchestrator when removing a device!'
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
    protected static async passesTypedIdentifierBackToMonitor() {
        this.renderWithMuse()

        this.typeIdentifier('Muse S Gen 2', 'typed-uuid')

        assert.isEqualDeep(
            lastStreamMonitorProps?.identifiers,
            { 'Muse S Gen 2': { label: 'UUID', value: 'typed-uuid' } },
            'Did not pass typed identifier back to monitor!'
        )
    }

    @test()
    protected static async offersIdentifierLabelledForEachDeviceThatTakesOne() {
        render(<App />)

        DEVICE_NAMES.forEach((name) => this.addBiosensor(name))

        assert.isEqualDeep(
            Object.fromEntries(
                Object.entries(lastStreamMonitorProps?.identifiers ?? {}).map(
                    ([name, identifier]) => [name, identifier.label]
                )
            ),
            {
                'Cognionics Quick-20r': 'Serial number',
                'Govee Thermohygrometer H5074': 'UUID',
                'Muse S Athena': 'UUID',
                'Muse S Gen 2': 'UUID',
                'Muse S Gen 1': 'UUID',
                'Muse 2': 'UUID',
                'Muse 1 Gen 2': 'UUID',
                'OpenBCI Cyton': 'Serial number',
            },
            'Did not offer a labelled identifier for each device that takes one!'
        )
    }

    @test()
    protected static async sendsNoIdentifierForDeviceThatDoesNotTakeOne() {
        render(<App />)

        this.addBiosensor('Zephyr BioHarness 3')
        this.typeIdentifier('Zephyr BioHarness 3', 'typed-anyway')

        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            JSON.parse(FakeWebSocket.callsToSend[0]?.data as string).devices,
            [{ deviceName: 'Zephyr BioHarness 3' }],
            'Sent an identifier for a device that does not take one!'
        )
    }

    @test()
    protected static async sendsTypedSerialNumberAsIdentifier() {
        render(<App />)

        this.addBiosensor('OpenBCI Cyton')
        this.typeIdentifier('OpenBCI Cyton', 'AR4K581H')

        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            JSON.parse(FakeWebSocket.callsToSend[0]?.data as string).devices,
            [{ deviceName: 'OpenBCI Cyton', identifier: 'AR4K581H' }],
            'Did not send typed serial number as identifier!'
        )
    }

    @test()
    protected static async placesConnectButtonBelowAddBiosensorButton() {
        render(<App />)

        const addButton = screen.getByRole('button', { name: /add biosensor/i })

        assert.isTrue(
            Boolean(
                addButton.compareDocumentPosition(this.sessionButton) &
                Node.DOCUMENT_POSITION_FOLLOWING
            ),
            'Did not place connect button below add biosensor button!'
        )
    }

    @test()
    protected static async connectsToOrchestratorOnConnect() {
        this.renderWithMuse()

        this.clickConnect()

        assert.isEqualDeep(
            FakeWebSocket.callsToConstructor,
            ['ws://localhost:8763'],
            'Did not connect to orchestrator on connect!'
        )
    }

    @test()
    protected static async startsOrchestratorWithSelectedDevicesAndIdentifiers() {
        this.renderWithMuse()

        this.addBiosensor('OpenBCI Cyton')
        this.typeIdentifier('Muse S Gen 2', ' muse-uuid ')
        this.typeIdentifier('OpenBCI Cyton', '   ')

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
                        { deviceName: 'Muse S Gen 2', identifier: 'muse-uuid' },
                        { deviceName: 'OpenBCI Cyton' },
                    ],
                },
            ],
            'Did not start orchestrator with selected devices and identifiers!'
        )
    }

    @test()
    protected static async showsConnectingUntilOrchestratorReplies() {
        this.renderWithMuse()

        this.clickConnect()
        const whileWaiting = this.sessionButtonState

        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            [whileWaiting, this.sessionButtonState],
            [
                { text: 'Connecting…', isDisabled: true },
                { text: 'Stop', isDisabled: false },
            ],
            'Did not show connecting until orchestrator replied!'
        )
    }

    @test()
    protected static async tellsMonitorItIsConnectingUntilOrchestratorReplies() {
        this.renderWithMuse()

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
        this.renderWithMuse()

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
        this.renderWithMuse()

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
        this.renderWithMuse()

        this.clickConnect()
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqualDeep(
            {
                error: screen.getByRole('alert').textContent,
                button: this.sessionButtonState,
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
        this.renderWithMuse()

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
    protected static async startsUnlocked() {
        this.renderWithMuse()

        assert.isEqualDeep(
            this.lockState,
            {
                isLocked: false,
                isAddBiosensorButtonShown: true,
                button: { text: 'Connect', isDisabled: false },
            },
            'Did not start unlocked!'
        )
    }

    @test()
    protected static async locksProtocolAsSoonAsConnectIsClicked() {
        this.renderWithMuse()

        this.clickConnect()

        assert.isEqualDeep(
            this.lockState,
            {
                isLocked: true,
                isAddBiosensorButtonShown: false,
                button: { text: 'Connecting…', isDisabled: true },
            },
            'Did not lock protocol as soon as connect was clicked!'
        )
    }

    @test()
    protected static async staysLockedWithStopWhenConnectingFails() {
        this.renderWithMuse()

        this.clickConnect()
        act(() => this.orchestratorSocket.receive({ error: 'No Muse found' }))

        assert.isEqualDeep(
            this.lockState,
            {
                isLocked: true,
                isAddBiosensorButtonShown: false,
                button: { text: 'Stop', isDisabled: false },
            },
            'Did not stay locked with stop when connecting failed!'
        )
    }

    @test()
    protected static async unlocksWhenOrchestratorIsUnreachableOnConnect() {
        this.renderWithMuse()

        this.clickConnect()
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqualDeep(
            this.lockState,
            {
                isLocked: false,
                isAddBiosensorButtonShown: true,
                button: { text: 'Connect', isDisabled: false },
            },
            'Did not unlock when orchestrator was unreachable on connect!'
        )
    }

    @test()
    protected static async stopsOrchestratorWhenStopIsClicked() {
        this.renderWithMuse()

        this.connect()
        this.clickStop()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            JSON.parse(FakeWebSocket.callsToSend.at(-1)?.data as string),
            { command: 'stop' },
            'Did not stop orchestrator when stop was clicked!'
        )
    }

    @test()
    protected static async staysLockedWhileStopping() {
        this.renderWithMuse()

        this.connect()
        this.clickStop()

        assert.isEqualDeep(
            this.lockState,
            {
                isLocked: true,
                isAddBiosensorButtonShown: false,
                button: { text: 'Stopping…', isDisabled: true },
            },
            'Did not stay locked while stopping!'
        )
    }

    @test()
    protected static async unlocksOnceOrchestratorHasStopped() {
        this.renderWithMuse()

        this.connect()
        this.clickStop()
        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            this.lockState,
            {
                isLocked: false,
                isAddBiosensorButtonShown: true,
                button: { text: 'Connect', isDisabled: false },
            },
            'Did not unlock once orchestrator had stopped!'
        )
    }

    @test()
    protected static async staysLockedAndShowsErrorWhenStoppingFails() {
        this.renderWithMuse()

        this.connect()
        this.clickStop()
        act(() => this.orchestratorSocket.receive({ error: 'Still busy' }))

        assert.isEqualDeep(
            {
                isLocked: this.isMonitorLocked,
                button: this.sessionButtonState,
                error: screen.getByRole('alert').textContent,
            },
            {
                isLocked: true,
                button: { text: 'Stop', isDisabled: false },
                error: 'Still busy',
            },
            'Did not stay locked and show error when stopping failed!'
        )
    }

    @test()
    protected static async unlocksWhenOrchestratorIsUnreachableOnStop() {
        this.renderWithMuse()

        this.connect()
        this.clickStop()
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqualDeep(
            {
                isLocked: this.isMonitorLocked,
                error: screen.getByRole('alert').textContent,
            },
            {
                isLocked: false,
                error: 'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.',
            },
            'Did not unlock when orchestrator was unreachable on stop!'
        )
    }

    @test()
    protected static async disablesConnectWithoutDevices() {
        render(<App />)

        assert.isEqualDeep(
            this.sessionButtonState,
            { text: 'Connect', isDisabled: true },
            'Did not disable connect without devices!'
        )
    }

    @test()
    protected static async disablesConnectAgainOnceLastDeviceIsRemoved() {
        this.renderWithMuse()

        this.removeDevice('Muse S Gen 2')

        assert.isTrue(
            this.sessionButtonState.isDisabled,
            'Did not disable connect again once last device was removed!'
        )
    }

    private static renderWithMuse() {
        render(<App />)
        this.addBiosensor('Muse S Gen 2')
    }

    private static typeIdentifier(name: string, value: string) {
        act(() => lastStreamMonitorProps?.onIdentifierChange?.(name, value))
    }

    private static clickConnect() {
        fireEvent.click(this.sessionButton)
    }

    private static connect() {
        this.clickConnect()
        act(() => this.orchestratorSocket.receive({}))
    }

    private static clickStop() {
        fireEvent.click(this.sessionButton)
    }

    private static get isAddBiosensorButtonShown() {
        return screen.queryByRole('button', { name: /add biosensor/i }) !== null
    }

    private static get isMonitorLocked() {
        return (
            lastStreamMonitorProps?.onIdentifierChange === undefined &&
            lastStreamMonitorProps?.onRemoveDevice === undefined
        )
    }

    private static get lockState() {
        return {
            isLocked: this.isMonitorLocked,
            isAddBiosensorButtonShown: this.isAddBiosensorButtonShown,
            button: this.sessionButtonState,
        }
    }

    private static get sessionButton() {
        return screen.getByRole('button', { name: /^(Connect|Stop)/ })
    }

    private static get sessionButtonState() {
        const button = this.sessionButton as HTMLButtonElement
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
