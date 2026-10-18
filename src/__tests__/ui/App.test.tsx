import { test, assert } from '@neurodevs/node-tdd'
import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import FakeFrameScheduler from '../../testDoubles/FrameScheduler/FakeFrameScheduler'
import FakeStreamPlot from '../../testDoubles/StreamPlot/FakeStreamPlot'
import FakeStreamMonitor, {
    lastStreamMonitorProps,
    numStreamMonitorMounts,
} from '../../testDoubles/StreamMonitor/FakeStreamMonitor'
import FakeWebSocket from '../../testDoubles/WebSocket/FakeWebSocket'
import readXdfRecording from '../../functions/readXdfRecording'
import buildXdfFile from '../../testDoubles/Xdf/buildXdfFile'
import App, {
    scanThroughOrchestrator,
    setEverySecond,
    setIdentifierScanner,
    setNow,
    setScanAgainAfter,
    setStreamMonitorComponent,
} from '../../ui/App'
import { ScannedIdentifier } from '../../ui/components/IdentifierInput'
import StreamMonitor, {
    setClock,
    setFrameScheduler,
    setStreamPlotComponent,
    setWebSocketComponent,
} from '../../ui/components/StreamMonitor'
import AbstractPackageTest from '../AbstractPackageTest'

export default class AppTest extends AbstractPackageTest {
    private static element: React.ReactElement
    private static secondCallbacks: Set<() => void>
    private static scans: FakeScan[]
    private static scanAgainCalls: { callback: () => void; ms: number }[]
    private static readonly anyMuse = 'Muse (auto-detect, slower)'

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

        this.scans = []
        setIdentifierScanner((deviceNames, onScanned) => {
            const scan: FakeScan = { deviceNames, onScanned, isStopped: false }
            this.scans.push(scan)
            return () => {
                scan.isStopped = true
            }
        })

        this.scanAgainCalls = []
        setScanAgainAfter((callback, ms) => {
            const call = { callback, ms }
            this.scanAgainCalls.push(call)
            return () => {
                this.scanAgainCalls = this.scanAgainCalls.filter(
                    (other) => other !== call
                )
            }
        })

        this.element = this.renderApp()
    }

    @test()
    protected static async scansForIdentifiersOfDevicesThatTakeOne() {
        render(<App />)

        this.addBiosensor('Muse S Gen 2')
        this.addBiosensor('Zephyr BioHarness 3')
        this.addBiosensor('OpenBCI Cyton')

        assert.isEqualDeep(
            this.activeScan?.deviceNames,
            ['Muse S Gen 2', 'OpenBCI Cyton'],
            'Did not scan for identifiers of devices that take one!'
        )
    }

    @test()
    protected static async scansEachDeviceNameOnce() {
        this.renderWithTwoMuses()

        assert.isEqualDeep(
            this.activeScan?.deviceNames,
            ['Muse S Gen 2'],
            'Did not scan each device name once!'
        )
    }

    @test()
    protected static async scansForAutoDetectedMuseAsAnyMuse() {
        render(<App />)

        this.addBiosensor('Muse (auto-detect, slower)')

        assert.isEqualDeep(
            this.activeScan?.deviceNames,
            ['Muse'],
            'Did not scan for auto-detected Muse as any Muse!'
        )
    }

    @test()
    protected static async doesNotScanWithoutDevicesThatTakeIdentifier() {
        render(<App />)

        this.addBiosensor('Zephyr BioHarness 3')

        assert.isUndefined(
            this.activeScan,
            'Scanned without devices that take an identifier!'
        )
    }

    @test()
    protected static async passesScannedIdentifiersToMonitorByDeviceName() {
        render(<App />)

        this.addBiosensor('Muse (auto-detect, slower)')
        this.addBiosensor('OpenBCI Cyton')

        act(() =>
            this.activeScan?.onScanned({
                Muse: [{ value: 'muse-uuid', source: 'Muse' }],
                'OpenBCI Cyton': [{ value: 'DM00ABCD', source: 'USB' }],
            })
        )

        assert.isEqualDeep(
            lastStreamMonitorProps?.scannedIdentifiers,
            {
                'Muse (auto-detect, slower)': [
                    { value: 'muse-uuid', source: 'Muse' },
                ],
                'OpenBCI Cyton': [{ value: 'DM00ABCD', source: 'USB' }],
            },
            'Did not pass scanned identifiers to monitor by device name!'
        )
    }

    @test()
    protected static async stopsScanningOnceConnecting() {
        this.renderWithMuse()

        const scan = this.activeScan
        this.clickConnect()

        assert.isEqualDeep(
            { isStopped: scan?.isStopped, active: this.activeScan },
            { isStopped: true, active: undefined },
            'Did not stop scanning once connecting!'
        )
    }

    @test()
    protected static async asksOrchestratorToScanForDeviceNames() {
        setIdentifierScanner(scanThroughOrchestrator)
        FakeWebSocket.resetTestDouble()

        this.renderWithMuse()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            {
                url: FakeWebSocket.callsToConstructor.at(-1),
                sent: this.lastSentMessage,
            },
            {
                url: 'ws://localhost:8763',
                sent: { command: 'scan', deviceNames: ['Muse S Gen 2'] },
            },
            'Did not ask orchestrator to scan for device names!'
        )
    }

    @test()
    protected static async scansAgainShortlyAfterEachReply() {
        setIdentifierScanner(scanThroughOrchestrator)

        this.renderWithMuse()
        act(() =>
            this.orchestratorSocket.receive({
                scanned: {
                    'Muse S Gen 2': [{ value: 'muse-uuid', source: 'Muse' }],
                },
            })
        )

        const shown = lastStreamMonitorProps?.scannedIdentifiers
        const waitMs = this.scanAgainCalls[0]?.ms
        const numSocketsBefore = FakeWebSocket.instances.length
        act(() => this.scanAgainCalls[0]?.callback())

        assert.isEqualDeep(
            {
                shown,
                waitMs,
                numNewSockets:
                    FakeWebSocket.instances.length - numSocketsBefore,
            },
            {
                shown: {
                    'Muse S Gen 2': [{ value: 'muse-uuid', source: 'Muse' }],
                },
                waitMs: 3000,
                numNewSockets: 1,
            },
            'Did not scan again shortly after each reply!'
        )
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
    protected static async detectsPeaksOnlyOnInfraredPpg() {
        render(<App />)

        assert.isEqualDeep(
            lastStreamMonitorProps?.streamOptions?.PPG?.detectPeaks?.channels,
            ['INFRARED'],
            'Did not detect peaks only on infrared PPG!'
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

    @test()
    protected static async leavesUnusedAuxChannelOutOfEegBandPowers() {
        render(<App />)

        assert.isEqualDeep(
            lastStreamMonitorProps?.streamOptions?.EEG?.bandPowers
                ?.channelsLeftOut,
            ['AUX'],
            'Did not leave unused AUX channel out of EEG band powers!'
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
            this.offeredBiosensors.filter((name) => name !== this.anyMuse),
            [...DEVICE_NAMES],
            'Did not offer every biosensor at first!'
        )
    }

    @test()
    protected static async offersAnyMuseBelowMuseModels() {
        render(<App />)

        this.openBiosensorMenu()

        assert.isEqual(
            this.offeredBiosensors
                .filter((name) => name?.startsWith('Muse '))
                .at(-1),
            this.anyMuse,
            'Did not offer any Muse below Muse models!'
        )
    }

    @test()
    protected static async keepsOfferingAnyMuseOnceAdded() {
        render(<App />)

        this.addBiosensor(this.anyMuse)
        this.openBiosensorMenu()

        assert.isTrue(
            this.offeredBiosensors.includes(this.anyMuse),
            'Did not keep offering any Muse once added!'
        )
    }

    @test()
    protected static async offersUuidForAnyMuse() {
        render(<App />)

        this.addBiosensor(this.anyMuse)

        assert.isEqual(
            lastStreamMonitorProps?.identifiers?.[this.anyMuse]?.label,
            'UUID',
            'Did not offer UUID for any Muse!'
        )
    }

    @test()
    protected static async asksOrchestratorToDetectModelOfAnyMuse() {
        render(<App />)

        this.addBiosensor(this.anyMuse)
        this.typeIdentifier(this.anyMuse, 'muse-uuid')
        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage.devices,
            [{ deviceName: 'Muse', identifier: 'muse-uuid' }],
            'Did not ask orchestrator to detect model of any Muse!'
        )
    }

    @test()
    protected static async showsDetectedMuseModelOnceConnected() {
        render(<App />)

        this.addBiosensor(this.anyMuse)
        this.addBiosensor('OpenBCI Cyton')
        this.typeIdentifier(this.anyMuse, 'muse-uuid')
        this.clickConnect()
        act(() =>
            this.orchestratorSocket.receive({
                devices: [
                    { deviceName: 'Muse 2', identifier: 'muse-uuid' },
                    { deviceName: 'OpenBCI Cyton' },
                ],
            })
        )

        assert.isEqualDeep(
            {
                deviceNames: lastStreamMonitorProps?.deviceNames,
                museUuid:
                    lastStreamMonitorProps?.identifiers?.['Muse 2']?.value,
            },
            {
                deviceNames: ['Muse 2', 'OpenBCI Cyton'],
                museUuid: 'muse-uuid',
            },
            'Did not show detected Muse model once connected!'
        )
    }

    @test()
    protected static async showsDetectingMuseModelUntilOrchestratorReplies() {
        render(<App />)

        this.addBiosensor(this.anyMuse)
        this.clickConnect()
        const whileWaiting = this.sessionButtonState

        act(() =>
            this.orchestratorSocket.receive({
                devices: [{ deviceName: 'Muse 2' }],
            })
        )

        assert.isEqualDeep(
            [whileWaiting, this.sessionButtonState],
            [
                { text: 'Detecting Muse model…', isDisabled: true },
                { text: 'Stop', isDisabled: false },
            ],
            'Did not show detecting Muse model until orchestrator replied!'
        )
    }

    @test()
    protected static async keepsAnyMuseWhenConnectingFails() {
        render(<App />)

        this.addBiosensor(this.anyMuse)
        this.clickConnect()
        act(() => this.orchestratorSocket.receive({ error: 'No Muse found' }))

        assert.isEqualDeep(
            lastStreamMonitorProps?.deviceNames,
            [this.anyMuse],
            'Did not keep any Muse when connecting failed!'
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
    protected static async passesTypedNicknameBackToMonitor() {
        this.renderWithMuse()

        this.typeNickname('Muse S Gen 2', 'Alice')

        assert.isEqualDeep(
            lastStreamMonitorProps?.nicknames,
            { 'Muse S Gen 2': 'Alice' },
            'Did not pass typed nickname back to monitor!'
        )
    }

    @test()
    protected static async keepsNicknameOfEachRepeatSeparate() {
        this.renderWithTwoMuses()

        this.typeNickname('Muse S Gen 2', 'Alice')
        this.typeNickname('Muse S Gen 2 #2', 'Bob')

        assert.isEqualDeep(
            lastStreamMonitorProps?.nicknames,
            { 'Muse S Gen 2': 'Alice', 'Muse S Gen 2 #2': 'Bob' },
            'Did not keep nickname of each repeat separate!'
        )
    }

    @test()
    protected static async startsOrchestratorWithTrimmedNicknames() {
        this.renderWithMuse()

        this.addBiosensor('Zephyr BioHarness 3')
        this.typeNickname('Muse S Gen 2', ' Alice ')
        this.typeNickname('Zephyr BioHarness 3', '   ')

        this.clickConnect()
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage.devices,
            [
                { deviceName: 'Muse S Gen 2', nickname: 'Alice' },
                { deviceName: 'Zephyr BioHarness 3' },
            ],
            'Did not start orchestrator with trimmed nicknames!'
        )
    }

    @test()
    protected static async doesNotLetNicknamesChangeWhileLocked() {
        this.renderWithMuse()

        this.connect()

        assert.isUndefined(
            lastStreamMonitorProps?.onNicknameChange,
            'Let nicknames change while locked!'
        )
    }

    @test()
    protected static async restoresNicknamesOfSessionRunningOnLoad() {
        render(<App />)

        act(() =>
            this.orchestratorSocket.receive({
                devices: [
                    { deviceName: 'Muse S Athena', nickname: 'Alice' },
                    { deviceName: 'Muse S Athena', nickname: 'Bob' },
                ],
            })
        )

        assert.isEqualDeep(
            lastStreamMonitorProps?.nicknames,
            { 'Muse S Athena': 'Alice', 'Muse S Athena #2': 'Bob' },
            'Did not restore nicknames of session running on load!'
        )
    }

    @test()
    protected static async tellsMonitorItIsRecordingOnlyWhileRecordIsOn() {
        this.renderWithMuse()

        const beforeRecordIsOn = lastStreamMonitorProps?.isRecording
        this.turnRecordOn()
        const whileRecordIsOn = lastStreamMonitorProps?.isRecording
        this.turnRecordOn()

        assert.isEqualDeep(
            [
                beforeRecordIsOn,
                whileRecordIsOn,
                lastStreamMonitorProps?.isRecording,
            ],
            [false, true, false],
            'Did not tell monitor it is recording only while record is on!'
        )
    }

    @test()
    protected static async placesSessionButtonAboveBiosensors() {
        this.renderWithMuse()

        const monitor = screen.getByTestId('fake-stream-monitor')

        assert.isTrue(
            Boolean(
                monitor.compareDocumentPosition(this.sessionButton) &
                Node.DOCUMENT_POSITION_PRECEDING
            ),
            'Did not place session button above biosensors!'
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

    @test()
    protected static async namesRecordAndPlayAfterXdf() {
        this.renderWithMuse()

        assert.isEqualDeep(
            {
                record: this.recordToggle.closest('label')?.textContent,
                play: screen.queryByRole('button', {
                    name: 'Play XDF recording…',
                })?.textContent,
            },
            { record: 'Record XDF', play: 'Play XDF recording…' },
            'Did not name record and play after XDF!'
        )
    }

    @test()
    protected static async offersToPlayRecordingBeforeConnecting() {
        render(<App />)

        assert.isTrue(
            this.isPlayRecordingOffered,
            'Did not offer to play recording before connecting!'
        )
    }

    @test()
    protected static async doesNotOfferToPlayRecordingWhileConnected() {
        this.renderWithMuse()
        this.connect()

        assert.isFalse(
            this.isPlayRecordingOffered,
            'Offered to play recording while connected!'
        )
    }

    @test()
    protected static async asksForFileWhenPlayRecordingIsClicked() {
        render(<App />)

        let numTimesAsked = 0
        this.recordingToPlayInput.click = () => numTimesAsked++

        fireEvent.click(
            screen.getByRole('button', { name: /play xdf recording/i })
        )

        assert.isEqual(
            numTimesAsked,
            1,
            'Did not ask for file when play recording was clicked!'
        )
    }

    @test()
    protected static async asksOnlyForXdfFiles() {
        render(<App />)

        assert.isEqual(
            this.recordingToPlayInput.accept,
            '.xdf',
            'Did not ask only for XDF files!'
        )
    }

    @test()
    protected static async passesRecordingReadFromChosenFileToMonitor() {
        render(<App />)

        await this.chooseRecording()

        assert.isEqualDeep(
            lastStreamMonitorProps?.recording,
            readXdfRecording(this.museRecordingFile),
            'Did not pass recording read from chosen file to monitor!'
        )
    }

    @test()
    protected static async monitorsDevicesOfRecordingBeingPlayed() {
        this.renderWithMuse()

        await this.chooseRecording()

        assert.isEqualDeep(
            lastStreamMonitorProps?.deviceNames,
            ['Muse'],
            'Did not monitor devices of recording being played!'
        )
    }

    @test()
    protected static async monitorsNicknamesOfDevicesInRecording() {
        this.renderWithMuse()
        this.typeNickname('Muse S Gen 2', 'Typed before playing')

        await this.chooseRecording(
            buildXdfFile([
                {
                    sourceId: 'muse-eeg-X',
                    nickname: 'Alice',
                    channelNames: ['EEG_TP9'],
                    chunks: [{ samples: [[1]], timestamps: [10] }],
                },
            ])
        )

        assert.isEqualDeep(
            lastStreamMonitorProps?.nicknames,
            { Muse: 'Alice' },
            'Did not monitor nicknames of devices in recording!'
        )
    }

    @test()
    protected static async locksWhilePlayingAndOffersToStop() {
        render(<App />)

        await this.chooseRecording()

        assert.isEqualDeep(
            { ...this.lockState, isPlayOffered: this.isPlayRecordingOffered },
            {
                isLocked: true,
                isAddBiosensorButtonShown: false,
                button: { text: 'Stop', isDisabled: false },
                isPlayOffered: false,
            },
            'Did not lock while playing and offer to stop!'
        )
    }

    @test()
    protected static async showsNameOfFileBeingPlayed() {
        render(<App />)

        await this.chooseRecording(this.museRecordingFile, 'morning.xdf')

        assert.isTruthy(
            screen.queryByText('Playing morning.xdf'),
            'Did not show name of file being played!'
        )
    }

    @test()
    protected static async showsNoRecordControlsWhilePlaying() {
        render(<App />)
        this.turnRecordOn()

        await this.chooseRecording()

        assert.isEqualDeep(
            {
                isToggleShown: screen.queryByRole('checkbox') !== null,
                isDirectoryShown: this.isRecordDirectoryShown,
            },
            { isToggleShown: false, isDirectoryShown: false },
            'Showed record controls while playing!'
        )
    }

    @test()
    protected static async startsMonitorAfreshWhenPlayingStarts() {
        render(<App />)

        const numMountsBefore = numStreamMonitorMounts
        await this.chooseRecording()

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsBefore + 1,
            'Did not start monitor afresh when playing started!'
        )
    }

    @test()
    protected static async returnsToDevicesChosenBeforeOncePlayingIsStopped() {
        this.renderWithMuse()

        await this.chooseRecording()
        this.clickStop()

        assert.isEqualDeep(
            {
                deviceNames: lastStreamMonitorProps?.deviceNames,
                recording: lastStreamMonitorProps?.recording,
                ...this.lockState,
            },
            {
                deviceNames: ['Muse S Gen 2'],
                recording: undefined,
                isLocked: false,
                isAddBiosensorButtonShown: true,
                button: { text: 'Connect', isDisabled: false },
            },
            'Did not return to devices chosen before once playing was stopped!'
        )
    }

    @test()
    protected static async stopsPlayingWithoutContactingOrchestrator() {
        render(<App />)

        await this.chooseRecording()
        const numContactsBefore = FakeWebSocket.callsToConstructor.length
        this.clickStop()

        assert.isEqual(
            FakeWebSocket.callsToConstructor.length,
            numContactsBefore,
            'Contacted orchestrator to stop playing!'
        )
    }

    @test()
    protected static async clearsMonitorWhenPlayingIsStopped() {
        render(<App />)

        await this.chooseRecording()
        const numMountsWhilePlaying = numStreamMonitorMounts
        this.clickStop()

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsWhilePlaying + 1,
            'Did not clear monitor when playing was stopped!'
        )
    }

    @test()
    protected static async showsErrorWhenChosenFileIsNotXdf() {
        render(<App />)

        await this.chooseRecording(new ArrayBuffer(8), 'notes.txt')

        assert.isEqualDeep(
            {
                error: screen.getByRole('alert').textContent,
                ...this.lockState,
            },
            {
                error: 'Could not play notes.txt. It is not an XDF file.',
                isLocked: false,
                isAddBiosensorButtonShown: true,
                button: { text: 'Connect', isDisabled: true },
            },
            'Did not show error when chosen file was not XDF!'
        )
    }

    @test()
    protected static async showsErrorWhenRecordingHoldsNoSamples() {
        render(<App />)

        await this.chooseRecording(
            buildXdfFile([{ sourceId: 'muse-eeg-X', channelNames: ['A'] }]),
            'empty.xdf'
        )

        assert.isEqual(
            screen.getByRole('alert').textContent,
            'Could not play empty.xdf. It holds no samples.',
            'Did not show error when recording held no samples!'
        )
    }

    @test()
    protected static async clearsEarlierErrorWhenRecordingPlays() {
        render(<App />)

        await this.chooseRecording(new ArrayBuffer(8), 'notes.txt')
        await this.chooseRecording()

        assert.isEqual(
            screen.queryByRole('alert'),
            null,
            'Did not clear earlier error when recording played!'
        )
    }

    private static readonly museRecordingFile = buildXdfFile([
        {
            name: 'Muse EEG (X)',
            type: 'EEG',
            sourceId: 'muse-eeg-X',
            channelNames: ['EEG_TP9'],
            sampleRateHz: 256,
            chunks: [{ samples: [[1], [2]], timestamps: [10, 11] }],
        },
    ])

    @test()
    protected static async offersPlaybackSpeedsOnlyWhilePlaying() {
        render(<App />)
        const beforePlaying = this.offeredPlaybackSpeeds

        await this.chooseRecording()

        assert.isEqualDeep(
            { beforePlaying, whilePlaying: this.offeredPlaybackSpeeds },
            {
                beforePlaying: [],
                whilePlaying: ['1×', '2×', '5×', '10×', '20×', '50×', '100×'],
            },
            'Did not offer playback speeds only while playing!'
        )
    }

    @test()
    protected static async playsAtNormalSpeedUntilAnotherIsChosen() {
        render(<App />)

        await this.chooseRecording()

        assert.isEqualDeep(
            this.playbackSpeedState,
            { passed: 1, pressed: ['1×'] },
            'Did not play at normal speed until another was chosen!'
        )
    }

    @test()
    protected static async playsAtChosenSpeed() {
        render(<App />)

        await this.chooseRecording()
        fireEvent.click(screen.getByRole('button', { name: '5×' }))

        assert.isEqualDeep(
            this.playbackSpeedState,
            { passed: 5, pressed: ['5×'] },
            'Did not play at chosen speed!'
        )
    }

    @test()
    protected static async playsNextRecordingAtNormalSpeed() {
        render(<App />)

        await this.chooseRecording()
        fireEvent.click(screen.getByRole('button', { name: '100×' }))
        this.clickStop()
        await this.chooseRecording()

        assert.isEqualDeep(
            this.playbackSpeedState,
            { passed: 1, pressed: ['1×'] },
            'Did not play next recording at normal speed!'
        )
    }

    @test()
    protected static async keepsPlayingRecordingWhenSpeedChanges() {
        render(<App />)

        await this.chooseRecording()
        const numMountsBefore = numStreamMonitorMounts
        fireEvent.click(screen.getByRole('button', { name: '10×' }))

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsBefore,
            'Restarted recording when speed changed!'
        )
    }

    @test()
    protected static async showsFinishedButKeepsRecordingOpenOncePlaybackEnds() {
        render(<App />)

        await this.chooseRecording(this.museRecordingFile, 'morning.xdf')
        const numMountsWhilePlaying = numStreamMonitorMounts
        this.endPlayback()

        assert.isEqualDeep(
            {
                isFinishedShown:
                    screen.queryByText('Finished morning.xdf') !== null,
                isRecordingStillPassed:
                    lastStreamMonitorProps?.recording !== undefined,
                numNewMounts: numStreamMonitorMounts - numMountsWhilePlaying,
                button: this.lockState.button,
            },
            {
                isFinishedShown: true,
                isRecordingStillPassed: true,
                numNewMounts: 0,
                button: { text: 'Stop', isDisabled: false },
            },
            'Did not show finished but keep recording open once playback ended!'
        )
    }

    @test()
    protected static async replaysRecordingFromStartWhenReplayIsClicked() {
        render(<App />)

        await this.chooseRecording(this.museRecordingFile, 'morning.xdf')
        const recording = lastStreamMonitorProps?.recording
        this.endPlayback()
        const numMountsBefore = numStreamMonitorMounts
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }))

        assert.isEqualDeep(
            {
                isSameRecording:
                    lastStreamMonitorProps?.recording === recording,
                numNewMounts: numStreamMonitorMounts - numMountsBefore,
                isPlayingShown:
                    screen.queryByText('Playing morning.xdf') !== null,
            },
            { isSameRecording: true, numNewMounts: 1, isPlayingShown: true },
            'Did not replay recording from start when replay was clicked!'
        )
    }

    @test('in minutes', 83, 300, '1:23 / 5:00')
    @test('in hours', 3725, 7200, '1:02:05 / 2:00:00')
    @test('from start', 0, 9, '0:00 / 0:09')
    protected static async showsPlaybackPositionOutOfTotal(
        elapsedSeconds: number,
        totalSeconds: number,
        expected: string
    ) {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(elapsedSeconds, totalSeconds)

        assert.isTruthy(
            screen.queryByText(expected),
            'Did not show playback position out of total!'
        )
    }

    @test()
    protected static async seeksWherePlotsAreScrubbed() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        act(() => lastStreamMonitorProps?.onPlaybackSeek?.(42.5))

        assert.isEqualDeep(
            {
                seekSeconds: lastStreamMonitorProps?.playbackSeek?.seconds,
                value: this.positionSlider.value,
            },
            { seekSeconds: 42.5, value: '42.5' },
            'Did not seek where plots were scrubbed!'
        )
    }

    @test()
    protected static async forgetsPlaybackPositionOnReplay() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.endPlayback()
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }))

        assert.isNull(
            screen.queryByText('1:23 / 5:00'),
            'Did not forget playback position on replay!'
        )
    }

    @test()
    protected static async forgetsPlaybackPositionOfPreviousRecording() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
        await this.chooseRecording()

        assert.isNull(
            screen.queryByText('1:23 / 5:00'),
            'Did not forget playback position of previous recording!'
        )
    }

    @test()
    protected static async showsPlaybackPositionOnSlider() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)

        assert.isEqualDeep(
            {
                value: this.positionSlider.value,
                max: this.positionSlider.max,
            },
            { value: '83', max: '300' },
            'Did not show playback position on slider!'
        )
    }

    @test()
    protected static async showsDraggedPositionFrozenWhileHeld() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.pressPositionSlider()
        const numMountsBefore = numStreamMonitorMounts
        this.dragPositionSliderTo(150)

        assert.isEqualDeep(
            {
                value: this.positionSlider.value,
                isDraggedPositionShown:
                    screen.queryByText('2:30 / 5:00') !== null,
                seekSeconds: lastStreamMonitorProps?.playbackSeek?.seconds,
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                numNewMounts: numStreamMonitorMounts - numMountsBefore,
            },
            {
                value: '150',
                isDraggedPositionShown: true,
                seekSeconds: 150,
                isPaused: true,
                numNewMounts: 0,
            },
            'Did not show dragged position frozen while held!'
        )
    }

    @test()
    protected static async scrubsInTenthsOfASecond() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.pressPositionSlider()
        this.dragPositionSliderTo(150.4)

        assert.isEqualDeep(
            {
                step: this.positionSlider.step,
                seekSeconds: lastStreamMonitorProps?.playbackSeek?.seconds,
                isWholeSecondShown: screen.queryByText('2:30 / 5:00') !== null,
            },
            { step: '0.1', seekSeconds: 150.4, isWholeSecondShown: true },
            'Did not scrub in tenths of a second!'
        )
    }

    @test()
    protected static async followsEachPositionWhileDragging() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.pressPositionSlider()
        this.dragPositionSliderTo(150)
        const numMountsBefore = numStreamMonitorMounts
        this.dragPositionSliderTo(40)

        assert.isEqualDeep(
            {
                seekSeconds: lastStreamMonitorProps?.playbackSeek?.seconds,
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                numNewMounts: numStreamMonitorMounts - numMountsBefore,
            },
            { seekSeconds: 40, isPaused: true, numNewMounts: 0 },
            'Did not follow each position while dragging!'
        )
    }

    @test()
    protected static async playsOnFromPositionChosenWithKeyboard() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.dragPositionSliderTo(84)

        assert.isEqualDeep(
            {
                seekSeconds: lastStreamMonitorProps?.playbackSeek?.seconds,
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
            },
            { seekSeconds: 84, isPaused: false },
            'Did not play on from position chosen with keyboard!'
        )
    }

    @test()
    protected static async playsFromPositionWhereSliderIsReleased() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        const numMountsBefore = numStreamMonitorMounts
        this.dragPositionSliderTo(150)
        this.releasePositionSlider()

        assert.isEqualDeep(
            {
                seekSeconds: lastStreamMonitorProps?.playbackSeek?.seconds,
                numNewMounts: numStreamMonitorMounts - numMountsBefore,
                isPositionShown: screen.queryByText('2:30 / 5:00') !== null,
            },
            { seekSeconds: 150, numNewMounts: 0, isPositionShown: true },
            'Did not play from position where slider was released!'
        )
    }

    @test()
    protected static async playsAgainWhenFinishedRecordingIsRewound() {
        render(<App />)

        await this.chooseRecording(this.museRecordingFile, 'morning.xdf')
        this.reportPlaybackProgress(300, 300)
        this.endPlayback()
        this.dragPositionSliderTo(100)
        this.releasePositionSlider()

        assert.isTruthy(
            screen.queryByText('Playing morning.xdf'),
            'Did not play again when finished recording was rewound!'
        )
    }

    @test()
    protected static async replaysFromStartAfterSeeking() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.dragPositionSliderTo(150)
        this.releasePositionSlider()
        this.endPlayback()
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }))

        assert.isUndefined(
            lastStreamMonitorProps?.playbackSeek,
            'Did not replay from start after seeking!'
        )
    }

    @test()
    protected static async playsNextRecordingFromStartAfterSeeking() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.dragPositionSliderTo(150)
        this.releasePositionSlider()
        this.clickStop()
        await this.chooseRecording()

        assert.isUndefined(
            lastStreamMonitorProps?.playbackSeek,
            'Did not play next recording from start after seeking!'
        )
    }

    @test()
    protected static async freezesPlaybackWhileSliderIsPressed() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        fireEvent.click(screen.getByRole('button', { name: '5×' }))
        this.pressPositionSlider()

        assert.isEqualDeep(
            {
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                speed: this.playbackSpeedState,
            },
            { isPaused: true, speed: { passed: 5, pressed: ['5×'] } },
            'Did not freeze playback while slider was pressed!'
        )
    }

    @test()
    protected static async playsOnWhenSliderIsReleasedWithoutDragging() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        const numMountsBefore = numStreamMonitorMounts
        this.pressPositionSlider()
        this.releasePositionSlider()

        assert.isEqualDeep(
            {
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                numNewMounts: numStreamMonitorMounts - numMountsBefore,
            },
            { isPaused: false, numNewMounts: 0 },
            'Did not play on when slider was released without dragging!'
        )
    }

    @test()
    protected static async playsOnFromDraggedPositionOnceReleased() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.pressPositionSlider()
        this.dragPositionSliderTo(150)
        this.releasePositionSlider()

        assert.isEqualDeep(
            {
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                seekSeconds: lastStreamMonitorProps?.playbackSeek?.seconds,
            },
            { isPaused: false, seekSeconds: 150 },
            'Did not play on from dragged position once released!'
        )
    }

    @test()
    protected static async showsPlotsOfFinishedRecordingAgainOnReplay() {
        let nowMs = 0
        setClock(() => nowMs)
        setFrameScheduler(FakeFrameScheduler.schedule)
        FakeFrameScheduler.resetTestDouble()
        setStreamPlotComponent(FakeStreamPlot)
        setStreamMonitorComponent(StreamMonitor)
        render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        )

        await this.chooseRecording()
        await act(() => FakeFrameScheduler.runFrame())
        nowMs = 5000
        await act(() => FakeFrameScheduler.runFrame())
        const onceFinished = this.numShownPlots
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
        await act(() => FakeFrameScheduler.runFrame())

        assert.isEqualDeep(
            { onceFinished, onReplay: this.numShownPlots },
            { onceFinished: 0, onReplay: 1 },
            'Did not show plots of finished recording again on replay!'
        )
    }

    private static get numShownPlots() {
        return document.querySelectorAll('[data-testid^="stream-plot-"]').length
    }

    @test()
    protected static async offersPauseUntilPlaybackEnds() {
        render(<App />)

        await this.chooseRecording()
        const whilePlaying = this.playbackButtonText
        this.endPlayback()

        assert.isEqualDeep(
            { whilePlaying, onceEnded: this.playbackButtonText },
            { whilePlaying: 'Pause', onceEnded: 'Replay' },
            'Did not offer pause until playback ended!'
        )
    }

    @test()
    protected static async pausesPlaybackWhenPauseIsClicked() {
        render(<App />)

        await this.chooseRecording()
        this.clickPlaybackButton()

        assert.isEqualDeep(
            {
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                button: this.playbackButtonText,
            },
            { isPaused: true, button: 'Play' },
            'Did not pause playback when pause was clicked!'
        )
    }

    @test()
    protected static async playsOnWhenPlayIsClicked() {
        render(<App />)

        await this.chooseRecording()
        const numMountsBefore = numStreamMonitorMounts
        this.clickPlaybackButton()
        this.clickPlaybackButton()

        assert.isEqualDeep(
            {
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                button: this.playbackButtonText,
                numNewMounts: numStreamMonitorMounts - numMountsBefore,
            },
            { isPaused: false, button: 'Pause', numNewMounts: 0 },
            'Did not play on when play was clicked!'
        )
    }

    @test()
    protected static async staysPausedAfterScrubbingWhilePaused() {
        render(<App />)

        await this.chooseRecording()
        this.reportPlaybackProgress(83, 300)
        this.clickPlaybackButton()
        this.pressPositionSlider()
        this.dragPositionSliderTo(150)
        this.releasePositionSlider()

        assert.isEqualDeep(
            {
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                seekSeconds: lastStreamMonitorProps?.playbackSeek?.seconds,
            },
            { isPaused: true, seekSeconds: 150 },
            'Did not stay paused after scrubbing while paused!'
        )
    }

    @test()
    protected static async playsNextRecordingUnpaused() {
        render(<App />)

        await this.chooseRecording()
        this.clickPlaybackButton()
        this.clickStop()
        await this.chooseRecording()

        assert.isEqualDeep(
            {
                isPaused: lastStreamMonitorProps?.isPlaybackPaused,
                button: this.playbackButtonText,
            },
            { isPaused: false, button: 'Pause' },
            'Did not play next recording unpaused!'
        )
    }

    private static get playbackButton() {
        return screen.getByRole('button', { name: /^(Pause|Play|Replay)$/ })
    }

    private static get playbackButtonText() {
        return this.playbackButton.textContent
    }

    private static clickPlaybackButton() {
        fireEvent.click(this.playbackButton)
    }

    private static pressPositionSlider() {
        fireEvent.pointerDown(this.positionSlider)
    }

    private static get positionSlider() {
        return screen.getByRole('slider', {
            name: 'Playback position',
        }) as HTMLInputElement
    }

    private static dragPositionSliderTo(seconds: number) {
        fireEvent.change(this.positionSlider, {
            target: { value: String(seconds) },
        })
    }

    private static releasePositionSlider() {
        fireEvent.pointerUp(this.positionSlider)
    }

    private static reportPlaybackProgress(
        elapsedSeconds: number,
        totalSeconds: number
    ) {
        act(() =>
            lastStreamMonitorProps?.onPlaybackProgress?.({
                elapsedSeconds,
                totalSeconds,
            })
        )
    }

    private static endPlayback() {
        act(() => lastStreamMonitorProps?.onPlaybackEnd?.())
    }

    private static get offeredPlaybackSpeeds() {
        const group = screen.queryByRole('group', { name: 'Playback speed' })

        return [...(group?.querySelectorAll('button') ?? [])].map(
            (button) => button.textContent
        )
    }

    private static get playbackSpeedState() {
        return {
            passed: lastStreamMonitorProps?.playbackSpeed,
            pressed: screen
                .queryAllByRole('button', { pressed: true })
                .map((button) => button.textContent),
        }
    }

    private static async chooseRecording(
        contents = this.museRecordingFile,
        name = 'session.xdf'
    ) {
        const file = { name, arrayBuffer: async () => contents }

        await act(async () => {
            fireEvent.change(this.recordingToPlayInput, {
                target: { files: [file] },
            })
        })
    }

    private static get recordingToPlayInput() {
        return screen.getByLabelText('Recording to play') as HTMLInputElement
    }

    private static get isPlayRecordingOffered() {
        return (
            screen.queryByRole('button', { name: /play xdf recording/i }) !==
            null
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

    private static typeNickname(name: string, value: string) {
        act(() => lastStreamMonitorProps?.onNicknameChange?.(name, value))
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
        return screen.getByRole('button', { name: /^(Connect|Stop|Detecting)/ })
    }

    private static get sessionButtonState() {
        const button = this.sessionButton as HTMLButtonElement
        return { text: button.textContent, isDisabled: button.disabled }
    }

    private static get activeScan() {
        return this.scans.filter((scan) => !scan.isStopped).at(-1)
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

interface FakeScan {
    deviceNames: string[]
    onScanned: (scanned: Record<string, ScannedIdentifier[]>) => void
    isStopped: boolean
}
