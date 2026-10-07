import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen } from '@testing-library/react'

import FakeStreamPlot, {
    passedStreamPlotProps,
    resetStreamPlotProps,
} from '../../../testDoubles/StreamPlot/FakeStreamPlot'
import FakeFrameScheduler from '../../../testDoubles/FrameScheduler/FakeFrameScheduler'
import FakeRetryTimer from '../../../testDoubles/RetryTimer/FakeRetryTimer'
import FakeWebSocket from '../../../testDoubles/WebSocket/FakeWebSocket'
import StreamMonitor, {
    setClock,
    setFrameScheduler,
    setRetryTimer,
    setStreamPlotComponent,
    setWebSocketComponent,
    StreamData,
    streamColors,
    StreamMonitorProps,
} from '../../../ui/components/StreamMonitor'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class StreamMonitorTest extends AbstractPackageTest {
    private static nowMs = 0

    private static readonly deviceName = this.generateId()

    private static readonly streams = [
        { name: this.generateId(), wssPort: 1234 },
        { name: this.generateId(), wssPort: 5678 },
    ]

    private static readonly twoDevices: TestDevice[] = [
        { name: this.generateId(), streams: [this.streams[0]] },
        { name: this.generateId(), streams: [this.streams[1]] },
    ]

    private static readonly twins: TestDevice[] = [
        { name: this.deviceName, streams: [this.streams[0]] },
        { name: this.deviceName, streams: [this.streams[1]] },
    ]

    private static readonly secondTwinKey = `${this.deviceName} #2`

    protected static async beforeEach() {
        await super.beforeEach()

        this.setFakeWebSocket()
        setFrameScheduler(FakeFrameScheduler.schedule)
        FakeFrameScheduler.resetTestDouble()
        this.nowMs = 0
        setClock(() => this.nowMs)
        setRetryTimer(FakeRetryTimer)
        FakeRetryTimer.resetTestDouble()
    }

    @test()
    protected static async rendersTopLevelView() {
        await this.render()

        assert.isTruthy(
            screen.getByTestId('stream-monitor'),
            'Failed to render top-level view!'
        )
    }

    @test()
    protected static async rendersTitleForEachStream() {
        await this.render()

        this.streams.forEach((stream) => {
            const title = screen.getByText(stream.name)

            assert.isTruthy(
                title,
                `Failed to render title for stream ${stream.name}!`
            )
        })
    }

    @test()
    protected static async createsWebSocketClientForEachStream() {
        await this.render()

        assert.isEqualDeep(
            this.streamSocketUrls,
            this.urlsFor(this.streams),
            'WebSocket clients not created with expected URLs!'
        )
    }

    @test()
    protected static async monitorCreatesPlotForEachStream() {
        await this.renderWithFakePlot()

        assert.isEqual(
            passedStreamPlotProps.length,
            this.streams.length,
            'Incorrect number of StreamPlot components created!'
        )
    }

    @test()
    protected static async closesWebSocketForEachStreamOnUnmount() {
        const { unmount } = await this.render()

        await unmount()

        assert.isTrue(
            this.streamSockets.every(
                (socket) => socket.readyState === WebSocket.CLOSED
            ),
            'Did not close a WebSocket for each stream on unmount!'
        )
    }

    @test()
    protected static async doesNotReopenWebSocketsWhenGatewayRepeatsStreams() {
        await this.render()

        this.receiveDeviceStatus(
            this.devicesFor(this.streams.map((stream) => ({ ...stream })))
        )

        assert.isEqual(
            this.streamSocketUrls.length,
            this.streams.length,
            'Reopened WebSockets when gateway repeated streams!'
        )
    }

    @test()
    protected static async reopensWebSocketsWhenGatewayReportsNewPorts() {
        await this.render()

        const newStreams = this.streams.map((stream) => ({
            ...stream,
            wssPort: stream.wssPort + 1,
        }))

        this.receiveDeviceStatus(this.devicesFor(newStreams))

        assert.isEqualDeep(
            {
                numCallsToClose: FakeWebSocket.numCallsToClose,
                callsToConstructor: this.streamSocketUrls,
            },
            {
                numCallsToClose: this.streams.length,
                callsToConstructor: [
                    ...this.urlsFor(this.streams),
                    ...this.urlsFor(newStreams),
                ],
            },
            'Did not reopen WebSockets when gateway reported new ports!'
        )
    }

    @test()
    protected static async passesSamplesFromEachStreamToItsPlot() {
        await this.renderWithFakePlot()

        const chunks = await this.sendChunkToEachStream()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.samples
            ),
            chunks.map((chunk) => chunk.samples),
            'Did not pass samples from each stream to its plot!'
        )
    }

    @test()
    protected static async passesTimestampsFromEachStreamToItsPlot() {
        await this.renderWithFakePlot()

        const chunks = await this.sendChunkToEachStream()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.timestamps
            ),
            chunks.map((chunk) => chunk.timestamps),
            'Did not pass timestamps from each stream to its plot!'
        )
    }

    @test()
    protected static async accumulatesChunksWithinWindow() {
        await this.renderWithFakePlot()

        await this.sendChunk({ samples: [1, 2], timestamps: [0, 1] })
        await this.sendChunk({ samples: [3, 4], timestamps: [2, 3] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3, 4], timestamps: [0, 1, 2, 3] },
            'Did not accumulate chunks within window!'
        )
    }

    @test()
    protected static async dropsSamplesOlderThanTenSecondsByDefault() {
        await this.renderWithFakePlot()

        await this.sendChunk({
            samples: [1, 10, 2, 20, 3, 30],
            timestamps: [0, 1, 2],
        })

        await this.sendChunk({ samples: [4, 40], timestamps: [12] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [3, 30, 4, 40], timestamps: [2, 12] },
            'Did not drop samples older than 10 seconds!'
        )
    }

    @test()
    protected static async dropsSamplesOlderThanWindowSeconds() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), { windowSeconds: 1 })

        await this.sendChunk({ samples: [1, 2, 3], timestamps: [0, 1, 2] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [2, 3], timestamps: [1, 2] },
            'Did not drop samples older than windowSeconds!'
        )
    }

    @test()
    protected static async startsFreshWhenChannelCountChanges() {
        await this.renderWithFakePlot()

        await this.sendChunk({ samples: [1, 2], timestamps: [0, 1] })
        await this.sendChunk({ samples: [10, 20, 30, 40], timestamps: [2, 3] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [10, 20, 30, 40], timestamps: [2, 3] },
            'Did not start fresh when channel count changed!'
        )
    }

    @test()
    protected static async passesWindowSecondsToEachPlot() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), { windowSeconds: 3 })

        assert.isEqualDeep(
            passedStreamPlotProps.map((props) => props.windowSeconds),
            this.streams.map(() => 3),
            'Did not pass windowSeconds to each plot!'
        )
    }

    @test()
    protected static async connectsToDeviceStatusPort() {
        await this.renderBeforeDeviceStatus()

        assert.isTrue(
            FakeWebSocket.callsToConstructor.includes(this.deviceStatusUrl),
            'Did not connect to device status port!'
        )
    }

    @test()
    protected static async showsDisconnectedUntilDeviceStatusArrives() {
        await this.renderBeforeDeviceStatus()

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            'disconnected',
            'Did not show disconnected until device status arrived!'
        )
    }

    @test('disconnected shows disconnected', 'disconnected', 'disconnected')
    @test('connecting shows connecting', 'connecting', 'connecting')
    @test('connected shows connected', 'connected', 'connected')
    @test('streaming shows connected', 'streaming', 'connected')
    protected static async showsDeviceStatusForGatewayState(
        state: string,
        expectedStatus: string
    ) {
        await this.renderBeforeDeviceStatus()

        this.receiveDeviceStatus(this.devicesFor(this.streams), state)

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            expectedStatus,
            `Did not show ${expectedStatus} for ${state} device!`
        )
    }

    @test(
        'disconnected marks card disconnected',
        'disconnected',
        'disconnected'
    )
    @test('connecting marks card connecting', 'connecting', 'connecting')
    @test('connected marks card connected', 'connected', 'connected')
    @test('streaming marks card connected', 'streaming', 'connected')
    protected static async marksDeviceCardWithItsStatus(
        state: string,
        expectedStatus: string
    ) {
        await this.renderBeforeDeviceStatus()

        this.receiveDeviceStatus(this.devicesFor(this.streams), state)

        assert.isEqualDeep(
            this.statusClassesOf(this.deviceName),
            [`stream-monitor__device--${expectedStatus}`],
            `Did not mark device card as ${expectedStatus} for ${state} device!`
        )
    }

    @test()
    protected static async marksDeviceCardDisconnectedUntilDeviceStatusArrives() {
        await this.renderBeforeDeviceStatus()

        assert.isEqualDeep(
            this.statusClassesOf(this.deviceName),
            ['stream-monitor__device--disconnected'],
            'Did not mark device card disconnected until device status arrived!'
        )
    }

    @test()
    protected static async matchesEachDeviceByName() {
        await this.renderBeforeDeviceStatus(this.twoDevices)

        act(() =>
            this.latestDeviceStatusSocket.receive({
                devices: [
                    this.gatewayDeviceFor(this.twoDevices[1], 'streaming'),
                    this.gatewayDeviceFor(this.twoDevices[0], 'connecting'),
                ],
            })
        )

        assert.isEqualDeep(
            this.twoDevices.map((device) => this.deviceStatusOf(device.name)),
            ['connecting', 'connected'],
            'Did not match each device by name!'
        )
    }

    @test()
    protected static async numbersRepeatsOfTheSameDevice() {
        await this.renderBeforeDeviceStatus(this.twins)

        assert.isEqualDeep(
            Array.from(
                document.querySelectorAll('.stream-monitor__device-name'),
                (name) => name.textContent
            ),
            [`${this.deviceName} #1`, `${this.deviceName} #2`],
            'Did not number repeats of the same device!'
        )
    }

    @test()
    protected static async numbersOnlyDevicesThatAreRepeated() {
        await this.renderBeforeDeviceStatus([...this.twins, this.twoDevices[0]])

        assert.isEqualDeep(
            Array.from(
                document.querySelectorAll('.stream-monitor__device-name'),
                (name) => name.textContent
            ),
            [
                `${this.deviceName} #1`,
                `${this.deviceName} #2`,
                this.twoDevices[0].name,
            ],
            'Did not number only devices that are repeated!'
        )
    }

    @test()
    protected static async labelsControlsOfFirstRepeatWithItsNumber() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName, this.deviceName], {
            onRemoveDevice: () => {},
        })

        assert.isEqualDeep(
            {
                identifier:
                    screen.queryByRole('textbox', {
                        name: `${this.deviceName} #1 UUID (optional)`,
                    }) !== null,
                remove:
                    screen.queryByRole('button', {
                        name: `Remove ${this.deviceName} #1`,
                    }) !== null,
            },
            { identifier: true, remove: true },
            'Did not label controls of first repeat with its number!'
        )
    }

    @test()
    protected static async matchesRepeatsOfTheSameDeviceByOrder() {
        await this.renderBeforeDeviceStatus(this.twins)

        this.receiveGatewayDevices([
            this.gatewayDeviceFor(this.twins[0], 'connecting'),
            this.gatewayDeviceFor(this.twins[1], 'streaming'),
        ])

        assert.isEqualDeep(
            {
                statuses: [
                    this.deviceStatusOf(this.deviceName),
                    this.deviceStatusOf(this.secondTwinKey),
                ],
                plots: [
                    this.shownPlotsOf(this.deviceName),
                    this.shownPlotsOf(this.secondTwinKey),
                ],
            },
            {
                statuses: ['connecting', 'connected'],
                plots: [
                    this.plotIdsFor([this.streams[0]]),
                    this.plotIdsFor([this.streams[1]]),
                ],
            },
            'Did not match repeats of the same device by order!'
        )
    }

    @test()
    protected static async showsRepeatDisconnectedWhenGatewayReportsOnlyOne() {
        await this.renderBeforeDeviceStatus(this.twins)

        this.receiveGatewayDevices([
            this.gatewayDeviceFor(this.twins[0], 'streaming'),
        ])

        assert.isEqualDeep(
            [
                this.deviceStatusOf(this.deviceName),
                this.deviceStatusOf(this.secondTwinKey),
            ],
            ['connected', 'disconnected'],
            'Did not show repeat disconnected when gateway reported only one!'
        )
    }

    @test()
    protected static async reportsTypedIdentifierAndRemovalWithKeyOfRepeat() {
        const calls: string[][] = []

        this.setFakeStreamPlot()
        await this.mount([this.deviceName, this.deviceName], {
            identifiers: {
                [this.secondTwinKey]: { label: 'UUID', value: '' },
            },
            onIdentifierChange: (key, typed) => calls.push([key, typed]),
            onRemoveDevice: (key) => calls.push([key]),
        })

        fireEvent.change(this.identifierInput!, { target: { value: 'typed' } })
        fireEvent.click(
            screen.getByRole('button', {
                name: `Remove ${this.secondTwinKey}`,
            })
        )

        assert.isEqualDeep(
            calls,
            [[this.secondTwinKey, 'typed'], [this.secondTwinKey]],
            'Did not report typed identifier and removal with key of repeat!'
        )
    }

    @test()
    protected static async showsDisconnectedWhenDeviceStatusConnectionDrops() {
        await this.renderWithFakePlot()

        await this.dropConnection(this.latestDeviceStatusSocket)

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            'disconnected',
            'Did not show disconnected when device status connection dropped!'
        )
    }

    @test()
    protected static async keepsStreamsWhenDeviceStatusConnectionDrops() {
        await this.renderWithFakePlot()

        await this.dropConnection(this.latestDeviceStatusSocket)

        assert.isEqualDeep(
            this.streams.map(
                (stream) =>
                    screen.queryByTestId(`stream-plot-${stream.name}`) !== null
            ),
            this.streams.map(() => true),
            'Did not keep streams when device status connection dropped!'
        )
    }

    @test()
    protected static async reconnectsToDeviceStatusAfterDrop() {
        await this.renderBeforeDeviceStatus()

        await this.dropConnection(this.latestDeviceStatusSocket)
        this.runPendingRetries()

        assert.isEqual(
            FakeWebSocket.callsToConstructor.filter(
                (url) => url === this.deviceStatusUrl
            ).length,
            2,
            'Did not reconnect to device status after drop!'
        )
    }

    @test()
    protected static async closesDeviceStatusSocketOnUnmount() {
        const { unmount } = await this.renderBeforeDeviceStatus()

        unmount()

        assert.isEqual(
            this.latestDeviceStatusSocket.readyState,
            WebSocket.CLOSED,
            'Did not close device status socket on unmount!'
        )
    }

    @test()
    protected static async showsNameOfEachDevice() {
        this.setFakeStreamPlot()
        await this.render(this.twoDevices)

        assert.isTruthy(
            this.twoDevices.every((device) => screen.getByText(device.name)),
            'Did not show name of each device!'
        )
    }

    @test()
    protected static async showsOnlyNameForDeviceGatewayDoesNotReport() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName])

        this.receiveDeviceStatus([])

        assert.isEqualDeep(
            {
                name: screen.getByText(this.deviceName).textContent,
                hasStreamCount:
                    screen
                        .getByTestId(`device-${this.deviceName}`)
                        .querySelector('.stream-monitor__device-meta') !== null,
                status: this.deviceStatusOf(this.deviceName),
                numSockets: this.streamSocketUrls.length,
            },
            {
                name: this.deviceName,
                hasStreamCount: false,
                status: 'disconnected',
                numSockets: 0,
            },
            'Did not show only name for device gateway does not report!'
        )
    }

    @test()
    protected static async showsConnectingWhileConnectingUntilGatewayReports() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { isConnecting: true })

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            'connecting',
            'Did not show connecting while connecting until gateway reports!'
        )
    }

    @test('disconnected device shows disconnected', 'disconnected')
    @test('connecting device shows connecting', 'connecting')
    @test('streaming device shows connected', 'streaming', 'connected')
    protected static async showsDeviceReportedStatusWhileConnecting(
        state: string,
        expectedStatus = state
    ) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { isConnecting: true })

        this.receiveDeviceStatus(this.devicesFor(this.streams), state)

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            expectedStatus,
            `Did not show device-reported ${expectedStatus} while connecting!`
        )
    }

    @test()
    protected static async rechecksDeviceStatusAsSoonAsConnectingEnds() {
        this.setFakeStreamPlot()
        const { rerender } = await this.mount([this.deviceName], {
            isConnecting: true,
        })
        const numBefore = this.numDeviceStatusSockets

        await rerender(
            <StreamMonitor
                deviceNames={[this.deviceName]}
                deviceStatusPort={this.deviceStatusPort}
                isConnecting={false}
            />
        )

        assert.isEqualDeep(
            {
                numNewSockets: this.numDeviceStatusSockets - numBefore,
                numRetriesWaitedFor: FakeRetryTimer.delaysMs.length,
            },
            { numNewSockets: 1, numRetriesWaitedFor: 0 },
            'Did not recheck device status as soon as connecting ended!'
        )
    }

    @test()
    protected static async showsStatusLeftOfDeviceName() {
        await this.renderBeforeDeviceStatus()

        const status = screen
            .getByTestId(`device-${this.deviceName}`)
            .querySelector('.stream-monitor__device-status')!

        assert.isTrue(
            Boolean(
                status.compareDocumentPosition(
                    screen.getByText(this.deviceName)
                ) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
            'Did not show status left of device name!'
        )
    }

    @test()
    protected static async showsIdentifierInputRightOfStatusWhenDisconnected() {
        await this.renderBeforeDeviceStatus()

        const status = screen
            .getByTestId(`device-${this.deviceName}`)
            .querySelector('.stream-monitor__device-status')!

        assert.isTrue(
            Boolean(
                status.compareDocumentPosition(this.identifierInput!) &
                Node.DOCUMENT_POSITION_FOLLOWING
            ),
            'Did not show identifier input right of status when disconnected!'
        )
    }

    @test('connecting hides identifier input', 'connecting')
    @test('connected hides identifier input', 'connected')
    @test('streaming hides identifier input', 'streaming')
    protected static async hidesIdentifierInputUnlessDisconnected(
        state: string
    ) {
        await this.renderBeforeDeviceStatus()

        this.receiveDeviceStatus(this.devicesFor(this.streams), state)

        assert.isEqual(
            this.identifierInput,
            null,
            `Did not hide identifier input for ${state} device!`
        )
    }

    @test()
    protected static async showsIdentifierPassedForDevice() {
        const uuid = this.generateId()

        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            identifiers: {
                [this.deviceName]: { label: 'UUID', value: uuid },
            },
        })

        assert.isEqual(
            (this.identifierInput as HTMLInputElement).value,
            uuid,
            'Did not show identifier passed for device!'
        )
    }

    @test()
    protected static async reportsTypedIdentifierWithDeviceName() {
        const changes: [string, string][] = []
        const uuid = this.generateId()

        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            onIdentifierChange: (name, typed) => changes.push([name, typed]),
        })

        fireEvent.change(this.identifierInput!, { target: { value: uuid } })

        assert.isEqualDeep(
            changes,
            [[this.deviceName, uuid]],
            'Did not report typed identifier with device name!'
        )
    }

    @test()
    protected static async letsIdentifierBeEditedWithChangeHandler() {
        await this.renderBeforeDeviceStatus()

        assert.isFalse(
            (this.identifierInput as HTMLInputElement).readOnly,
            'Did not let identifier be edited with change handler!'
        )
    }

    @test()
    protected static async showsFilledIdentifierAsReadOnlyWithoutChangeHandler() {
        const uuid = this.generateId()

        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            onIdentifierChange: undefined,
            identifiers: {
                [this.deviceName]: { label: 'UUID', value: uuid },
            },
        })

        const input = this.identifierInput as HTMLInputElement

        assert.isEqualDeep(
            { value: input?.value, isReadOnly: input?.readOnly },
            { value: uuid, isReadOnly: true },
            'Did not show filled identifier as read-only without change handler!'
        )
    }

    @test('connecting keeps locked identifier', 'connecting')
    @test('streaming keeps locked identifier', 'streaming')
    protected static async keepsReadOnlyIdentifierWhenNotDisconnected(
        state: string
    ) {
        const uuid = this.generateId()

        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            onIdentifierChange: undefined,
            identifiers: {
                [this.deviceName]: { label: 'UUID', value: uuid },
            },
        })

        this.receiveDeviceStatus(this.devicesFor(this.streams), state)

        assert.isEqual(
            (this.identifierInput as HTMLInputElement | null)?.value,
            uuid,
            `Did not keep filled identifier when locked and ${state}!`
        )
    }

    @test('empty identifier is removed when locked', '')
    @test('blank identifier is removed when locked', '   ')
    protected static async removesUnfilledIdentifierInputWithoutChangeHandler(
        uuid: string
    ) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            onIdentifierChange: undefined,
            identifiers: {
                [this.deviceName]: { label: 'UUID', value: uuid },
            },
        })

        assert.isEqual(
            this.identifierInput,
            null,
            'Did not remove unfilled identifier input without change handler!'
        )
    }

    @test()
    protected static async hidesRememberedIdentifiersUntilInputIsFocused() {
        await this.mountWithRememberedIdentifiers()

        assert.isEqualDeep(
            this.offeredIdentifiers,
            [],
            'Showed remembered identifiers before input was focused!'
        )
    }

    @test()
    protected static async showsRememberedIdentifiersWhenInputIsFocused() {
        await this.mountWithRememberedIdentifiers()

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredIdentifiers,
            this.remembered,
            'Did not show remembered identifiers when input was focused!'
        )
    }

    @test()
    protected static async showsRememberedIdentifiersWhenFocusedInputIsClicked() {
        await this.mountWithRememberedIdentifiers()

        this.chooseRememberedIdentifier(this.remembered[0])
        fireEvent.click(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredIdentifiers,
            this.remembered,
            'Did not show remembered identifiers when focused input was clicked!'
        )
    }

    @test()
    protected static async showsNoDropdownWithoutRememberedIdentifiers() {
        await this.renderBeforeDeviceStatus()

        fireEvent.focus(this.identifierInput!)

        assert.isEqual(
            screen.queryByRole('listbox'),
            null,
            'Showed a dropdown without remembered identifiers!'
        )
    }

    @test()
    protected static async keepsShowingEveryRememberedIdentifierWhileTyping() {
        await this.mountWithRememberedIdentifiers({
            identifiers: {
                [this.deviceName]: { label: 'UUID', value: 'unrelated' },
            },
        })

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredIdentifiers,
            this.remembered,
            'Did not keep showing every remembered identifier while typing!'
        )
    }

    @test()
    protected static async reportsChosenRememberedIdentifierWithDeviceKey() {
        const changes: [string, string][] = []

        await this.mountWithRememberedIdentifiers({
            onIdentifierChange: (key, chosen) => changes.push([key, chosen]),
        })

        this.chooseRememberedIdentifier(this.remembered[1])

        assert.isEqualDeep(
            changes,
            [[this.deviceName, this.remembered[1]]],
            'Did not report chosen remembered identifier with device key!'
        )
    }

    @test()
    protected static async hidesRememberedIdentifiersOnceOneIsChosen() {
        await this.mountWithRememberedIdentifiers()

        this.chooseRememberedIdentifier(this.remembered[0])

        assert.isEqualDeep(
            this.offeredIdentifiers,
            [],
            'Did not hide remembered identifiers once one was chosen!'
        )
    }

    @test()
    protected static async hidesRememberedIdentifiersWhenInputLosesFocus() {
        await this.mountWithRememberedIdentifiers()

        fireEvent.focus(this.identifierInput!)
        fireEvent.blur(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredIdentifiers,
            [],
            'Did not hide remembered identifiers when input lost focus!'
        )
    }

    @test()
    protected static async keepsInputFocusedWhilePressingRememberedIdentifier() {
        await this.mountWithRememberedIdentifiers()

        fireEvent.focus(this.identifierInput!)

        const wasAllowedToBlur = fireEvent.mouseDown(
            screen.getByRole('option', { name: this.remembered[0] })
        )

        assert.isFalse(
            wasAllowedToBlur,
            'Did not keep input focused while pressing remembered identifier!'
        )
    }

    @test()
    protected static async showsNoRememberedIdentifiersWithoutChangeHandler() {
        await this.mountWithRememberedIdentifiers({
            onIdentifierChange: undefined,
            identifiers: {
                [this.deviceName]: { label: 'UUID', value: this.generateId() },
            },
        })

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredIdentifiers,
            [],
            'Showed remembered identifiers without change handler!'
        )
    }

    @test()
    protected static async showsRememberedIdentifiersOnlyForTheirOwnDevice() {
        this.setFakeStreamPlot()
        await this.mount(
            this.twoDevices.map((device) => device.name),
            {
                rememberedIdentifiers: {
                    [this.twoDevices[1].name]: this.remembered,
                },
            }
        )

        const [first, second] = screen.getAllByRole('textbox')

        fireEvent.focus(first)
        const offeredToFirst = this.offeredIdentifiers
        fireEvent.blur(first)
        fireEvent.focus(second)

        assert.isEqualDeep(
            { offeredToFirst, offeredToSecond: this.offeredIdentifiers },
            { offeredToFirst: [], offeredToSecond: this.remembered },
            'Did not show remembered identifiers only for their own device!'
        )
    }

    @test()
    protected static async reportsForgottenIdentifierWithDeviceName() {
        const forgotten: [string, string][] = []

        this.setFakeStreamPlot()
        await this.mount([this.deviceName, this.deviceName], {
            identifiers: {
                [this.secondTwinKey]: { label: 'UUID', value: '' },
            },
            rememberedIdentifiers: { [this.deviceName]: this.remembered },
            onForgetIdentifier: (name, identifier) =>
                forgotten.push([name, identifier]),
        })

        fireEvent.focus(this.identifierInput!)
        fireEvent.click(this.forgetButtonFor(this.remembered[1])!)

        assert.isEqualDeep(
            forgotten,
            [[this.deviceName, this.remembered[1]]],
            'Did not report forgotten identifier with device name!'
        )
    }

    @test()
    protected static async placesForgetButtonRightOfItsIdentifier() {
        await this.mountWithRememberedIdentifiers({
            onForgetIdentifier: () => {},
        })

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            Array.from(screen.getByRole('listbox').children, (row) =>
                Array.from(row.children, (control) =>
                    control.getAttribute('role')
                )
            ),
            this.remembered.map(() => ['option', null]),
            'Did not place forget button right of its identifier!'
        )
    }

    @test()
    protected static async keepsDropdownOpenAndValueWhenForgetting() {
        const changes: string[] = []

        await this.mountWithRememberedIdentifiers({
            onForgetIdentifier: () => {},
            onIdentifierChange: (_, value) => changes.push(value),
        })

        fireEvent.focus(this.identifierInput!)
        fireEvent.click(this.forgetButtonFor(this.remembered[0])!)

        assert.isEqualDeep(
            { offered: this.offeredIdentifiers, changes },
            { offered: this.remembered, changes: [] },
            'Did not keep dropdown open and value when forgetting!'
        )
    }

    @test()
    protected static async keepsInputFocusedWhilePressingForgetButton() {
        await this.mountWithRememberedIdentifiers({
            onForgetIdentifier: () => {},
        })

        fireEvent.focus(this.identifierInput!)

        assert.isFalse(
            fireEvent.mouseDown(this.forgetButtonFor(this.remembered[0])!),
            'Did not keep input focused while pressing forget button!'
        )
    }

    @test()
    protected static async showsNoForgetButtonWithoutForgetHandler() {
        await this.mountWithRememberedIdentifiers()

        fireEvent.focus(this.identifierInput!)

        assert.isEqual(
            this.forgetButtonFor(this.remembered[0]),
            null,
            'Showed a forget button without forget handler!'
        )
    }

    @test()
    protected static async showsRememberedIdentifiersOfDeviceNameToEachRepeat() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName, this.deviceName], {
            identifiers: {
                [this.deviceName]: { label: 'UUID', value: '' },
                [this.secondTwinKey]: { label: 'UUID', value: '' },
            },
            rememberedIdentifiers: { [this.deviceName]: this.remembered },
        })

        const [first, second] = screen.getAllByRole('textbox')

        fireEvent.focus(first)
        const offeredToFirst = this.offeredIdentifiers
        fireEvent.blur(first)
        fireEvent.focus(second)

        assert.isEqualDeep(
            { offeredToFirst, offeredToSecond: this.offeredIdentifiers },
            {
                offeredToFirst: this.remembered,
                offeredToSecond: this.remembered,
            },
            'Did not show remembered identifiers of device name to each repeat!'
        )
    }

    @test()
    protected static async showsIdentifierInputOnlyForDevicesWithIdentifierEntry() {
        this.setFakeStreamPlot()
        await this.mount(
            this.twoDevices.map((device) => device.name),
            {
                identifiers: {
                    [this.twoDevices[1].name]: { label: 'UUID', value: '' },
                },
            }
        )

        assert.isEqualDeep(
            screen
                .queryAllByRole('textbox')
                .map((input) => input.getAttribute('aria-label')),
            [`${this.twoDevices[1].name} UUID (optional)`],
            'Did not show identifier input only for devices with a identifier entry!'
        )
    }

    @test()
    protected static async labelsIdentifierInputWithGivenLabel() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            identifiers: {
                [this.deviceName]: { label: 'Serial number', value: '' },
            },
        })

        const input = this.identifierInput as HTMLInputElement

        assert.isEqualDeep(
            {
                name: input?.getAttribute('aria-label'),
                placeholder: input?.placeholder,
            },
            {
                name: `${this.deviceName} Serial number (optional)`,
                placeholder: 'Serial number (optional)',
            },
            'Did not label identifier input with given label!'
        )
    }

    @test()
    protected static async showsNoConnectButtonOnDevice() {
        await this.renderBeforeDeviceStatus()

        assert.isEqual(
            screen.queryByRole('button', { name: 'Connect' }),
            null,
            'Showed a connect button on device!'
        )
    }

    @test()
    protected static async ignoresGatewayDevicesNotChosen() {
        this.setFakeStreamPlot()
        await this.mount([this.twoDevices[0].name])

        this.receiveDeviceStatus(this.twoDevices)

        assert.isEqualDeep(
            {
                plots: passedStreamPlotProps.map((props) => props.name),
                urls: this.streamSocketUrls,
            },
            {
                plots: [this.streams[0].name],
                urls: this.urlsFor([this.streams[0]]),
            },
            'Did not ignore gateway devices not chosen!'
        )
    }

    @test()
    protected static async passesChannelNamesWithoutTypePrefix() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName])

        this.receiveGatewayDevices([
            {
                deviceName: this.deviceName,
                state: 'streaming',
                streams: [
                    {
                        type: 'EEG',
                        listenPort: 1234,
                        channelNames: ['EEG_TP10', 'AUX', 'PPG_RED'],
                        sampleRateHz: 256,
                    },
                ],
            },
        ])

        assert.isEqualDeep(
            this.latestPlotPropsFor('EEG')?.channelNames,
            ['TP10', 'AUX', 'PPG_RED'],
            'Did not pass channel names without type prefix!'
        )
    }

    @test()
    protected static async removesDeviceByNameWhenItsRemoveButtonIsClicked() {
        const removed: string[] = []

        this.setFakeStreamPlot()
        await this.render(this.twoDevices, {
            onRemoveDevice: (name) => removed.push(name),
        })

        const secondName = this.twoDevices[1].name
        fireEvent.click(
            screen.getByRole('button', { name: `Remove ${secondName}` })
        )

        assert.isEqualDeep(
            removed,
            [secondName],
            'Did not remove device by name when its remove button was clicked!'
        )
    }

    @test()
    protected static async showsNoRemoveButtonWithoutRemoveHandler() {
        this.setFakeStreamPlot()
        await this.render(this.twoDevices)

        assert.isLength(
            screen.queryAllByRole('button', { name: /^Remove / }),
            0,
            'Showed remove button without remove handler!'
        )
    }

    @test()
    protected static async hidesPlotsWhenDeviceCardIsClicked() {
        await this.renderWithFakePlot()

        this.clickDeviceCard()

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            [],
            'Did not hide plots when device card was clicked!'
        )
    }

    @test()
    protected static async hidesPlotsWhenDeviceNameIsClicked() {
        await this.renderWithFakePlot()

        fireEvent.click(screen.getByText(this.deviceName))

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            [],
            'Did not hide plots when device name was clicked!'
        )
    }

    @test()
    protected static async showsPlotsAgainWhenDeviceCardIsClickedAgain() {
        await this.renderWithFakePlot()

        this.clickDeviceCard()
        this.clickDeviceCard()

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            this.plotIdsFor(this.streams),
            'Did not show plots again when device card was clicked again!'
        )
    }

    @test()
    protected static async keepsPlotsWhenPlotIsClicked() {
        await this.renderWithFakePlot()

        fireEvent.click(
            screen.getByTestId(`stream-plot-${this.streams[0].name}`)
        )

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            this.plotIdsFor(this.streams),
            'Did not keep plots when plot was clicked!'
        )
    }

    @test()
    protected static async keepsPlotsWhenGapBetweenPlotsIsClicked() {
        await this.renderWithFakePlot()

        fireEvent.click(
            screen.getByTestId(`stream-plot-${this.streams[0].name}`)
                .parentElement!
        )

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            this.plotIdsFor(this.streams),
            'Did not keep plots when gap between plots was clicked!'
        )
    }

    @test()
    protected static async keepsPlotsWhenIdentifierInputIsClicked() {
        await this.renderWithFakePlot()
        await this.dropConnection(this.latestDeviceStatusSocket)

        fireEvent.click(this.identifierInput!)

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            this.plotIdsFor(this.streams),
            'Did not keep plots when identifier input was clicked!'
        )
    }

    @test()
    protected static async keepsPlotsWhenRemoveButtonIsClicked() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            onRemoveDevice: () => {},
        })

        fireEvent.click(
            screen.getByRole('button', { name: `Remove ${this.deviceName}` })
        )

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            this.plotIdsFor(this.streams),
            'Did not keep plots when remove button was clicked!'
        )
    }

    @test()
    protected static async hidesPlotsOfClickedDeviceOnly() {
        this.setFakeStreamPlot()
        await this.render(this.twoDevices)

        this.clickDeviceCard(this.twoDevices[0].name)

        assert.isEqualDeep(
            this.twoDevices.map((device) => this.shownPlotsOf(device.name)),
            [[], this.plotIdsFor(this.twoDevices[1].streams)],
            'Did not hide plots of clicked device only!'
        )
    }

    @test()
    protected static async groupsStreamsUnderTheirDevice() {
        this.setFakeStreamPlot()
        await this.render(this.twoDevices)

        assert.isEqualDeep(
            this.twoDevices.map((device) =>
                Array.from(
                    screen
                        .getByTestId(`device-${device.name}`)
                        .querySelectorAll('[data-testid^="stream-plot-"]'),
                    (plot) => plot.getAttribute('data-testid')
                )
            ),
            this.twoDevices.map((device) =>
                device.streams.map((stream) => `stream-plot-${stream.name}`)
            ),
            'Did not group streams under their device!'
        )
    }

    @test()
    protected static async givesEachStreamItsOwnColorAcrossDevices() {
        this.setFakeStreamPlot()
        await this.render(this.twoDevices)

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.color
            ),
            [...streamColors.slice(0, this.streams.length)],
            'Did not give each stream its own color across devices!'
        )
    }

    @test()
    protected static async givesStreamsWithSameNameSameColorAcrossDevices() {
        this.setFakeStreamPlot()

        await this.render([
            {
                name: this.generateId(),
                streams: [
                    { name: 'EEG', wssPort: 1111 },
                    { name: 'PPG', wssPort: 2222 },
                ],
            },
            {
                name: this.generateId(),
                streams: [
                    { name: 'ACCEL', wssPort: 3333 },
                    { name: 'EEG', wssPort: 4444 },
                    { name: 'PPG', wssPort: 5555 },
                ],
            },
        ])

        assert.isEqualDeep(
            this.latestColorsByPort,
            {
                1111: streamColors[0],
                2222: streamColors[1],
                3333: streamColors[2],
                4444: streamColors[0],
                5555: streamColors[1],
            },
            'Did not give streams with the same name the same color!'
        )
    }

    @test()
    protected static async connectsToStreamsOfEveryDevice() {
        await this.render(this.twoDevices)

        assert.isEqualDeep(
            this.streamSocketUrls,
            this.urlsFor(this.streams),
            'Did not connect to streams of every device!'
        )
    }

    @test()
    protected static async passesDownsamplingToEachPlot() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            downsampling: 'heavy',
        })

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.downsampling
            ),
            this.streams.map(() => 'heavy' as const),
            'Did not pass downsampling to each plot!'
        )
    }

    @test()
    protected static async streamTypeDownsamplingOverridesMonitorValue() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            downsampling: 'heavy',
            streamOptions: {
                [this.streams[0].name]: { downsampling: 'light' },
            },
        })

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.downsampling
            ),
            ['light', 'heavy'],
            'Stream type downsampling did not override monitor value!'
        )
    }

    @test()
    protected static async givesEachStreamItsOwnColor() {
        this.setFakeStreamPlot()
        await this.render()

        const colors = this.streams.map(
            (stream) => this.latestPlotPropsFor(stream.name)?.color
        )

        assert.isEqualDeep(
            colors,
            [...streamColors.slice(0, this.streams.length)],
            'Did not give each stream its own color!'
        )
    }

    @test()
    protected static async passesYRangeForStreamTypeToItsPlot() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            streamOptions: {
                [this.streams[0].name]: { yRange: { min: 0, max: 100 } },
            },
        })

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.yRange
            ),
            [{ min: 0, max: 100 }, undefined],
            'Did not pass y-range for stream type to its plot!'
        )
    }

    @test()
    protected static async detectsPeaksAtGatewaySampleRateForStreamType() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            streamOptions: {
                [this.streams[0].name]: { detectPeaks: { channels: ['A'] } },
            },
        })

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.detectPeaks
            ),
            [{ channels: ['A'], sampleRate: this.sampleRateHz }, undefined],
            'Did not detect peaks at gateway sample rate for stream type!'
        )
    }

    @test()
    protected static async rendersMessagesOncePerFrame() {
        await this.renderWithFakePlot()

        this.receiveChunk({ samples: [1], timestamps: [0] })
        this.receiveChunk({ samples: [2], timestamps: [1] })
        this.receiveChunk({ samples: [3], timestamps: [2] })

        const numFrames = FakeFrameScheduler.pending.length
        const rendersBeforeFrame = this.plotRendersFor(this.streams[0].name)

        await this.runFrame()

        assert.isEqualDeep(
            {
                numFrames,
                newRenders:
                    this.plotRendersFor(this.streams[0].name) -
                    rendersBeforeFrame,
                chunk: this.latestFirstPlotChunk,
            },
            {
                numFrames: 1,
                newRenders: 1,
                chunk: { samples: [1, 2, 3], timestamps: [0, 1, 2] },
            },
            'Did not render messages once per frame!'
        )
    }

    @test()
    protected static async keepsPlotsMovingWithoutNewData() {
        await this.renderWithFakePlot()

        this.nowMs = 1000
        await this.sendChunk({ samples: [1], timestamps: [5] })

        this.nowMs = 3000
        await this.runFrame()

        assert.isEqual(
            this.latestPlotPropsFor(this.streams[0].name)?.nowTimestamp,
            7,
            'Did not keep plots moving without new data!'
        )
    }

    @test()
    protected static async sharesTimeAxisAcrossStreams() {
        await this.renderWithFakePlot()

        this.receiveChunk({ samples: [1], timestamps: [10] })
        this.receiveChunk({ samples: [2], timestamps: [8] }, 1)
        await this.runFrame()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.nowTimestamp
            ),
            [10, 10],
            'Did not share time axis across streams!'
        )
    }

    @test()
    protected static async stopsAnimatingOnceOldDataIsGone() {
        await this.renderWithFakePlot()

        await this.sendChunk({ samples: [1], timestamps: [5] })

        this.nowMs = 5000
        await this.runFrame()
        const framesWhileVisible = FakeFrameScheduler.pending.length

        this.nowMs = 10001
        await this.runFrame()

        assert.isEqualDeep(
            {
                framesWhileVisible,
                framesAfterGone: FakeFrameScheduler.pending.length,
            },
            { framesWhileVisible: 1, framesAfterGone: 0 },
            'Did not stop animating once old data was gone!'
        )
    }

    @test()
    protected static async reconnectsOneSecondAfterUnexpectedClose() {
        await this.render()

        await this.dropConnection(this.streamSockets[0])
        this.runPendingRetries()

        assert.isEqualDeep(
            {
                delaysMs: FakeRetryTimer.delaysMs,
                callsToConstructor: this.streamSocketUrls,
            },
            {
                delaysMs: [1000],
                callsToConstructor: [
                    ...this.urlsFor(this.streams),
                    ...this.urlsFor([this.streams[0]]),
                ],
            },
            'Did not reconnect one second after unexpected close!'
        )
    }

    @test()
    protected static async retriesEverySecondTenTimesThenEveryTenSeconds() {
        await this.render()

        await this.failToReconnect(12)

        assert.isEqualDeep(
            FakeRetryTimer.delaysMs,
            [...Array(10).fill(1000), 10000, 10000],
            'Did not retry every second ten times then every ten seconds!'
        )
    }

    @test()
    protected static async retriesEverySecondAgainAfterReconnecting() {
        await this.render()

        await this.failToReconnect(11)

        this.runPendingRetries()
        this.openSocket(this.latestSocketFor(this.streams[0]))
        await this.dropConnection(this.latestSocketFor(this.streams[0]))

        assert.isEqual(
            FakeRetryTimer.delaysMs.at(-1),
            1000,
            'Did not retry every second again after reconnecting!'
        )
    }

    @test()
    protected static async doesNotReconnectAfterUnmount() {
        const { unmount } = await this.render()

        await this.dropConnection(this.streamSockets[0])
        await unmount()

        assert.isEqualDeep(
            {
                pending: FakeRetryTimer.pending.length,
                delaysMs: FakeRetryTimer.delaysMs,
            },
            { pending: 0, delaysMs: [1000] },
            'Reconnected after unmount!'
        )
    }

    @test()
    protected static async doesNotReconnectAfterPortsChange() {
        await this.render()

        this.receiveDeviceStatus(
            this.devicesFor(
                this.streams.map((stream) => ({
                    ...stream,
                    wssPort: stream.wssPort + 1,
                }))
            )
        )

        assert.isEqual(
            FakeRetryTimer.delaysMs.length,
            0,
            'Reconnected after ports changed!'
        )
    }

    @test()
    protected static async retriesAllDisconnectedStreamsTogether() {
        await this.render()

        await this.dropConnection(...this.streamSockets)
        this.runPendingRetries()

        assert.isEqualDeep(
            {
                delaysMs: FakeRetryTimer.delaysMs,
                callsToConstructor: this.streamSocketUrls,
            },
            {
                delaysMs: [1000],
                callsToConstructor: [
                    ...this.urlsFor(this.streams),
                    ...this.urlsFor(this.streams),
                ],
            },
            'Did not retry all disconnected streams together!'
        )
    }

    @test()
    protected static async retriesEverySecondWhenAnyStreamReconnects() {
        await this.render()

        await this.failToReconnect(11, this.streams)

        this.runPendingRetries()
        this.openSocket(this.latestSocketFor(this.streams[0]))
        await this.dropConnection(this.latestSocketFor(this.streams[1]))

        const numCallsBeforeRetry = FakeWebSocket.callsToConstructor.length
        this.runPendingRetries()

        assert.isEqualDeep(
            {
                delayMs: FakeRetryTimer.delaysMs.at(-1),
                retried: FakeWebSocket.callsToConstructor
                    .slice(numCallsBeforeRetry)
                    .filter((url) => url !== this.deviceStatusUrl),
            },
            {
                delayMs: 1000,
                retried: this.urlsFor([this.streams[1]]),
            },
            'Did not retry every second when any stream reconnected!'
        )
    }

    private static async failToReconnect(
        times: number,
        streams = [this.streams[0]]
    ) {
        await this.dropConnection(
            ...streams.map((stream) => this.latestSocketFor(stream))
        )

        for (let i = 1; i < times; i++) {
            this.runPendingRetries()

            await this.dropConnection(
                ...streams.map((stream) => this.latestSocketFor(stream))
            )
        }
    }

    private static async dropConnection(...sockets: FakeWebSocket[]) {
        await act(async () => {
            sockets.forEach((socket) => socket.dropConnection())
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    private static openSocket(socket: FakeWebSocket) {
        act(() => socket.open())
    }

    private static runPendingRetries() {
        act(() => FakeRetryTimer.runPending())
    }

    private static latestSocketFor(stream: TestStream) {
        const url = this.urlsFor([stream])[0]
        const index = FakeWebSocket.callsToConstructor.lastIndexOf(url)
        return FakeWebSocket.instances[index]
    }

    private static plotRendersFor(name: string) {
        return passedStreamPlotProps.filter((props) => props.name === name)
            .length
    }

    private static async sendChunk(chunk: StreamData) {
        this.receiveChunk(chunk)
        await this.runFrame()
    }

    private static receiveChunk(chunk: StreamData, streamIndex = 0) {
        this.streamSockets[streamIndex].receive(chunk)
    }

    private static async runFrame() {
        await act(() => FakeFrameScheduler.runFrame())
    }

    private static get latestFirstPlotChunk() {
        const props = this.latestPlotPropsFor(this.streams[0].name)
        return { samples: props?.samples, timestamps: props?.timestamps }
    }

    private static async sendChunkToEachStream() {
        const chunks = this.streams.map(() => ({
            samples: [Math.random(), Math.random()],
            timestamps: [Math.random(), Math.random()],
        }))

        this.streamSockets.forEach((socket, i) => socket.receive(chunks[i]))
        await this.runFrame()

        return chunks
    }

    private static get latestColorsByPort() {
        return Object.fromEntries(
            passedStreamPlotProps.map((props) => [
                (props as { wssPort?: number }).wssPort,
                props.color,
            ])
        )
    }

    private static latestPlotPropsFor(name: string) {
        return passedStreamPlotProps
            .filter((props) => props.name === name)
            .at(-1)
    }

    private static readonly deviceStatusPort = 4321

    private static get deviceStatusUrl() {
        return `ws://localhost:${this.deviceStatusPort}`
    }

    private static get latestDeviceStatusSocket() {
        const index = FakeWebSocket.callsToConstructor.lastIndexOf(
            this.deviceStatusUrl
        )
        return FakeWebSocket.instances[index]
    }

    private static get numDeviceStatusSockets() {
        return FakeWebSocket.callsToConstructor.filter(
            (url) => url === this.deviceStatusUrl
        ).length
    }

    private static clickDeviceCard(deviceName = this.deviceName) {
        fireEvent.click(screen.getByTestId(`device-${deviceName}`))
    }

    private static shownPlotsOf(deviceName: string) {
        return Array.from(
            screen
                .getByTestId(`device-${deviceName}`)
                .querySelectorAll('[data-testid^="stream-plot-"]'),
            (plot) => plot.getAttribute('data-testid')
        )
    }

    private static plotIdsFor(streams: TestStream[]) {
        return streams.map((stream) => `stream-plot-${stream.name}`)
    }

    private static readonly remembered = [this.generateId(), this.generateId()]

    private static async mountWithRememberedIdentifiers(
        props: Partial<StreamMonitorProps> = {}
    ) {
        this.setFakeStreamPlot()
        return await this.mount([this.deviceName], {
            rememberedIdentifiers: { [this.deviceName]: this.remembered },
            ...props,
        })
    }

    private static chooseRememberedIdentifier(identifier: string) {
        fireEvent.focus(this.identifierInput!)
        fireEvent.click(screen.getByRole('option', { name: identifier }))
    }

    private static forgetButtonFor(identifier: string) {
        return screen.queryByRole('button', { name: `Forget ${identifier}` })
    }

    private static get offeredIdentifiers() {
        return screen
            .queryAllByRole('option')
            .map((option) => option.textContent)
    }

    private static get identifierInput() {
        return screen.queryByRole('textbox', {
            name: /\(optional\)$/,
        })
    }

    private static get streamSockets() {
        return FakeWebSocket.instances.filter(
            (_, i) =>
                FakeWebSocket.callsToConstructor[i] !== this.deviceStatusUrl
        )
    }

    private static get streamSocketUrls() {
        return FakeWebSocket.callsToConstructor.filter(
            (url) => url !== this.deviceStatusUrl
        )
    }

    private static async renderBeforeDeviceStatus(
        devices = this.devicesFor(this.streams)
    ) {
        this.setFakeStreamPlot()
        return await this.mount(devices.map((device) => device.name))
    }

    private static receiveDeviceStatus(
        devices: TestDevice[],
        state = 'streaming'
    ) {
        this.receiveGatewayDevices(
            devices.map((device) => this.gatewayDeviceFor(device, state))
        )
    }

    private static receiveGatewayDevices(devices: unknown[]) {
        act(() => this.latestDeviceStatusSocket.receive({ devices }))
    }

    private static readonly sampleRateHz = 64

    private static gatewayDeviceFor(device: TestDevice, state = 'streaming') {
        return {
            deviceName: device.name,
            state,
            streams: device.streams.map((stream) => ({
                type: stream.name,
                listenPort: stream.wssPort,
                channelNames: [],
                sampleRateHz: this.sampleRateHz,
            })),
        }
    }

    private static statusClassesOf(deviceName: string) {
        return Array.from(
            screen.getByTestId(`device-${deviceName}`).classList
        ).filter((className) =>
            className.startsWith('stream-monitor__device--')
        )
    }

    private static deviceStatusOf(deviceName: string) {
        return (
            screen
                .getByTestId(`device-${deviceName}`)
                .querySelector('.stream-monitor__device-status')
                ?.getAttribute('aria-label') ?? undefined
        )
    }

    private static devicesFor(streams: TestStream[]): TestDevice[] {
        return [{ name: this.deviceName, streams }]
    }

    private static urlsFor(streams: TestStream[]) {
        return streams.map((stream) => `ws://localhost:${stream.wssPort}`)
    }

    private static setFakeWebSocket() {
        setWebSocketComponent(FakeWebSocket as any)
        FakeWebSocket.resetTestDouble()
    }

    private static setFakeStreamPlot() {
        setStreamPlotComponent(FakeStreamPlot)
        resetStreamPlotProps()
    }

    private static async renderWithFakePlot() {
        this.setFakeStreamPlot()
        await this.render()
    }

    private static async render(
        devices = this.devicesFor(this.streams),
        props: Partial<StreamMonitorProps> = {}
    ) {
        const result = await this.mount(
            devices.map((device) => device.name),
            props
        )
        this.receiveDeviceStatus(devices)

        return result
    }

    private static async mount(
        deviceNames: string[],
        props: Partial<StreamMonitorProps> = {}
    ) {
        return await render(
            <StreamMonitor
                deviceNames={deviceNames}
                deviceStatusPort={this.deviceStatusPort}
                onIdentifierChange={() => {}}
                identifiers={Object.fromEntries(
                    deviceNames.map((name) => [
                        name,
                        { label: 'UUID', value: '' },
                    ])
                )}
                {...props}
            />
        )
    }
}

interface TestDevice {
    name: string
    streams: TestStream[]
}

interface TestStream {
    name: string
    wssPort: number
}
