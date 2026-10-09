import { test, assert } from '@neurodevs/node-tdd'
import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import FakeStreamMonitor, {
    lastStreamMonitorProps,
    numStreamMonitorMounts,
} from '../../testDoubles/StreamMonitor/FakeStreamMonitor'
import FakeWebSocket from '../../testDoubles/WebSocket/FakeWebSocket'
import App, {
    setEverySecond,
    setNow,
    setStreamMonitorComponent,
} from '../../ui/App'
import { setWebSocketComponent } from '../../ui/components/StreamMonitor'
import AbstractPackageTest from '../AbstractPackageTest'

export default class AppTest extends AbstractPackageTest {
    private static element: React.ReactElement
    private static secondCallbacks: Set<() => void>

    protected static async beforeEach() {
        await super.beforeEach()

        setStreamMonitorComponent(FakeStreamMonitor)
        setWebSocketComponent(FakeWebSocket as any)
        FakeWebSocket.resetTestDouble()

        setNow(() => new Date(2026, 9, 7, 14, 32, 5))

        this.secondCallbacks = new Set()
        setEverySecond((callback) => {
            this.secondCallbacks.add(callback)
            return () => this.secondCallbacks.delete(callback)
        })

        localStorage.clear()

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
            lastStreamMonitorProps?.streamOptions?.PPG?.detectPeaks?.channels,
            ['AMBIENT', 'INFRARED'],
            'Did not detect peaks on ambient and infrared PPG!'
        )
    }

    @test()
    protected static async derivesHeartRateFromThirtySecondsOfPpg() {
        render(<App />)

        assert.isEqual(
            lastStreamMonitorProps?.streamOptions?.PPG?.detectPeaks
                ?.heartRateWindowSeconds,
            30,
            'Did not derive heart rate from thirty seconds of PPG!'
        )
    }

    @test()
    protected static async derivesHrvFromFiveMinutesOfPpg() {
        render(<App />)

        assert.isEqual(
            lastStreamMonitorProps?.streamOptions?.PPG?.detectPeaks
                ?.hrvWindowSeconds,
            300,
            'Did not derive HRV from five minutes of PPG!'
        )
    }

    @test()
    protected static async showsProvisionalHrvAfterThirtySecondsOfPpg() {
        render(<App />)

        assert.isEqual(
            lastStreamMonitorProps?.streamOptions?.PPG?.detectPeaks
                ?.hrvProvisionalAfterSeconds,
            30,
            'Did not show provisional HRV after thirty seconds of PPG!'
        )
    }

    @test()
    protected static async derivesBandPowersFromFourSecondsOfEeg() {
        render(<App />)

        assert.isEqual(
            lastStreamMonitorProps?.streamOptions?.EEG?.bandPowers
                ?.windowSeconds,
            4,
            'Did not derive band powers from four seconds of EEG!'
        )
    }

    @test('shows latest temperature in celsius', 'Temperature', '°C')
    @test('shows latest humidity in percent', 'Humidity', '%')
    @test('shows latest battery in percent', 'Battery', '%')
    protected static async showsLatestValueOfIntermittentStreamWithUnits(
        streamType: string,
        units: string
    ) {
        render(<App />)

        assert.isEqual(
            lastStreamMonitorProps?.streamOptions?.[streamType]?.units,
            units,
            `Did not show latest ${streamType} with units!`
        )
    }

    @test('limits battery between zero and hundred', 'Battery')
    @test('limits humidity between zero and hundred', 'Humidity')
    protected static async limitsPercentageStreamBetweenZeroAndHundred(
        streamType: string
    ) {
        render(<App />)

        assert.isEqualDeep(
            lastStreamMonitorProps?.streamOptions?.[streamType]?.yLimits,
            { min: 0, max: 100 },
            `Did not limit ${streamType} between zero and hundred!`
        )
    }

    @test()
    protected static async showsLastTwoMinutesOfOnlyGoveeByDefault() {
        render(<App />)

        assert.isEqualDeep(
            lastStreamMonitorProps?.windowSecondsByDevice,
            { 'Govee Thermohygrometer H5074': 120 },
            'Did not show last two minutes of only Govee by default!'
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

        this.addBiosensor('Zephyr BioHarness 3')
        this.openBiosensorMenu()

        assert.isFalse(
            this.offeredBiosensors.includes('Zephyr BioHarness 3'),
            'Kept offering biosensor after adding it!'
        )
    }

    @test()
    protected static async keepsOfferingBiosensorThatTakesAnIdentifier() {
        this.renderWithMuse()

        this.openBiosensorMenu()

        assert.isTrue(
            this.offeredBiosensors.includes('Muse S Gen 2'),
            'Did not keep offering biosensor that takes an identifier!'
        )
    }

    @test()
    protected static async monitorsSameBiosensorMoreThanOnce() {
        this.renderWithTwoMuses()

        assert.isEqualDeep(
            lastStreamMonitorProps?.deviceNames,
            ['Muse S Gen 2', 'Muse S Gen 2'],
            'Did not monitor same biosensor more than once!'
        )
    }

    @test()
    protected static async keepsIdentifierOfEachRepeatSeparate() {
        this.renderWithTwoMuses()

        this.typeIdentifier('Muse S Gen 2', 'first-uuid')
        this.typeIdentifier('Muse S Gen 2 #2', 'second-uuid')

        assert.isEqualDeep(
            lastStreamMonitorProps?.identifiers,
            {
                'Muse S Gen 2': { label: 'UUID', value: 'first-uuid' },
                'Muse S Gen 2 #2': { label: 'UUID', value: 'second-uuid' },
            },
            'Did not keep identifier of each repeat separate!'
        )
    }

    @test()
    protected static async removesOnlyTheRepeatThatWasChosen() {
        this.renderWithTwoMuses()

        this.typeIdentifier('Muse S Gen 2', 'first-uuid')
        this.typeIdentifier('Muse S Gen 2 #2', 'second-uuid')
        this.removeDevice('Muse S Gen 2')

        assert.isEqualDeep(
            lastStreamMonitorProps?.identifiers,
            { 'Muse S Gen 2': { label: 'UUID', value: 'second-uuid' } },
            'Did not remove only the repeat that was chosen!'
        )
    }

    @test()
    protected static async startsEachRepeatWithItsOwnIdentifier() {
        this.renderWithTwoMuses()

        this.typeIdentifier('Muse S Gen 2', 'first-uuid')
        this.typeIdentifier('Muse S Gen 2 #2', 'second-uuid')
        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage.devices,
            [
                { deviceName: 'Muse S Gen 2', identifier: 'first-uuid' },
                { deviceName: 'Muse S Gen 2', identifier: 'second-uuid' },
            ],
            'Did not start each repeat with its own identifier!'
        )
    }

    @test()
    protected static async refusesToConnectRepeatsWithoutIdentifiers() {
        this.renderWithTwoMuses()

        this.typeIdentifier('Muse S Gen 2', 'first-uuid')
        this.assertRefusesToConnectRepeats()
    }

    @test()
    protected static async refusesToConnectRepeatsSharingAnIdentifier() {
        this.renderWithTwoMuses()

        this.typeIdentifier('Muse S Gen 2', 'same-uuid')
        this.typeIdentifier('Muse S Gen 2 #2', ' same-uuid ')
        this.assertRefusesToConnectRepeats()
    }

    @test()
    protected static async refusesToConnectDifferentMusesWithoutIdentifiers() {
        this.renderWithTwoDifferentMuses()

        this.assertRefusesToConnectRepeats()
    }

    @test()
    protected static async refusesToConnectDifferentMusesWhenOnlyOneHasIdentifier() {
        this.renderWithTwoDifferentMuses()

        this.typeIdentifier('Muse 2', 'second-uuid')
        this.assertRefusesToConnectRepeats()
    }

    @test()
    protected static async refusesToConnectDifferentMusesSharingAnIdentifier() {
        this.renderWithTwoDifferentMuses()

        this.typeIdentifier('Muse S Gen 2', 'same-uuid')
        this.typeIdentifier('Muse 2', 'same-uuid')
        this.assertRefusesToConnectRepeats()
    }

    @test()
    protected static async connectsDifferentMusesThatEachHaveTheirOwnIdentifier() {
        this.renderWithTwoDifferentMuses()

        this.typeIdentifier('Muse S Gen 2', 'first-uuid')
        this.typeIdentifier('Muse 2', 'second-uuid')
        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage.devices,
            [
                { deviceName: 'Muse S Gen 2', identifier: 'first-uuid' },
                { deviceName: 'Muse 2', identifier: 'second-uuid' },
            ],
            'Did not connect different Muses that each had their own identifier!'
        )
    }

    @test()
    protected static async connectsOneMuseBesideAnotherKindWithoutIdentifiers() {
        this.renderWithMuse()
        this.addBiosensor('OpenBCI Cyton')

        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage.devices,
            [{ deviceName: 'Muse S Gen 2' }, { deviceName: 'OpenBCI Cyton' }],
            'Did not connect one Muse beside another kind without identifiers!'
        )
    }

    @test()
    protected static async restoresRepeatsOfSessionRunningOnLoad() {
        render(<App />)

        act(() =>
            this.orchestratorSocket.receive({
                devices: [
                    { deviceName: 'Muse S Gen 2', identifier: 'first-uuid' },
                    { deviceName: 'Muse S Gen 2', identifier: 'second-uuid' },
                ],
            })
        )

        assert.isEqualDeep(
            lastStreamMonitorProps?.identifiers,
            {
                'Muse S Gen 2': { label: 'UUID', value: 'first-uuid' },
                'Muse S Gen 2 #2': { label: 'UUID', value: 'second-uuid' },
            },
            'Did not restore repeats of session running on load!'
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

        const numContactsBefore = FakeWebSocket.callsToConstructor.length
        this.removeDevice('Muse S Gen 2')

        assert.isLength(
            FakeWebSocket.callsToConstructor,
            numContactsBefore,
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

        FakeWebSocket.resetTestDouble()
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
    protected static async unlocksWithConnectWhenConnectingFails() {
        this.renderWithMuse()

        this.clickConnect()
        act(() => this.orchestratorSocket.receive({ error: 'No Muse found' }))

        assert.isEqualDeep(
            this.lockState,
            {
                isLocked: false,
                isAddBiosensorButtonShown: true,
                button: { text: 'Connect', isDisabled: false },
            },
            'Did not unlock with connect when connecting failed!'
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
    protected static async unlocksAndShowsErrorWhenStoppingReportsError() {
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
                isLocked: false,
                button: { text: 'Connect', isDisabled: false },
                error: 'Still busy',
            },
            'Did not unlock and show error when stopping reported an error!'
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
    protected static async asksOrchestratorForStatusOnLoad() {
        render(<App />)

        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            {
                urls: FakeWebSocket.callsToConstructor,
                sent: FakeWebSocket.callsToSend.map(({ data }) =>
                    JSON.parse(data as string)
                ),
            },
            { urls: ['ws://localhost:8763'], sent: [{ command: 'status' }] },
            'Did not ask orchestrator for status on load!'
        )
    }

    @test()
    protected static async restoresSessionAlreadyRunningOnLoad() {
        render(<App />)

        act(() =>
            this.orchestratorSocket.receive({
                devices: [
                    { deviceName: 'Muse S Gen 2', identifier: 'muse-uuid' },
                    { deviceName: 'Zephyr BioHarness 3' },
                ],
            })
        )

        assert.isEqualDeep(
            {
                lockState: this.lockState,
                deviceNames: lastStreamMonitorProps?.deviceNames,
                museUuid:
                    lastStreamMonitorProps?.identifiers?.['Muse S Gen 2']
                        ?.value,
            },
            {
                lockState: {
                    isLocked: true,
                    isAddBiosensorButtonShown: false,
                    button: { text: 'Stop', isDisabled: false },
                },
                deviceNames: ['Muse S Gen 2', 'Zephyr BioHarness 3'],
                museUuid: 'muse-uuid',
            },
            'Did not restore session already running on load!'
        )
    }

    @test()
    protected static async staysUnlockedWhenNoSessionIsRunningOnLoad() {
        this.renderWithMuse()

        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            {
                lockState: this.lockState,
                deviceNames: lastStreamMonitorProps?.deviceNames,
            },
            {
                lockState: {
                    isLocked: false,
                    isAddBiosensorButtonShown: true,
                    button: { text: 'Connect', isDisabled: false },
                },
                deviceNames: ['Muse S Gen 2'],
            },
            'Did not stay unlocked when no session was running on load!'
        )
    }

    @test()
    protected static async showsNoErrorWhenOrchestratorIsUnreachableOnLoad() {
        render(<App />)

        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqual(
            screen.queryByRole('alert'),
            null,
            'Showed an error when orchestrator was unreachable on load!'
        )
    }

    @test()
    protected static async sendsNoRecordPathWhenRecordIsOff() {
        this.renderWithMuse()

        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isFalse(
            'xdfRecordPath' in this.lastSentMessage,
            'Sent a record path when record was off!'
        )
    }

    @test()
    protected static async hidesRecordingsFolderUntilRecordIsOn() {
        render(<App />)

        const wasShownBefore = this.isRecordDirectoryShown
        this.turnRecordOn()

        assert.isEqualDeep(
            { wasShownBefore, isShown: this.isRecordDirectoryShown },
            { wasShownBefore: false, isShown: true },
            'Did not hide recordings folder until record was on!'
        )
    }

    @test()
    protected static async offersDefaultRecordingsFolder() {
        render(<App />)

        this.turnRecordOn()

        assert.isEqual(
            this.recordDirectoryInput.value,
            '~/Documents/Personomic',
            'Did not offer default recordings folder!'
        )
    }

    @test()
    protected static async sendsTimestampedRecordPathInTypedFolder() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.typeRecordDirectory(' /data/recordings/ ')
        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqual(
            this.lastSentMessage.xdfRecordPath,
            '/data/recordings/session_2026-10-07_14-32-05.xdf',
            'Did not send timestamped record path in typed folder!'
        )
    }

    @test()
    protected static async recordsToDefaultFolderWhenFolderIsBlank() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.typeRecordDirectory('   ')
        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqual(
            this.lastSentMessage.xdfRecordPath,
            '~/Documents/Personomic/session_2026-10-07_14-32-05.xdf',
            'Did not record to default folder when folder was blank!'
        )
    }

    @test()
    protected static async showsDefaultRecordingNameBeforeCurrentTimestamp() {
        render(<App />)

        this.turnRecordOn()

        assert.isEqualDeep(
            {
                name: this.recordNameInput.value,
                timestamp: this.shownRecordTimestamp,
            },
            { name: 'session', timestamp: '_2026-10-07_14-32-05.xdf' },
            'Did not show default recording name before current timestamp!'
        )
    }

    @test()
    protected static async updatesShownTimestampEverySecond() {
        render(<App />)

        this.turnRecordOn()
        this.passOneSecondUntil(new Date(2026, 9, 7, 14, 32, 6))

        assert.isEqual(
            this.shownRecordTimestamp,
            '_2026-10-07_14-32-06.xdf',
            'Did not update shown timestamp every second!'
        )
    }

    @test()
    protected static async freezesShownTimestampAtSentOneWhileConnecting() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.clickConnect()
        act(() => this.orchestratorSocket.open())
        this.passOneSecondUntil(new Date(2026, 9, 7, 14, 32, 9))

        assert.isEqualDeep(
            {
                sent: this.lastSentMessage.xdfRecordPath,
                shown: this.shownRecordTimestamp,
            },
            {
                sent: '~/Documents/Personomic/session_2026-10-07_14-32-05.xdf',
                shown: '_2026-10-07_14-32-05.xdf',
            },
            'Did not freeze shown timestamp at sent one while connecting!'
        )
    }

    @test()
    protected static async resumesShownTimestampWhenConnectingFails() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.clickConnect()
        act(() => this.orchestratorSocket.receive({ error: 'No Muse found' }))
        this.passOneSecondUntil(new Date(2026, 9, 7, 14, 32, 9))

        assert.isEqual(
            this.shownRecordTimestamp,
            '_2026-10-07_14-32-09.xdf',
            'Did not resume shown timestamp when connecting failed!'
        )
    }

    @test()
    protected static async stopsTickingOnceRecordIsTurnedOff() {
        render(<App />)

        this.turnRecordOn()
        const numTickingWhileOn = this.secondCallbacks.size
        fireEvent.click(this.recordToggle)

        assert.isEqualDeep(
            { numTickingWhileOn, numTicking: this.secondCallbacks.size },
            { numTickingWhileOn: 1, numTicking: 0 },
            'Did not stop ticking once record was turned off!'
        )
    }

    @test()
    protected static async putsTypedRecordingNameBeforeTimestamp() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.typeRecordName(' resting baseline ')
        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqual(
            this.lastSentMessage.xdfRecordPath,
            '~/Documents/Personomic/resting baseline_2026-10-07_14-32-05.xdf',
            'Did not put typed recording name before timestamp!'
        )
    }

    @test()
    protected static async replacesIllegalFileNameCharactersInRecordingName() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.typeRecordName('sub/01:run*2')
        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqual(
            this.lastSentMessage.xdfRecordPath,
            '~/Documents/Personomic/sub-01-run-2_2026-10-07_14-32-05.xdf',
            'Did not replace illegal file name characters in recording name!'
        )
    }

    @test()
    protected static async usesDefaultRecordingNameWhenNameIsBlank() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.typeRecordName('   ')
        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqual(
            this.lastSentMessage.xdfRecordPath,
            '~/Documents/Personomic/session_2026-10-07_14-32-05.xdf',
            'Did not use default recording name when name was blank!'
        )
    }

    @test()
    protected static async doesNotRememberRecordingNameAcrossReloads() {
        const { unmount } = render(<App />)

        this.turnRecordOn()
        this.typeRecordName('resting-baseline')
        unmount()

        render(<App />)
        this.turnRecordOn()

        assert.isEqual(
            this.recordNameInput.value,
            'session',
            'Remembered recording name across reloads!'
        )
    }

    @test()
    protected static async remembersRecordingsFolderAcrossReloads() {
        const { unmount } = render(<App />)

        this.turnRecordOn()
        this.typeRecordDirectory('/data/recordings')
        unmount()

        render(<App />)
        this.turnRecordOn()

        assert.isEqual(
            this.recordDirectoryInput.value,
            '/data/recordings',
            'Did not remember recordings folder across reloads!'
        )
    }

    @test()
    protected static async asksOrchestratorToChooseFolderOnBrowse() {
        render(<App />)

        this.turnRecordOn()
        this.clickBrowse()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage,
            { command: 'chooseDirectory' },
            'Did not ask orchestrator to choose folder on browse!'
        )
    }

    @test()
    protected static async usesAndRemembersFolderChosenOnBrowse() {
        render(<App />)

        this.turnRecordOn()
        this.clickBrowse()
        act(() => this.orchestratorSocket.receive({ directory: '/chosen' }))

        assert.isEqualDeep(
            {
                shown: this.recordDirectoryInput.value,
                remembered: localStorage.getItem('personomic.recordDirectory'),
            },
            { shown: '/chosen', remembered: '/chosen' },
            'Did not use and remember folder chosen on browse!'
        )
    }

    @test()
    protected static async disablesBrowseUntilOrchestratorReplies() {
        render(<App />)

        this.turnRecordOn()
        this.clickBrowse()
        const wasDisabledWhileChoosing = this.browseButton.disabled
        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            {
                wasDisabledWhileChoosing,
                isDisabled: this.browseButton.disabled,
            },
            { wasDisabledWhileChoosing: true, isDisabled: false },
            'Did not disable browse until orchestrator replied!'
        )
    }

    @test()
    protected static async enablesBrowseAgainWhenOrchestratorIsUnreachable() {
        render(<App />)

        this.turnRecordOn()
        this.clickBrowse()
        act(() => this.orchestratorSocket.dropConnection())

        assert.isFalse(
            this.browseButton.disabled,
            'Did not enable browse again when orchestrator was unreachable!'
        )
    }

    @test()
    protected static async keepsFolderWhenBrowseIsCancelled() {
        render(<App />)

        this.turnRecordOn()
        this.typeRecordDirectory('/data/recordings')
        this.clickBrowse()
        act(() => this.orchestratorSocket.receive({}))

        assert.isEqual(
            this.recordDirectoryInput.value,
            '/data/recordings',
            'Did not keep folder when browse was cancelled!'
        )
    }

    @test()
    protected static async showsErrorWhenBrowseFails() {
        render(<App />)

        this.turnRecordOn()
        this.clickBrowse()
        act(() => this.orchestratorSocket.receive({ error: 'macOS only' }))

        assert.isEqual(
            screen.getByRole('alert').textContent,
            'macOS only',
            'Did not show error when browse failed!'
        )
    }

    @test()
    protected static async showsHowToStartOrchestratorWhenUnreachableOnBrowse() {
        render(<App />)

        this.turnRecordOn()
        this.clickBrowse()
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqual(
            screen.getByRole('alert').textContent,
            'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.',
            'Did not show how to start orchestrator when unreachable on browse!'
        )
    }

    @test()
    protected static async locksRecordControlsWhileConnecting() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.clickConnect()

        assert.isEqualDeep(
            {
                isToggleDisabled: this.recordToggle.disabled,
                isFolderReadOnly: this.recordDirectoryInput.readOnly,
                isNameReadOnly: this.recordNameInput.readOnly,
                isBrowseShown: this.isBrowseShown,
            },
            {
                isToggleDisabled: true,
                isFolderReadOnly: true,
                isNameReadOnly: true,
                isBrowseShown: false,
            },
            'Did not lock record controls while connecting!'
        )
    }

    @test()
    protected static async showsRecordingPathReportedByOrchestrator() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.clickConnect()
        act(() =>
            this.orchestratorSocket.receive({ xdfRecordPath: '/data/a.xdf' })
        )

        assert.isEqualDeep(
            {
                isRecordingShown: this.isRecordingShownFor('/data/a.xdf'),
                isFolderShown: this.isRecordDirectoryShown,
            },
            { isRecordingShown: true, isFolderShown: false },
            'Did not show recording path reported by orchestrator!'
        )
    }

    @test()
    protected static async asksOrchestratorToRevealRecordingOnClick() {
        this.showRecordingThroughOrchestrator()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage,
            { command: 'revealRecording' },
            'Did not ask orchestrator to reveal recording on click!'
        )
    }

    @test()
    protected static async showsErrorWhenRevealingRecordingFails() {
        this.showRecordingThroughOrchestrator()
        act(() => this.orchestratorSocket.receive({ error: 'macOS only' }))

        assert.isEqual(
            screen.getByRole('alert').textContent,
            'macOS only',
            'Did not show error when revealing recording failed!'
        )
    }

    @test()
    protected static async showsHowToStartOrchestratorWhenUnreachableOnReveal() {
        this.showRecordingThroughOrchestrator()
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqual(
            screen.getByRole('alert').textContent,
            'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.',
            'Did not show how to start orchestrator when unreachable on reveal!'
        )
    }

    @test()
    protected static async restoresRecordingPathOfSessionRunningOnLoad() {
        render(<App />)

        act(() =>
            this.orchestratorSocket.receive({
                devices: [{ deviceName: 'Muse S Gen 2' }],
                xdfRecordPath: '/data/a.xdf',
            })
        )

        assert.isEqualDeep(
            {
                isRecordOn: this.recordToggle.checked,
                isRecordingShown: this.isRecordingShownFor('/data/a.xdf'),
            },
            { isRecordOn: true, isRecordingShown: true },
            'Did not restore recording path of session running on load!'
        )
    }

    @test()
    protected static async offersRecordingsFolderAgainAfterStop() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.clickConnect()
        act(() =>
            this.orchestratorSocket.receive({ xdfRecordPath: '/data/a.xdf' })
        )
        this.clickStop()
        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            {
                isRecordingShown: this.isRecordingShownFor('/data/a.xdf'),
                isFolderShown: this.isRecordDirectoryShown,
                isBrowseShown: this.isBrowseShown,
            },
            {
                isRecordingShown: false,
                isFolderShown: true,
                isBrowseShown: true,
            },
            'Did not offer recordings folder again after stop!'
        )
    }

    @test()
    protected static async resetsMonitorToBeforeConnectOnceStopped() {
        this.renderWithMuse()

        this.connect()
        const numMountsWhileStreaming = numStreamMonitorMounts
        this.clickStop()
        act(() => this.orchestratorSocket.receive({}))

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsWhileStreaming + 1,
            'Did not reset monitor to before connect once stopped!'
        )
    }

    @test()
    protected static async resetsMonitorWhenStoppingReportsError() {
        this.renderWithMuse()

        this.connect()
        const numMountsWhileStreaming = numStreamMonitorMounts
        this.clickStop()
        act(() => this.orchestratorSocket.receive({ error: 'Still busy' }))

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsWhileStreaming + 1,
            'Did not reset monitor when stopping reported an error!'
        )
    }

    @test()
    protected static async resetsMonitorWhenOrchestratorIsUnreachableOnStop() {
        this.renderWithMuse()

        this.connect()
        const numMountsWhileStreaming = numStreamMonitorMounts
        this.clickStop()
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsWhileStreaming + 1,
            'Did not reset monitor when orchestrator was unreachable on stop!'
        )
    }

    @test()
    protected static async resetsMonitorWhenConnectingFails() {
        this.renderWithMuse()

        const numMountsBefore = numStreamMonitorMounts
        this.clickConnect()
        act(() => this.orchestratorSocket.receive({ error: 'No Muse found' }))

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsBefore + 1,
            'Did not reset monitor when connecting failed!'
        )
    }

    @test()
    protected static async keepsMonitorWhileSessionStarts() {
        this.renderWithMuse()

        const numMountsBefore = numStreamMonitorMounts
        this.connect()

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsBefore,
            'Reset monitor while session started!'
        )
    }

    @test()
    protected static async keepsSelectedDevicesAndIdentifiersOnceStopped() {
        this.renderWithMuse()

        this.typeIdentifier('Muse S Gen 2', 'muse-uuid')
        this.connect()
        this.clickStop()
        act(() => this.orchestratorSocket.receive({}))

        assert.isEqualDeep(
            {
                deviceNames: lastStreamMonitorProps?.deviceNames,
                uuid: lastStreamMonitorProps?.identifiers?.['Muse S Gen 2']
                    ?.value,
            },
            { deviceNames: ['Muse S Gen 2'], uuid: 'muse-uuid' },
            'Did not keep selected devices and identifiers once stopped!'
        )
    }

    @test()
    protected static async remembersNoIdentifiersAtFirst() {
        this.renderWithMuse()

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            {},
            'Remembered identifiers before any were passed!'
        )
    }

    @test()
    protected static async remembersIdentifierPassedOnConnect() {
        this.renderWithMuse()

        this.typeIdentifier('Muse S Gen 2', ' muse-uuid ')
        this.clickConnect()

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            { 'Muse S Gen 2': ['muse-uuid'] },
            'Did not remember identifier passed on connect!'
        )
    }

    @test()
    protected static async doesNotRememberIdentifierThatWasOnlyTyped() {
        this.renderWithMuse()

        this.typeIdentifier('Muse S Gen 2', 'muse-uuid')

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            {},
            'Remembered identifier that was only typed!'
        )
    }

    @test()
    protected static async remembersMostRecentIdentifierFirstWithoutRepeats() {
        this.renderWithMuse()

        this.connectAndStopWithIdentifier('first-uuid')
        this.connectAndStopWithIdentifier('second-uuid')
        this.connectAndStopWithIdentifier('first-uuid')

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            { 'Muse S Gen 2': ['first-uuid', 'second-uuid'] },
            'Did not remember most recent identifier first without repeats!'
        )
    }

    @test()
    protected static async remembersIdentifiersSeparatelyForEachDevice() {
        this.renderWithMuse()
        this.addBiosensor('OpenBCI Cyton')

        this.typeIdentifier('Muse S Gen 2', 'muse-uuid')
        this.typeIdentifier('OpenBCI Cyton', 'AR4K581H')
        this.clickConnect()

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            { 'Muse S Gen 2': ['muse-uuid'], 'OpenBCI Cyton': ['AR4K581H'] },
            'Did not remember identifiers separately for each device!'
        )
    }

    @test()
    protected static async remembersIdentifiersOfRepeatsUnderOneDeviceName() {
        this.renderWithTwoMuses()

        this.typeIdentifier('Muse S Gen 2', 'first-uuid')
        this.typeIdentifier('Muse S Gen 2 #2', 'second-uuid')
        this.clickConnect()

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            { 'Muse S Gen 2': ['second-uuid', 'first-uuid'] },
            'Did not remember identifiers of repeats under one device name!'
        )
    }

    @test()
    protected static async doesNotRememberIdentifiersWhenRefusingToConnect() {
        this.renderWithTwoMuses()

        this.typeIdentifier('Muse S Gen 2', 'first-uuid')
        this.clickConnect()

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            {},
            'Remembered identifiers when refusing to connect!'
        )
    }

    @test()
    protected static async forgetsOnlyTheChosenIdentifier() {
        this.renderWithMuse()

        this.connectAndStopWithIdentifier('first-uuid')
        this.connectAndStopWithIdentifier('second-uuid')
        this.forgetIdentifier('Muse S Gen 2', 'first-uuid')

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            { 'Muse S Gen 2': ['second-uuid'] },
            'Did not forget only the chosen identifier!'
        )
    }

    @test()
    protected static async forgetsIdentifierOnlyForItsOwnDevice() {
        this.renderWithMuse()
        this.addBiosensor('Govee Thermohygrometer H5074')

        this.typeIdentifier('Muse S Gen 2', 'shared-uuid')
        this.typeIdentifier('Govee Thermohygrometer H5074', 'shared-uuid')
        this.connect()
        this.clickStop()
        act(() => this.orchestratorSocket.receive({}))
        this.forgetIdentifier('Muse S Gen 2', 'shared-uuid')

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            { 'Govee Thermohygrometer H5074': ['shared-uuid'] },
            'Did not forget identifier only for its own device!'
        )
    }

    @test()
    protected static async keepsIdentifierForgottenAcrossReloads() {
        const { unmount } = render(<App />)

        this.addBiosensor('Muse S Gen 2')
        this.connectAndStopWithIdentifier('muse-uuid')
        this.forgetIdentifier('Muse S Gen 2', 'muse-uuid')
        unmount()

        this.renderWithMuse()

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            {},
            'Did not keep identifier forgotten across reloads!'
        )
    }

    @test()
    protected static async doesNotLetIdentifiersBeForgottenWhileLocked() {
        this.renderWithMuse()

        this.typeIdentifier('Muse S Gen 2', 'muse-uuid')
        this.clickConnect()

        assert.isEqual(
            lastStreamMonitorProps?.onForgetIdentifier,
            undefined,
            'Let identifiers be forgotten while locked!'
        )
    }

    @test()
    protected static async remembersIdentifiersAcrossReloads() {
        const { unmount } = render(<App />)

        this.addBiosensor('Muse S Gen 2')
        this.typeIdentifier('Muse S Gen 2', 'muse-uuid')
        this.clickConnect()
        unmount()

        this.renderWithMuse()

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            { 'Muse S Gen 2': ['muse-uuid'] },
            'Did not remember identifiers across reloads!'
        )
    }

    @test()
    protected static async remembersNoIdentifiersWhenStoredOnesAreUnreadable() {
        localStorage.setItem('personomic.rememberedIdentifiers', 'not json')

        this.renderWithMuse()

        assert.isEqualDeep(
            lastStreamMonitorProps?.rememberedIdentifiers,
            {},
            'Did not fall back to no identifiers when stored ones were unreadable!'
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

    private static renderWithTwoMuses() {
        this.renderWithMuse()
        this.addBiosensor('Muse S Gen 2')
    }

    private static renderWithTwoDifferentMuses() {
        this.renderWithMuse()
        this.addBiosensor('Muse 2')
    }

    private static assertRefusesToConnectRepeats() {
        const numContactsBefore = FakeWebSocket.callsToConstructor.length
        this.clickConnect()

        assert.isEqualDeep(
            {
                error: screen.getByRole('alert').textContent,
                numContacts: FakeWebSocket.callsToConstructor.length,
                button: this.sessionButtonState,
            },
            {
                error: 'Must give each Muse its own UUID!',
                numContacts: numContactsBefore,
                button: { text: 'Connect', isDisabled: false },
            },
            'Did not refuse to connect repeats!'
        )
    }

    private static connectAndStopWithIdentifier(identifier: string) {
        this.typeIdentifier('Muse S Gen 2', identifier)
        this.connect()
        this.clickStop()
        act(() => this.orchestratorSocket.receive({}))
    }

    private static forgetIdentifier(name: string, identifier: string) {
        act(() =>
            lastStreamMonitorProps?.onForgetIdentifier?.(name, identifier)
        )
    }

    private static typeIdentifier(name: string, value: string) {
        act(() => lastStreamMonitorProps?.onIdentifierChange?.(name, value))
    }

    private static turnRecordOn() {
        fireEvent.click(this.recordToggle)
    }

    private static get recordToggle() {
        return screen.getByRole('checkbox', {
            name: /record/i,
        }) as HTMLInputElement
    }

    private static typeRecordDirectory(value: string) {
        fireEvent.change(this.recordDirectoryInput, { target: { value } })
    }

    private static get recordDirectoryInput() {
        return screen.getByRole('textbox', {
            name: /recordings folder/i,
        }) as HTMLInputElement
    }

    private static get shownRecordTimestamp() {
        return screen.getByText(/^_\d{4}-.*\.xdf$/).textContent
    }

    private static passOneSecondUntil(date: Date) {
        setNow(() => date)
        act(() => this.secondCallbacks.forEach((callback) => callback()))
    }

    private static typeRecordName(value: string) {
        fireEvent.change(this.recordNameInput, { target: { value } })
    }

    private static get recordNameInput() {
        return screen.getByRole('textbox', {
            name: /recording name/i,
        }) as HTMLInputElement
    }

    private static get isRecordDirectoryShown() {
        return (
            screen.queryByRole('textbox', { name: /recordings folder/i }) !==
            null
        )
    }

    private static isRecordingShownFor(path: string) {
        return screen.queryByRole('button', { name: path }) !== null
    }

    private static showRecordingThroughOrchestrator() {
        this.renderWithMuse()

        this.turnRecordOn()
        this.clickConnect()
        act(() =>
            this.orchestratorSocket.receive({ xdfRecordPath: '/data/a.xdf' })
        )
        fireEvent.click(screen.getByRole('button', { name: '/data/a.xdf' }))
    }

    private static clickBrowse() {
        fireEvent.click(this.browseButton)
    }

    private static get browseButton() {
        return screen.getByRole('button', {
            name: /browse/i,
        }) as HTMLButtonElement
    }

    private static get isBrowseShown() {
        return screen.queryByRole('button', { name: /browse/i }) !== null
    }

    private static get lastSentMessage() {
        return JSON.parse(FakeWebSocket.callsToSend.at(-1)?.data as string)
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
