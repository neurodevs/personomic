import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import FakeStreamPlot, {
    numStreamPlotMounts,
    passedStreamPlotProps,
    resetStreamPlotProps,
} from '../../../testDoubles/StreamPlot/FakeStreamPlot'
import FakeFrameScheduler from '../../../testDoubles/FrameScheduler/FakeFrameScheduler'
import FakePpgDetector from '../../../testDoubles/PpgDetector/FakePpgDetector'
import FakeRetryTimer from '../../../testDoubles/RetryTimer/FakeRetryTimer'
import FakeWebSocket from '../../../testDoubles/WebSocket/FakeWebSocket'
import StreamMonitor, {
    PlaybackProgress,
    setClock,
    setFrameScheduler,
    setRetryTimer,
    setStreamPlotComponent,
    setWebSocketComponent,
    endedPlaybackColor,
    StreamData,
    streamColors,
    StreamMonitorProps,
} from '../../../ui/components/StreamMonitor'
import { DescElement, Recording } from '../../../functions/readXdfRecording'
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
    protected static async keepsSamplesForHeartRateWindowLongerThanPlotWindow() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            windowSeconds: 1,
            streamOptions: {
                [this.streams[0].name]: {
                    detectPeaks: { heartRateWindowSeconds: 2 },
                },
            },
        })

        const chunk = { samples: [1, 2, 3, 4], timestamps: [0, 1, 2, 3] }
        this.streamSockets.forEach((socket) => socket.receive(chunk))
        await this.runFrame()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.timestamps
            ),
            [
                [1, 2, 3],
                [2, 3],
            ],
            'Did not keep samples for heart rate window longer than plot window!'
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
    protected static async passesDeviceWindowSecondsToItsPlots() {
        this.setFakeStreamPlot()
        await this.render(this.twoDevices, {
            windowSeconds: 3,
            windowSecondsByDevice: { [this.twoDevices[1].name]: 120 },
        })

        assert.isEqualDeep(
            this.latestWindowSecondsByStream,
            [3, 120],
            'Did not pass device windowSeconds to its plots!'
        )
    }

    @test()
    protected static async changesWindowOfOnlyThePlotThatAsked() {
        await this.renderWithFakePlot()

        this.chooseWindowSeconds(30)

        assert.isEqualDeep(
            this.latestWindowSecondsByStream,
            [30, 10],
            'Did not change window of only the plot that asked!'
        )
    }

    @test()
    protected static async prefersChosenWindowOverDeviceWindow() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            windowSecondsByDevice: { [this.deviceName]: 120 },
        })

        this.chooseWindowSeconds(30)

        assert.isEqualDeep(
            this.latestWindowSecondsByStream,
            [30, 120],
            'Did not prefer chosen window over device window!'
        )
    }

    @test()
    protected static async changesWindowOfEveryPlotFromHeader() {
        await this.renderWithFakePlot()

        this.chooseWindowForAllGraphs('30s')

        assert.isEqualDeep(
            this.latestWindowSecondsByStream,
            [30, 30],
            'Did not change window of every plot from header!'
        )
    }

    @test()
    protected static async overridesDeviceWindowFromHeader() {
        this.setFakeStreamPlot()
        await this.render(this.twoDevices, {
            windowSecondsByDevice: { [this.twoDevices[1].name]: 120 },
        })

        this.chooseWindowForAllGraphs('30s')

        assert.isEqualDeep(
            this.latestWindowSecondsByStream,
            [30, 30],
            'Did not override device window from header!'
        )
    }

    @test()
    protected static async replacesEachPlotsOwnWindowFromHeader() {
        await this.renderWithFakePlot()

        this.chooseWindowSeconds(60)
        this.chooseWindowForAllGraphs('30s')

        assert.isEqualDeep(
            this.latestWindowSecondsByStream,
            [30, 30],
            "Did not replace each plot's own window from header!"
        )
    }

    @test()
    protected static async letsPlotChangeItsOwnWindowAfterHeader() {
        await this.renderWithFakePlot()

        this.chooseWindowForAllGraphs('30s')
        this.chooseWindowSeconds(60)

        assert.isEqualDeep(
            this.latestWindowSecondsByStream,
            [60, 30],
            'Did not let plot change its own window after header!'
        )
    }

    @test()
    protected static async showsWindowSharedByAllGraphsInHeader() {
        await this.renderWithFakePlot()

        assert.isEqual(
            this.monitorHeader,
            'All graphs · 10s window',
            'Did not show window shared by all graphs in header!'
        )
    }

    @test()
    protected static async showsMixedWindowsInHeaderWhenGraphsDiffer() {
        await this.renderWithFakePlot()

        this.chooseWindowSeconds(30)

        assert.isEqual(
            this.monitorHeader,
            'All graphs · Mixed windows',
            'Did not show mixed windows in header when graphs differ!'
        )
    }

    @test()
    protected static async showsDefaultWindowInHeaderBeforeStreamsAreReported() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { windowSeconds: 30 })

        assert.isEqual(
            this.monitorHeader,
            'All graphs · 30s window',
            'Did not show default window in header before streams were reported!'
        )
    }

    @test()
    protected static async showsNoHeaderWithoutDevices() {
        this.setFakeStreamPlot()
        await this.mount([])

        assert.isEqual(
            this.monitorHeader,
            undefined,
            'Showed header without devices!'
        )
    }

    @test()
    protected static async showsWholeSessionAsSoonAsAllDataIsChosenFromHeader() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), { windowSeconds: 1 })

        await this.sendChunk({ samples: [1, 2, 3], timestamps: [0, 1, 2] })
        this.chooseWindowForAllGraphs('All')

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3], timestamps: [0, 1, 2] },
            'Did not show whole session as soon as all data was chosen from header!'
        )
    }

    @test()
    protected static async keepsSamplesForChosenWindow() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), { windowSeconds: 1 })

        this.chooseWindowSeconds(2)
        await this.sendChunk({
            samples: [1, 2, 3, 4],
            timestamps: [0, 1, 2, 3],
        })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [2, 3, 4], timestamps: [1, 2, 3] },
            'Did not keep samples for chosen window!'
        )
    }

    @test()
    protected static async showsWholeSessionAsSoonAsAllWindowIsChosen() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), { windowSeconds: 1 })

        await this.sendChunk({ samples: [1, 2, 3], timestamps: [0, 1, 2] })
        this.chooseWindowSeconds(Infinity)

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3], timestamps: [0, 1, 2] },
            'Did not show whole session as soon as all window was chosen!'
        )
    }

    @test()
    protected static async showsEarlierSamplesWhenLongerWindowIsChosen() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), { windowSeconds: 1 })

        await this.sendChunk({ samples: [1, 2, 3], timestamps: [0, 1, 2] })
        this.chooseWindowSeconds(5)
        await this.sendChunk({ samples: [4], timestamps: [3] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3, 4], timestamps: [0, 1, 2, 3] },
            'Did not show earlier samples when longer window was chosen!'
        )
    }

    @test()
    protected static async keepsSessionWhenEmptyChunkArrives() {
        await this.renderWithFakePlot()

        await this.sendChunk({ samples: [1, 2], timestamps: [0, 1] })
        await this.sendChunk({ samples: [], timestamps: [] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2], timestamps: [0, 1] },
            'Did not keep session when empty chunk arrived!'
        )
    }

    @test()
    protected static async keepsEverySampleForAllWindow() {
        await this.renderWithFakePlot()

        this.chooseWindowSeconds(Infinity)
        await this.sendChunk({ samples: [1, 2, 3], timestamps: [0, 100, 1000] })

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3], timestamps: [0, 100, 1000] },
            'Did not keep every sample for all window!'
        )
    }

    @test()
    protected static async showsStreamsOfDeviceQuickestFirst() {
        await this.mount([this.deviceName])

        this.receiveGatewayDevices([
            this.gatewayDeviceWithRates([
                { type: 'Slow', sampleRateHz: 0 },
                { type: 'Quick', sampleRateHz: 256 },
                { type: 'Medium', sampleRateHz: 64 },
            ]),
        ])

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            ['stream-plot-Quick', 'stream-plot-Medium', 'stream-plot-Slow'],
            'Did not show streams of device quickest first!'
        )
    }

    @test()
    protected static async keepsGatewayOrderForEquallyQuickStreams() {
        await this.mount([this.deviceName])

        this.receiveGatewayDevices([
            this.gatewayDeviceWithRates([
                { type: 'First', sampleRateHz: 64 },
                { type: 'Second', sampleRateHz: 64 },
            ]),
        ])

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            ['stream-plot-First', 'stream-plot-Second'],
            'Did not keep gateway order for equally quick streams!'
        )
    }

    @test()
    protected static async keepsStreamColorsWhenSortedQuickestFirst() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName])

        this.receiveGatewayDevices([
            this.gatewayDeviceWithRates([
                { type: 'Slow', sampleRateHz: 0 },
                { type: 'Quick', sampleRateHz: 256 },
            ]),
        ])

        assert.isEqualDeep(
            ['Slow', 'Quick'].map(
                (name) => this.latestPlotPropsFor(name)?.color
            ),
            [streamColors[0], streamColors[1]],
            'Did not keep stream colors when sorted quickest first!'
        )
    }

    @test()
    protected static async keepsAnimatingWhileDataIsWithinDeviceWindow() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            windowSecondsByDevice: { [this.deviceName]: 120 },
        })

        await this.sendChunk({ samples: [1], timestamps: [5] })

        this.nowMs = 60000
        await this.runFrame()
        const framesWhileVisible = FakeFrameScheduler.pending.length

        this.nowMs = 120001
        await this.runFrame()

        assert.isEqualDeep(
            {
                framesWhileVisible,
                framesAfterGone: FakeFrameScheduler.pending.length,
            },
            { framesWhileVisible: 1, framesAfterGone: 0 },
            'Did not keep animating while data was within device window!'
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
    @test('reconnecting shows reconnecting', 'reconnecting', 'reconnecting')
    @test('disconnecting shows disconnecting', 'disconnecting', 'disconnecting')
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

    @test()
    protected static async showsResumingAfterReconnectUntilDataArrivesAgain() {
        await this.renderWithFakePlot()
        await this.sendChunkToEachStream()

        this.receiveDeviceStatus(this.devicesFor(this.streams), 'reconnecting')
        this.receiveDeviceStatus(this.devicesFor(this.streams), 'streaming')
        const beforeData = this.deviceStatusOf(this.deviceName)

        await this.sendChunk({ samples: [1, 2], timestamps: [10, 11] })

        assert.isEqualDeep(
            { beforeData, afterData: this.deviceStatusOf(this.deviceName) },
            { beforeData: 'resuming', afterData: 'connected' },
            'Did not show resuming after a reconnect until data arrived again!'
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

    @test(
        'not yet connected device shows connecting',
        'disconnected',
        'connecting'
    )
    @test('connecting device shows connecting', 'connecting')
    @test('connected device shows connected', 'connected')
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

    @test('streaming device shows disconnecting', 'streaming', 'disconnecting')
    @test('connected device shows disconnecting', 'connected', 'disconnecting')
    @test(
        'connecting device shows disconnecting',
        'connecting',
        'disconnecting'
    )
    @test('disconnecting device shows disconnecting', 'disconnecting')
    @test('disconnected device shows disconnected', 'disconnected')
    protected static async showsDisconnectingWhileStoppingUntilDisconnected(
        state: string,
        expectedStatus = state
    ) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { isStopping: true })

        this.receiveDeviceStatus(this.devicesFor(this.streams), state)

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            expectedStatus,
            `Did not show ${expectedStatus} for ${state} device while stopping!`
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

    @test()
    protected static async showsIdentifierReportedByDeviceLeftBlank() {
        await this.mountLockedWithIdentifier('')

        this.receiveGatewayDevices([
            {
                ...this.gatewayDeviceFor(this.devicesFor(this.streams)[0]),
                identifier: 'reported-uuid',
            },
        ])

        assert.isEqual(
            (this.identifierInput as HTMLInputElement)?.value,
            'reported-uuid',
            'Did not show the identifier reported by a device left blank!'
        )
    }

    @test()
    protected static async keepsGivenIdentifierOverReportedOne() {
        await this.mountLockedWithIdentifier('given-uuid')

        this.receiveGatewayDevices([
            {
                ...this.gatewayDeviceFor(this.devicesFor(this.streams)[0]),
                identifier: 'reported-uuid',
            },
        ])

        assert.isEqual(
            (this.identifierInput as HTMLInputElement)?.value,
            'given-uuid',
            'Did not keep the given identifier over the reported one!'
        )
    }

    @test()
    protected static async passesOnEachIdentifierReportedByDevice() {
        const reported: [string, string][] = []
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            onIdentifierReported: (key, identifier) =>
                reported.push([key, identifier]),
        })

        this.receiveGatewayDevices([
            {
                ...this.gatewayDeviceFor(this.devicesFor(this.streams)[0]),
                identifier: 'reported-uuid',
            },
        ])

        assert.isEqualDeep(
            reported,
            [[this.deviceName, 'reported-uuid']],
            'Did not pass on each identifier reported by the device!'
        )
    }

    @test()
    protected static async showsRememberedIdentifierOfDeviceLeftBlank() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            onIdentifierChange: undefined,
            identifiers: {
                [this.deviceName]: { label: 'UUID', value: '' },
            },
            reportedIdentifiers: { [this.deviceName]: 'remembered-uuid' },
        })

        assert.isEqual(
            (this.identifierInput as HTMLInputElement)?.value,
            'remembered-uuid',
            'Did not show the remembered identifier of a device left blank!'
        )
    }

    private static async mountLockedWithIdentifier(value: string) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            onIdentifierChange: undefined,
            identifiers: {
                [this.deviceName]: { label: 'UUID', value },
            },
        })
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
    protected static async reportsTypedNicknameWithDeviceKey() {
        const changes: [string, string][] = []

        this.setFakeStreamPlot()
        await this.mount([this.deviceName, this.deviceName], {
            nicknames: { [this.deviceName]: 'Alice' },
            onNicknameChange: (key, typed) => changes.push([key, typed]),
        })

        fireEvent.change(this.nicknameInputOf(this.secondTwinKey)!, {
            target: { value: 'Bob' },
        })

        assert.isEqualDeep(
            changes,
            [[this.secondTwinKey, 'Bob']],
            'Did not report typed nickname with device key!'
        )
    }

    @test()
    protected static async reportsStreamsTurnedOffWithDeviceKey() {
        const changes: [string, string[]][] = []

        this.setFakeStreamPlot()
        await this.mount(['Muse S Gen 2', 'Muse S Gen 2'], {
            disabledStreams: { 'Muse S Gen 2 #2': ['Gyroscope'] },
            onDisabledStreamsChange: (key, streams) =>
                changes.push([key, streams]),
        })

        fireEvent.click(
            screen.getByRole('button', { name: 'Muse S Gen 2 #2 settings' })
        )
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Muse S Gen 2 #2 PPG' })
        )

        assert.isEqualDeep(
            changes,
            [['Muse S Gen 2 #2', ['PPG', 'Gyroscope']]],
            'Did not report streams turned off with device key!'
        )
    }

    @test()
    protected static async reportsExgTypeChosenWithDeviceKey() {
        const changes: [string, string][] = []

        this.setFakeStreamPlot()
        await this.mount(['OpenBCI Cyton', 'OpenBCI Cyton'], {
            exgTypes: { 'OpenBCI Cyton #2': 'EEG' },
            onDisabledStreamsChange: () => {},
            onExgTypeChange: (key, exgType) => changes.push([key, exgType]),
        })

        fireEvent.click(
            screen.getByRole('button', { name: 'OpenBCI Cyton #2 settings' })
        )
        const select = screen.getByRole('combobox', {
            name: 'OpenBCI Cyton #2 ExG type',
        }) as HTMLSelectElement
        const shown = select.value
        fireEvent.change(select, { target: { value: 'EGG' } })

        assert.isEqualDeep(
            { shown, changes },
            { shown: 'EEG', changes: [['OpenBCI Cyton #2', 'EGG']] },
            'Did not report ExG type chosen with device key!'
        )
    }

    @test()
    protected static async offersEditableNicknameEvenWithoutIdentifierEntry() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            identifiers: {},
            onNicknameChange: () => {},
        })

        const input = this.nicknameInput as HTMLInputElement | null

        assert.isEqualDeep(
            { value: input?.value, isReadOnly: input?.readOnly },
            { value: '', isReadOnly: false },
            'Did not offer editable nickname without identifier entry!'
        )
    }

    @test('connecting hides nickname input', 'connecting')
    @test('streaming hides nickname input', 'streaming')
    protected static async hidesNicknameInputUnlessDisconnected(state: string) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { onNicknameChange: () => {} })

        this.receiveDeviceStatus(this.devicesFor(this.streams), state)

        assert.isEqual(
            this.nicknameInput,
            null,
            `Did not hide nickname input for ${state} device!`
        )
    }

    @test('connecting keeps locked nickname', 'connecting')
    @test('streaming keeps locked nickname', 'streaming')
    protected static async showsFilledNicknameAsReadOnlyWithoutChangeHandler(
        state: string
    ) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            nicknames: { [this.deviceName]: 'Alice' },
        })

        this.receiveDeviceStatus(this.devicesFor(this.streams), state)
        const input = this.nicknameInput as HTMLInputElement | null

        assert.isEqualDeep(
            { value: input?.value, isReadOnly: input?.readOnly },
            { value: 'Alice', isReadOnly: true },
            `Did not show filled nickname as read-only when locked and ${state}!`
        )
    }

    @test('empty nickname is removed when locked', '')
    @test('blank nickname is removed when locked', '   ')
    protected static async removesUnfilledNicknameInputWithoutChangeHandler(
        nickname: string
    ) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            nicknames: { [this.deviceName]: nickname },
        })

        assert.isEqual(
            this.nicknameInput,
            null,
            'Did not remove unfilled nickname input without change handler!'
        )
    }

    @test()
    protected static async collapsesXdfDescriptionByDefault() {
        await this.showLiveStreamDescribedBy([
            { name: 'nickname', value: 'Alice' },
        ])

        assert.isEqualDeep(
            {
                isExpanded:
                    this.descriptionToggle?.getAttribute('aria-expanded'),
                isAliceShown: screen.queryByText('Alice') !== null,
            },
            { isExpanded: 'false', isAliceShown: false },
            'Did not collapse XDF description by default!'
        )
    }

    @test()
    protected static async showsXdfDescriptionOfLiveStreamWhenExpanded() {
        await this.showLiveStreamDescribedBy([
            { name: 'nickname', value: 'Alice' },
            {
                name: 'channels',
                children: [
                    {
                        name: 'channel',
                        children: [{ name: 'label', value: 'TP9' }],
                    },
                ],
            },
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownDescription,
            {
                headings: [this.deviceName, this.streams[0].name],
                fields: ['nickname', 'channels'],
                values: ['Alice'],
            },
            'Did not show XDF description of live stream when expanded!'
        )
    }

    @test()
    protected static async showsXdfDescriptionOfRecordedStreamsWhenExpanded() {
        const [first, second] = this.recording.devices[0].streams

        await this.play({
            devices: [
                {
                    deviceName: this.deviceName,
                    streams: [
                        {
                            ...first,
                            desc: [{ name: 'nickname', value: 'Alice' }],
                        },
                        {
                            ...second,
                            desc: [
                                {
                                    name: 'manufacturer',
                                    value: 'Interaxon Inc.',
                                },
                            ],
                        },
                    ],
                },
            ],
        })

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownDescription,
            {
                headings: [this.deviceName, first.type, second.type],
                fields: ['nickname', 'manufacturer'],
                values: ['Alice', 'Interaxon Inc.'],
            },
            'Did not show XDF description of recorded streams when expanded!'
        )
    }

    @test()
    protected static async collapsesXdfDescriptionWhenToggledAgain() {
        await this.showLiveStreamDescribedBy([
            { name: 'nickname', value: 'Alice' },
        ])

        fireEvent.click(this.descriptionToggle!)
        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            {
                isExpanded:
                    this.descriptionToggle?.getAttribute('aria-expanded'),
                isAliceShown: screen.queryByText('Alice') !== null,
            },
            { isExpanded: 'false', isAliceShown: false },
            'Did not collapse XDF description when toggled again!'
        )
    }

    @test()
    protected static async showsChannelsAsTableWithFieldsAsColumns() {
        await this.showLiveStreamDescribedBy([
            this.channelsDesc([
                { label: 'TP9', unit: 'microvolt', type: 'EEG' },
                { label: 'AF7', unit: 'microvolt', type: 'EEG' },
            ]),
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownTable,
            {
                columns: ['label', 'type', 'unit'],
                rows: [
                    ['TP9', 'EEG', 'microvolt'],
                    ['AF7', 'EEG', 'microvolt'],
                ],
            },
            'Did not show channels as table with fields as columns!'
        )
    }

    @test()
    protected static async dimsColumnsWhereEveryChannelHasSameValue() {
        await this.showLiveStreamDescribedBy([
            this.channelsDesc([
                { label: 'TP9', type: 'EEG', unit: 'microvolt' },
                { label: 'AF7', type: 'EEG', unit: 'millivolt' },
                { label: 'AUX', type: 'EEG' },
            ]),
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.dimmedColumns,
            ['type'],
            'Did not dim columns where every channel has same value!'
        )
    }

    @test()
    protected static async dimsNoColumnsOfLoneChannel() {
        await this.showLiveStreamDescribedBy([
            this.channelsDesc([{ label: 'TP9', type: 'EEG' }]),
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.dimmedColumns,
            [],
            'Dimmed columns of lone channel!'
        )
    }

    @test()
    protected static async leavesCellBlankForFieldAChannelLacks() {
        await this.showLiveStreamDescribedBy([
            this.channelsDesc([
                { label: 'TP9', type: 'EEG' },
                { label: 'AUX', unit: 'microvolt' },
            ]),
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownTable,
            {
                columns: ['label', 'type', 'unit'],
                rows: [
                    ['TP9', 'EEG', ''],
                    ['AUX', '', 'microvolt'],
                ],
            },
            'Did not leave cell blank for field a channel lacks!'
        )
    }

    @test()
    protected static async showsLabelThenTypeThenUnitBeforeOtherFields() {
        await this.showLiveStreamDescribedBy([
            this.channelsDesc([
                {
                    location: 'left ear',
                    unit: 'microvolt',
                    type: 'EEG',
                    label: 'TP9',
                    impedance: 'low',
                },
            ]),
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownTable.columns,
            ['label', 'type', 'unit', 'location', 'impedance'],
            'Did not show label, then type, then unit before other fields!'
        )
    }

    @test()
    protected static async showsFieldsSharedByAllStreamsInBoxAtTop() {
        await this.showLiveStreamsDescribedBy([
            [
                { name: 'manufacturer', value: 'Interaxon Inc.' },
                { name: 'nickname', value: 'Alice' },
                { name: 'units', value: 'microvolt' },
            ],
            [
                { name: 'manufacturer', value: 'Interaxon Inc.' },
                { name: 'nickname', value: 'Alice' },
                { name: 'units', value: 'g' },
            ],
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownDescription,
            {
                headings: [
                    'All streams',
                    this.deviceName,
                    this.streams[0].name,
                    this.streams[1].name,
                ],
                fields: ['manufacturer', 'nickname', 'units', 'units'],
                values: ['Interaxon Inc.', 'Alice', 'microvolt', 'g'],
            },
            'Did not show fields shared by all streams in box at top!'
        )
    }

    @test()
    protected static async leavesOutStreamsWithNothingOfTheirOwn() {
        await this.showLiveStreamsDescribedBy([
            [{ name: 'manufacturer', value: 'Interaxon Inc.' }],
            [{ name: 'manufacturer', value: 'Interaxon Inc.' }],
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownDescription,
            {
                headings: ['All streams'],
                fields: ['manufacturer'],
                values: ['Interaxon Inc.'],
            },
            'Did not leave out streams with nothing of their own!'
        )
    }

    @test()
    protected static async passesUnitOfEachChannelInDescToPlot() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName])

        this.receiveGatewayDevices([
            this.gatewayDeviceWithChannels([
                { label: 'TP9', unit: 'microvolt' },
                { label: 'ACC_X', unit: 'g' },
            ]),
        ])

        assert.isEqualDeep(
            passedStreamPlotProps.at(-1)?.channelUnits,
            ['microvolt', 'g'],
            'Did not pass unit of each channel in desc to plot!'
        )
    }

    @test()
    protected static async passesNoChannelUnitsWithoutChannelsInDesc() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName])

        this.receiveGatewayDevices([
            this.describedGatewayDeviceFor(this.streams[0], [
                { name: 'manufacturer', value: 'Interaxon Inc.' },
            ]),
        ])

        assert.isUndefined(
            passedStreamPlotProps.at(-1)?.channelUnits,
            'Passed channel units without channels in desc!'
        )
    }

    @test()
    protected static async describesStreamsInSameOrderAsTheirPlots() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { isRecording: true })

        const [slow, quick] = this.streams
        const device = this.gatewayDeviceFor(this.devicesFor([slow, quick])[0])

        this.receiveGatewayDevices([
            {
                ...device,
                streams: device.streams.map((stream, index) => ({
                    ...stream,
                    sampleRateHz: [52, 256][index],
                    desc: [{ name: 'manufacturer', value: `Maker ${index}` }],
                })),
            },
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownDescription.headings,
            [this.deviceName, quick.name, slow.name],
            'Did not describe streams in same order as their plots!'
        )
    }

    @test()
    protected static async showsXdfHeaderOfRecordingBeforeItsStreams() {
        const [first, second] = this.recording.devices[0].streams

        await this.play({
            header: [{ name: 'protocol-sha256', value: 'abc123' }],
            devices: [
                {
                    deviceName: this.deviceName,
                    streams: [
                        {
                            ...first,
                            desc: [{ name: 'nickname', value: 'Alice' }],
                        },
                        second,
                    ],
                },
            ],
        })

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownDescription,
            {
                headings: ['File header', this.deviceName, first.type],
                fields: ['protocol-sha256', 'nickname'],
                values: ['abc123', 'Alice'],
            },
            'Did not show XDF header of recording before its streams!'
        )
    }

    @test()
    protected static async collapsesJsonValuesAfterOtherFieldsByDefault() {
        await this.playWithProtocolInHeader()

        assert.isEqualDeep(
            {
                fields: this.shownDescription.fields,
                isExpanded: this.protocolToggle?.getAttribute('aria-expanded'),
                isJsonShown: screen.queryByText(/"a": 1/) !== null,
            },
            {
                fields: ['protocol-sha256', 'protocol'],
                isExpanded: 'false',
                isJsonShown: false,
            },
            'Did not collapse JSON values after other fields by default!'
        )
    }

    @test()
    protected static async prettyPrintsJsonValuesWhenExpanded() {
        await this.playWithProtocolInHeader()

        fireEvent.click(this.protocolToggle!)

        assert.isEqual(
            screen.getByText(/"a": 1/).textContent,
            '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}',
            'Did not pretty print JSON values when expanded!'
        )
    }

    private static async playWithProtocolInHeader() {
        await this.play({
            ...this.recording,
            header: [
                { name: 'protocol', value: '{"a":1,"b":[2]}' },
                { name: 'protocol-sha256', value: 'abc123' },
            ],
        })

        fireEvent.click(this.descriptionToggle!)
    }

    private static get protocolToggle() {
        return screen.queryByRole('button', { name: 'protocol JSON' })
    }

    @test()
    protected static async offersXdfDescriptionOfRecordingWithOnlyAHeader() {
        await this.play({
            ...this.recording,
            header: [{ name: 'protocol', value: '{"a":1}' }],
        })

        assert.isTruthy(
            this.descriptionToggle,
            'Did not offer XDF description of recording with only a header!'
        )
    }

    @test()
    protected static async showsXdfHeaderOfLiveRecording() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            isRecording: true,
            xdfHeader: [{ name: 'protocol-sha256', value: 'abc123' }],
        })

        this.receiveGatewayDevices([
            this.describedGatewayDeviceFor(this.streams[0], []),
        ])

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownDescription,
            {
                headings: ['File header'],
                fields: ['protocol-sha256'],
                values: ['abc123'],
            },
            'Did not show XDF header of live recording!'
        )
    }

    @test()
    protected static async offersOneXdfDescriptionForAllDevices() {
        await this.play({
            ...this.recordingOfTwoDevices,
            header: [{ name: 'protocol-sha256', value: 'abc123' }],
        })

        assert.isEqualDeep(
            {
                numToggles: screen.queryAllByRole('button', {
                    name: 'XDF description',
                }).length,
                isInDeviceCard:
                    this.descriptionToggle?.closest(
                        '[data-testid^="device-"]'
                    ) !== null,
            },
            { numToggles: 1, isInDeviceCard: false },
            'Did not offer one XDF description for all devices!'
        )
    }

    @test()
    protected static async describesStreamsOfAllDevicesUnderTheirDevices() {
        const [first, second] = this.recordingOfTwoDevices.devices

        await this.play({
            devices: [
                {
                    ...first,
                    streams: [
                        {
                            ...first.streams[0],
                            desc: [{ name: 'nickname', value: 'Alice' }],
                        },
                    ],
                },
                {
                    ...second,
                    streams: [
                        {
                            ...second.streams[0],
                            desc: [{ name: 'nickname', value: 'Bob' }],
                        },
                    ],
                },
            ],
        })

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            this.shownDescription,
            {
                headings: [
                    first.deviceName,
                    first.streams[0].type,
                    second.deviceName,
                    second.streams[0].type,
                ],
                fields: ['nickname', 'nickname'],
                values: ['Alice', 'Bob'],
            },
            'Did not describe streams of all devices under their devices!'
        )
    }

    @test()
    protected static async groupsStreamDescriptionsInCardOfTheirDevice() {
        const [first, second] = this.recordingOfTwoDevices.devices

        await this.play({
            devices: [first, second].map((device, index) => ({
                ...device,
                streams: [
                    {
                        ...device.streams[0],
                        desc: [{ name: 'nickname', value: `${index}` }],
                    },
                ],
            })),
        })

        fireEvent.click(this.descriptionToggle!)

        assert.isEqualDeep(
            screen.getAllByRole('group').map((card) =>
                within(card)
                    .getAllByRole('heading')
                    .map((heading) => heading.textContent)
            ),
            [
                [first.deviceName, first.streams[0].type],
                [second.deviceName, second.streams[0].type],
            ],
            'Did not group stream descriptions in card of their device!'
        )
    }

    @test()
    protected static async offersRawXdfToggleBelowXdfDescription() {
        await this.playWithChunks()

        const toggles = screen
            .getAllByRole('button')
            .map((button) => button.textContent)

        assert.isEqual(
            toggles.indexOf('Raw XDF'),
            toggles.indexOf('XDF description') + 1,
            'Did not offer raw XDF toggle below XDF description!'
        )
    }

    @test()
    protected static async collapsesRawXdfByDefault() {
        await this.playWithChunks()

        assert.isEqualDeep(
            {
                isExpanded: this.rawXdfToggle?.getAttribute('aria-expanded'),
                card: this.rawXdfCard,
            },
            { isExpanded: 'false', card: null },
            'Did not collapse raw XDF by default!'
        )
    }

    @test()
    protected static async showsRawXdfCardDirectlyBelowToggleWhenOpened() {
        await this.playWithChunks()

        fireEvent.click(this.rawXdfToggle!)

        assert.isEqual(
            this.rawXdfToggle?.nextElementSibling?.contains(this.rawXdfCard),
            true,
            'Did not show raw XDF card directly below toggle when opened!'
        )
    }

    @test()
    protected static async hidesRawXdfCardWhenToggledAgain() {
        await this.playWithChunks()

        fireEvent.click(this.rawXdfToggle!)
        fireEvent.click(this.rawXdfToggle!)

        assert.isEqual(
            this.rawXdfCard,
            null,
            'Did not hide raw XDF card when toggled again!'
        )
    }

    @test()
    protected static async offersNoRawXdfOfLiveRecording() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { isRecording: true })

        assert.isEqual(
            this.rawXdfToggle,
            null,
            'Offered raw XDF of live recording!'
        )
    }

    private static async playWithChunks() {
        await this.play({
            ...this.recording,
            header: [{ name: 'version', value: '1.0' }],
            chunks: [{ name: 'FileHeader', children: [] }],
        })
    }

    private static get rawXdfCard() {
        return screen.queryByRole('region', { name: 'Raw XDF' })
    }

    @test()
    protected static async offersNoXdfDescriptionOfLiveSessionNotRecording() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName])

        this.receiveGatewayDevices([
            this.describedGatewayDeviceFor(this.streams[0], [
                { name: 'nickname', value: 'Alice' },
            ]),
        ])

        assert.isEqual(
            this.descriptionToggle,
            null,
            'Offered an XDF description of a live session not recording!'
        )
    }

    @test('no desc offers no XDF description', undefined)
    @test('empty desc offers no XDF description', [])
    protected static async offersNoXdfDescriptionWithoutOne(
        desc: DescElement[] | undefined
    ) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { isRecording: true })

        this.receiveGatewayDevices([
            this.describedGatewayDeviceFor(this.streams[0], desc),
        ])

        assert.isEqual(
            this.descriptionToggle,
            null,
            'Offered an XDF description without one!'
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
    protected static async offersScannedFirstThenEveryRememberedIdentifier() {
        await this.mountWithScannedIdentifiers()

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredIdentifiers,
            [
                this.remembered[1],
                'scanned-uuid',
                this.remembered[0],
                this.remembered[1],
            ],
            'Did not offer scanned first, then every remembered identifier!'
        )
    }

    @test()
    protected static async tagsEachScannedIdentifierWithWhereItWasFound() {
        await this.mountWithScannedIdentifiers()

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredSources,
            [
                'Scanned · Muse',
                'Scanned · Muse',
                `Memory · ${this.deviceName}`,
                `Memory · ${this.deviceName}`,
            ],
            'Did not tag each scanned identifier with where it was found!'
        )
    }

    @test()
    protected static async tagsRememberedIdentifiersWithTheirDevice() {
        await this.mountWithRememberedIdentifiers()

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredSources,
            [`Memory · ${this.deviceName}`, `Memory · ${this.deviceName}`],
            'Did not tag remembered identifiers with their device!'
        )
    }

    @test()
    protected static async showsDropdownWithOnlyScannedIdentifiers() {
        await this.mountWithScannedIdentifiers({ rememberedIdentifiers: {} })

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.offeredIdentifiers,
            [this.remembered[1], 'scanned-uuid'],
            'Did not show dropdown with only scanned identifiers!'
        )
    }

    @test()
    protected static async letsOnlyRememberedIdentifiersBeForgotten() {
        await this.mountWithScannedIdentifiers({
            onForgetIdentifier: () => {},
        })

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            {
                scannedAndRemembered:
                    this.forgetButtonFor(this.remembered[1]) !== null,
                onlyScanned: this.forgetButtonFor('scanned-uuid') !== null,
            },
            { scannedAndRemembered: true, onlyScanned: false },
            'Did not let only remembered identifiers be forgotten!'
        )
    }

    @test()
    protected static async reportsChosenScannedIdentifierWithDeviceKey() {
        const changes: [string, string][] = []

        await this.mountWithScannedIdentifiers({
            onIdentifierChange: (key, chosen) => changes.push([key, chosen]),
        })

        this.chooseRememberedIdentifier('scanned-uuid')

        assert.isEqualDeep(
            changes,
            [[this.deviceName, 'scanned-uuid']],
            'Did not report chosen scanned identifier with device key!'
        )
    }

    @test()
    protected static async endsDropdownWithScanningRowWhileScanning() {
        await this.mountWithRememberedIdentifiers({
            scanningDeviceNames: [this.deviceName],
        })

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.dropdownRowTexts.at(-1),
            'Scanning…',
            'Did not end dropdown with a scanning row while scanning!'
        )
    }

    @test()
    protected static async showsScanningRowEvenBeforeAnythingIsFound() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            scanningDeviceNames: [this.deviceName],
        })

        fireEvent.focus(this.identifierInput!)

        assert.isEqualDeep(
            this.dropdownRowTexts,
            ['Scanning…'],
            'Did not show scanning row before anything was found!'
        )
    }

    @test()
    protected static async showsNoScanningRowWhenNotScanning() {
        await this.mountWithRememberedIdentifiers()

        fireEvent.focus(this.identifierInput!)

        assert.isFalse(
            this.dropdownRowTexts.includes('Scanning…'),
            'Showed a scanning row when not scanning!'
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
                    control.getAttribute('role') === 'option'
                        ? 'option'
                        : control
                                .getAttribute('aria-label')
                                ?.startsWith('Forget')
                          ? 'forget'
                          : 'tag'
                )
            ),
            this.remembered.map(() => ['option', 'tag', 'forget']),
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
    protected static async labelsRequiredIdentifierInputAsRequired() {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], {
            identifiers: {
                [this.deviceName]: {
                    label: 'UUID',
                    value: '',
                    isRequired: true,
                },
            },
        })

        const input = this.identifierInput as HTMLInputElement

        assert.isEqualDeep(
            {
                name: input?.getAttribute('aria-label'),
                placeholder: input?.placeholder,
            },
            {
                name: `${this.deviceName} UUID (required)`,
                placeholder: 'UUID (required)',
            },
            'Did not label a required identifier input as required!'
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
    protected static async keepsSamplesForBandPowerWindowLongerThanPlotWindow() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            windowSeconds: 1,
            streamOptions: {
                [this.streams[0].name]: {
                    bandPowers: { windowSeconds: 2 },
                },
            },
        })

        const chunk = { samples: [1, 2, 3, 4], timestamps: [0, 1, 2, 3] }
        this.streamSockets.forEach((socket) => socket.receive(chunk))
        await this.runFrame()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.timestamps
            ),
            [
                [1, 2, 3],
                [2, 3],
            ],
            'Did not keep samples for band power window longer than plot window!'
        )
    }

    @test()
    protected static async derivesBandPowersAtGatewaySampleRateForStreamType() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            streamOptions: {
                [this.streams[0].name]: { bandPowers: { windowSeconds: 4 } },
            },
        })

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.bandPowers
            ),
            [{ windowSeconds: 4, sampleRate: this.sampleRateHz }, undefined],
            'Did not derive band powers at gateway sample rate for stream type!'
        )
    }

    @test()
    protected static async passesUnitsForStreamTypeToItsPlot() {
        this.setFakeStreamPlot()

        await this.render(this.devicesFor(this.streams), {
            streamOptions: {
                [this.streams[0].name]: { units: '°C' },
            },
        })

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.units
            ),
            ['°C', undefined],
            'Did not pass units for stream type to its plot!'
        )
    }

    @test()
    protected static async passesYLimitsForStreamTypeToItsPlot() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            streamOptions: {
                [this.streams[0].name]: { yLimits: { min: 0, max: 100 } },
            },
        })

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.yLimits
            ),
            [{ min: 0, max: 100 }, undefined],
            'Did not pass y-limits for stream type to its plot!'
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
    protected static async sharesMarkedTimestampAcrossStreamsWhilePaused() {
        await this.play(this.recording, { isPlaybackPaused: true })

        this.markTimestamp(101.2, 1)

        assert.isEqualDeep(
            this.latestMarkedTimestamps,
            [101.2, 101.2],
            'Did not share marked timestamp across streams while paused!'
        )
    }

    @test()
    protected static async offersNoTimeMarkingWhilePlaying() {
        await this.play()

        assert.isEqualDeep(
            this.streams.map(
                (stream) =>
                    this.latestPlotPropsFor(stream.name)?.onMarkTimestamp
            ),
            [undefined, undefined],
            'Offered time marking while playing!'
        )
    }

    @test()
    protected static async offersNoTimeMarkingWhenLive() {
        await this.renderWithFakePlot()

        assert.isEqualDeep(
            this.streams.map(
                (stream) =>
                    this.latestPlotPropsFor(stream.name)?.onMarkTimestamp
            ),
            [undefined, undefined],
            'Offered time marking when live!'
        )
    }

    @test()
    protected static async clearsMarkedTimestampWhenPlaybackResumes() {
        const recording = this.recording
        const { rerender } = await this.play(recording, {
            isPlaybackPaused: true,
        })

        this.markTimestamp(101.2)
        await rerender(this.playing(recording, { isPlaybackPaused: false }))
        await rerender(this.playing(recording, { isPlaybackPaused: true }))

        assert.isEqualDeep(
            this.latestMarkedTimestamps,
            [undefined, undefined],
            'Did not clear marked timestamp when playback resumed!'
        )
    }

    @test()
    protected static async offersScrubbingOnlyWhilePaused() {
        const recording = this.recording
        const { rerender } = await this.play(recording, {
            isPlaybackPaused: true,
        })
        const whilePaused = this.latestScrubHandlers

        await rerender(this.playing(recording, { isPlaybackPaused: false }))

        assert.isEqualDeep(
            {
                whilePaused: whilePaused.map((onScrubTo) => typeof onScrubTo),
                whilePlaying: this.latestScrubHandlers,
            },
            {
                whilePaused: ['function', 'function'],
                whilePlaying: [undefined, undefined],
            },
            'Did not offer scrubbing only while paused!'
        )
    }

    @test()
    protected static async seeksToScrubbedTimeSinceRecordingStart() {
        const seekSeconds = await this.scrubPausedPlaybackTo(102.5, 101, 90)

        assert.isEqualDeep(
            seekSeconds,
            [2.5, 1, 0],
            'Did not seek to scrubbed time since recording start!'
        )
    }

    @test()
    protected static async seeksNoFurtherThanRecordingEnd() {
        const seekSeconds = await this.scrubPausedPlaybackTo(200)

        assert.isEqualDeep(
            seekSeconds,
            [3],
            'Did not seek no further than recording end!'
        )
    }

    @test()
    protected static async passesRecordingStartAsSessionStart() {
        await this.play(this.recording, { isPlaybackPaused: true })

        assert.isEqualDeep(
            this.streams.map(
                (stream) =>
                    this.latestPlotPropsFor(stream.name)?.sessionStartTimestamp
            ),
            [100, 100],
            'Did not pass recording start as session start!'
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

    @test()
    protected static async opensNoSocketsWhilePlayingRecording() {
        await this.play()

        assert.isEqualDeep(
            FakeWebSocket.callsToConstructor,
            [],
            'Opened sockets while playing a recording!'
        )
    }

    @test()
    protected static async showsRecordedDevicesAsConnected() {
        await this.play()

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            'connected',
            'Did not show recorded devices as connected!'
        )
    }

    @test()
    protected static async plotsEachRecordedStreamWithItsChannels() {
        await this.play()

        assert.isEqualDeep(
            this.streams.map(
                (stream) => this.latestPlotPropsFor(stream.name)?.channelNames
            ),
            [['A', 'B'], ['C']],
            'Did not plot each recorded stream with its channels!'
        )
    }

    @test()
    protected static async playsSamplesRecordedUpToTimeElapsed() {
        await this.play()

        this.nowMs = 600
        await this.runFrame()

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3, 4], timestamps: [100, 100.5] },
            'Did not play samples recorded up to time elapsed!'
        )
    }

    @test()
    protected static async playsOnFromWhereLastFrameLeftOff() {
        await this.play()

        this.nowMs = 600
        await this.runFrame()
        this.nowMs = 1000
        await this.runFrame()

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3, 4, 5, 6], timestamps: [100, 100.5, 101] },
            'Did not play on from where last frame left off!'
        )
    }

    @test()
    protected static async reportsPlaybackProgressOncePerWholeSecond() {
        const reported: PlaybackProgress[] = []
        await this.play(this.recording, {
            onPlaybackProgress: (progress) => reported.push(progress),
        })

        for (const nowMs of [600, 1000, 1500, 2100]) {
            this.nowMs = nowMs
            await this.runFrame()
        }

        assert.isEqualDeep(
            reported,
            [
                { elapsedSeconds: 0, totalSeconds: 3 },
                { elapsedSeconds: 1, totalSeconds: 3 },
                { elapsedSeconds: 2, totalSeconds: 3 },
            ],
            'Did not report playback progress once per whole second!'
        )
    }

    @test()
    protected static async reportsPlaybackProgressAtPlaybackSpeed() {
        const reported: PlaybackProgress[] = []
        await this.play(this.recording, {
            playbackSpeed: 2,
            onPlaybackProgress: (progress) => reported.push(progress),
        })

        this.nowMs = 1000
        await this.runFrame()

        assert.isEqualDeep(
            reported.at(-1),
            { elapsedSeconds: 2, totalSeconds: 3 },
            'Did not report playback progress at playback speed!'
        )
    }

    @test()
    protected static async reportsNoProgressPastEndOfRecording() {
        const reported: PlaybackProgress[] = []
        await this.play(this.recording, {
            onPlaybackProgress: (progress) => reported.push(progress),
        })

        this.nowMs = 10000
        await this.runFrame()

        assert.isEqualDeep(
            reported.at(-1),
            { elapsedSeconds: 3, totalSeconds: 3 },
            'Reported progress past end of recording!'
        )
    }

    @test()
    protected static async showsSamplesUpToChosenStartOfPlayback() {
        await this.play(this.recording, { playbackSeek: { seconds: 1 } })

        await this.runFrame()

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3, 4, 5, 6], timestamps: [100, 100.5, 101] },
            'Did not show samples up to chosen start of playback!'
        )
    }

    @test()
    protected static async playsOnFromChosenStartAtPlaybackSpeed() {
        await this.play(this.recording, {
            playbackSeek: { seconds: 1 },
            playbackSpeed: 2,
        })

        await this.runFrame()
        this.nowMs = 1000
        await this.runFrame()

        assert.isEqualDeep(
            this.latestPlotPropsFor(this.streams[1].name)?.samples,
            [7, 8],
            'Did not play on from chosen start at playback speed!'
        )
    }

    @test()
    protected static async reportsProgressFromChosenStartOfPlayback() {
        const reported: PlaybackProgress[] = []
        await this.play(this.recording, {
            playbackSeek: { seconds: 2 },
            onPlaybackProgress: (progress) => reported.push(progress),
        })

        await this.runFrame()

        assert.isEqualDeep(
            reported,
            [{ elapsedSeconds: 2, totalSeconds: 3 }],
            'Did not report progress from chosen start of playback!'
        )
    }

    @test()
    protected static async detectsPeaksOverWholeRecordingBeforePlaying() {
        await this.play(this.recording, this.peakDetectionOnFirstStream)

        assert.isEqualDeep(
            FakePpgDetector.callsToRun,
            [
                { rawSignal: [1, 3, 5], timestamps: [100, 100.5, 101] },
                { rawSignal: [2, 4, 6], timestamps: [100, 100.5, 101] },
            ],
            'Did not detect peaks over whole recording before playing!'
        )
    }

    @test()
    protected static async givesPlotsPeaksKnownFromWholeRecording() {
        FakePpgDetector.peakTimestamps = [100.5]
        await this.play(this.recording, this.peakDetectionOnFirstStream)

        await this.runFrame()

        assert.isEqualDeep(
            this.streams.map(
                (stream) =>
                    this.latestPlotPropsFor(stream.name)?.knownPeakTimestamps
            ),
            [[[100.5], [100.5]], undefined],
            'Did not give plots peaks known from whole recording!'
        )
    }

    @test()
    protected static async knowsNoPeaksAheadOfLiveStreams() {
        this.setFakeStreamPlot()
        await this.render(this.devicesFor(this.streams), {
            streamOptions: {
                [this.streams[0].name]: { detectPeaks: {} },
            },
        })

        assert.isEqualDeep(
            {
                known: this.latestPlotPropsFor(this.streams[0].name)
                    ?.knownPeakTimestamps,
                numDetections: FakePpgDetector.callsToRun.length,
            },
            { known: undefined, numDetections: 0 },
            'Did not know no peaks ahead of live streams!'
        )
    }

    private static get peakDetectionOnFirstStream() {
        return {
            streamOptions: {
                [this.streams[0].name]: { detectPeaks: {} },
            },
        }
    }

    @test()
    protected static async seeksInPlaceWithoutRemountingPlots() {
        const recording = this.recording
        const { rerender } = await this.play(recording)

        await this.runFrame()
        const numMountsBefore = numStreamPlotMounts
        await rerender(
            this.playing(recording, { playbackSeek: { seconds: 2 } })
        )
        await this.runFrame()

        assert.isEqualDeep(
            {
                first: this.latestFirstPlotChunk.timestamps,
                second: this.latestPlotPropsFor(this.streams[1].name)?.samples,
                numNewMounts: numStreamPlotMounts - numMountsBefore,
            },
            { first: [100, 100.5, 101], second: [7], numNewMounts: 0 },
            'Did not seek in place without remounting plots!'
        )
    }

    @test()
    protected static async showsOnlySamplesUpToPositionWhenSeekingBack() {
        const recording = this.recording
        const { rerender } = await this.play(recording)

        this.nowMs = 2500
        await this.runFrame()
        await rerender(
            this.playing(recording, { playbackSeek: { seconds: 0 } })
        )
        await this.runFrame()

        assert.isEqualDeep(
            {
                first: this.latestFirstPlotChunk.timestamps,
                second: this.latestPlotPropsFor(this.streams[1].name)?.samples,
            },
            { first: [100], second: undefined },
            'Did not show only samples up to position when seeking back!'
        )
    }

    @test()
    protected static async playsOnFromWhereItSeeked() {
        const recording = this.recording
        const { rerender } = await this.play(recording)

        await this.runFrame()
        await rerender(
            this.playing(recording, { playbackSeek: { seconds: 2 } })
        )
        await this.runFrame()
        this.nowMs = 1000
        await this.runFrame()

        assert.isEqualDeep(
            this.latestPlotPropsFor(this.streams[1].name)?.samples,
            [7, 8],
            'Did not play on from where it seeked!'
        )
    }

    @test()
    protected static async reportsProgressOnFromWhereItSeeked() {
        const reported: PlaybackProgress[] = []
        const recording = this.recording
        const onPlaybackProgress = (progress: PlaybackProgress) =>
            reported.push(progress)
        const { rerender } = await this.play(recording, { onPlaybackProgress })

        await this.runFrame()
        await rerender(
            this.playing(recording, {
                onPlaybackProgress,
                playbackSeek: { seconds: 1 },
            })
        )
        await this.runFrame()
        this.nowMs = 1000
        await this.runFrame()

        assert.isEqualDeep(
            reported,
            [
                { elapsedSeconds: 0, totalSeconds: 3 },
                { elapsedSeconds: 2, totalSeconds: 3 },
            ],
            'Did not report progress on from where it seeked!'
        )
    }

    @test()
    protected static async keepsDevicesOpenWhileScrubbingPastTheirEnd() {
        const recording = this.recordingOfTwoDevices
        const playbackSeek = { seconds: 2 }
        const { rerender } = await this.play(recording)

        await this.runFrame()
        await rerender(
            this.playing(recording, { playbackSeek, isPlaybackPaused: true })
        )
        await this.runFrame()
        const whileScrubbing = this.twoDevices.map((device) =>
            this.deviceStatusOf(device.name)
        )
        await rerender(this.playing(recording, { playbackSeek }))
        await this.runFrame()

        assert.isEqualDeep(
            {
                whileScrubbing,
                onceReleased: this.twoDevices.map((device) =>
                    this.deviceStatusOf(device.name)
                ),
            },
            {
                whileScrubbing: ['connected', 'connected'],
                onceReleased: ['disconnected', 'connected'],
            },
            'Did not keep devices open while scrubbing past their end!'
        )
    }

    @test()
    protected static async endsAgainAfterSeekingBackFromEnd() {
        let numEnds = 0
        const recording = this.recording
        const onPlaybackEnd = () => numEnds++
        const { rerender } = await this.play(recording, { onPlaybackEnd })

        this.nowMs = 5000
        await this.runFrame()
        await rerender(
            this.playing(recording, {
                onPlaybackEnd,
                playbackSeek: { seconds: 0 },
            })
        )
        await this.runFrame()
        this.nowMs = 10000
        await this.runFrame()

        assert.isEqual(numEnds, 2, 'Did not end again after seeking back!')
    }

    @test()
    protected static async graysOutPlotsWhenPlaybackEnds() {
        await this.play()

        this.nowMs = 10000
        await this.runFrame()

        assert.isEqualDeep(
            this.latestRecordingColors,
            [endedPlaybackColor, endedPlaybackColor],
            'Did not gray out plots when playback ended!'
        )
    }

    @test()
    protected static async keepsColorsWhileLooping() {
        await this.play(this.recording, { isPlaybackLooping: true })

        this.nowMs = 20000
        await this.runFrame()

        assert.isEqualDeep(
            this.latestRecordingColors,
            [streamColors[0], streamColors[1]],
            'Grayed out plots while looping!'
        )
    }

    @test()
    protected static async restoresColorsAfterSeekingBackFromEnd() {
        const recording = this.recording
        const { rerender } = await this.play(recording)

        this.nowMs = 10000
        await this.runFrame()
        await rerender(
            this.playing(recording, { playbackSeek: { seconds: 0 } })
        )
        await this.runFrame()

        assert.isEqualDeep(
            this.latestRecordingColors,
            [streamColors[0], streamColors[1]],
            'Did not restore colors after seeking back from end!'
        )
    }

    @test()
    protected static async freezesPlaybackWhilePaused() {
        const reported: PlaybackProgress[] = []
        const recording = this.recording
        const onPlaybackProgress = (progress: PlaybackProgress) =>
            reported.push(progress)
        const { rerender } = await this.play(recording, { onPlaybackProgress })

        this.nowMs = 600
        await this.runFrame()
        await rerender(
            this.playing(recording, {
                onPlaybackProgress,
                isPlaybackPaused: true,
            })
        )
        this.nowMs = 2600
        await this.runFrame()

        assert.isEqualDeep(
            {
                timestamps: this.latestFirstPlotChunk.timestamps,
                progress: reported.at(-1),
            },
            {
                timestamps: [100, 100.5],
                progress: { elapsedSeconds: 0, totalSeconds: 3 },
            },
            'Did not freeze playback while paused!'
        )
    }

    @test()
    protected static async playsOnFromWherePlaybackWasPaused() {
        const recording = this.recording
        const { rerender } = await this.play(recording)

        this.nowMs = 600
        await this.runFrame()
        await rerender(this.playing(recording, { isPlaybackPaused: true }))
        this.nowMs = 2600
        await this.runFrame()
        await rerender(this.playing(recording, { isPlaybackPaused: false }))
        this.nowMs = 3000
        await this.runFrame()

        assert.isEqualDeep(
            {
                first: this.latestFirstPlotChunk.timestamps,
                second: this.latestPlotPropsFor(this.streams[1].name)?.samples,
            },
            { first: [100, 100.5, 101], second: [7] },
            'Did not play on from where playback was paused!'
        )
    }

    @test()
    protected static async startsEachStreamWhenItStartedInRecording() {
        await this.play()

        this.nowMs = 100
        await this.runFrame()
        const beforeItStarted = this.latestPlotPropsFor(
            this.streams[1].name
        )?.samples

        this.nowMs = 300
        await this.runFrame()

        assert.isEqualDeep(
            {
                beforeItStarted,
                onceItStarted: this.latestPlotPropsFor(this.streams[1].name)
                    ?.samples,
            },
            { beforeItStarted: undefined, onceItStarted: [7] },
            'Did not start each stream when it started in recording!'
        )
    }

    @test()
    protected static async keepsAnimatingThroughGapInRecording() {
        await this.play(this.recordingWithGap)

        await this.runFrame()
        this.nowMs = 11000
        await this.runFrame()

        assert.isEqual(
            FakeFrameScheduler.pending.length,
            1,
            'Did not keep animating through gap in recording!'
        )
    }

    @test()
    protected static async stopsAnimatingOncePlayedRecordingIsGone() {
        await this.play(this.recordingWithGap)

        await this.runFrame()
        this.nowMs = 20000
        await this.runFrame()
        this.nowMs = 30001
        await this.runFrame()

        assert.isEqual(
            FakeFrameScheduler.pending.length,
            0,
            'Did not stop animating once played recording was gone!'
        )
    }

    @test()
    protected static async playsAtChosenSpeed() {
        await this.play(this.recording, { playbackSpeed: 2 })

        this.nowMs = 500
        await this.runFrame()

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            { samples: [1, 2, 3, 4, 5, 6], timestamps: [100, 100.5, 101] },
            'Did not play at chosen speed!'
        )
    }

    @test()
    protected static async playsOnFromSamePlaceWhenSpeedChanges() {
        const recording = this.recording
        const { rerender } = await this.play(recording)

        this.nowMs = 500
        await this.runFrame()
        await rerender(this.playing(recording, { playbackSpeed: 2 }))
        this.nowMs = 600
        await this.runFrame()
        const justAfterChange = this.latestFirstPlotChunk.timestamps
        this.nowMs = 750
        await this.runFrame()

        assert.isEqualDeep(
            {
                justAfterChange,
                onceFasterHalfSecondPlayed:
                    this.latestFirstPlotChunk.timestamps,
            },
            {
                justAfterChange: [100, 100.5],
                onceFasterHalfSecondPlayed: [100, 100.5, 101],
            },
            'Did not play on from same place when speed changed!'
        )
    }

    @test()
    protected static async saysPlaybackEndedOnceLastSampleIsPlayed() {
        let numEnds = 0
        await this.play(this.recording, { onPlaybackEnd: () => numEnds++ })

        this.nowMs = 2900
        await this.runFrame()
        const beforeLastSample = numEnds
        this.nowMs = 3000
        await this.runFrame()
        this.nowMs = 4000
        await this.runFrame()

        assert.isEqualDeep(
            { beforeLastSample, afterLastSample: numEnds },
            { beforeLastSample: 0, afterLastSample: 1 },
            'Did not say playback ended once last sample was played!'
        )
    }

    @test()
    protected static async showsRecordedDevicesAsDisconnectedOncePlaybackEnds() {
        await this.play()

        this.nowMs = 3000
        await this.runFrame()

        assert.isEqual(
            this.deviceStatusOf(this.deviceName),
            'disconnected',
            'Did not show recorded devices as disconnected once playback ended!'
        )
    }

    @test()
    protected static async stopsPlotsOfReopenedDeviceMovingOncePlaybackEnds() {
        await this.play()

        this.nowMs = 3000
        await this.runFrame()
        const nowAtEnd = this.latestPlotPropsFor(
            this.streams[0].name
        )?.nowTimestamp

        this.nowMs = 4000
        await this.runFrame()
        this.clickDeviceCard(this.deviceName)

        assert.isEqual(
            this.latestPlotPropsFor(this.streams[0].name)?.nowTimestamp,
            nowAtEnd,
            'Did not stop plots of reopened device moving once playback ended!'
        )
    }

    @test()
    protected static async showsDeviceAsDisconnectedOnceItsDataRunsOut() {
        await this.playTwoDevicesUntilFirstRunsOut()

        assert.isEqualDeep(
            this.twoDevices.map((device) => this.deviceStatusOf(device.name)),
            ['disconnected', 'connected'],
            'Did not show device as disconnected once its data ran out!'
        )
    }

    @test()
    protected static async keepsDeviceOpenOnceItsDataRunsOut() {
        await this.playTwoDevicesUntilFirstRunsOut()

        assert.isEqualDeep(
            this.twoDevices.map((device) => this.shownPlotsOf(device.name)),
            this.twoDevices.map((device) => this.plotIdsFor(device.streams)),
            'Did not keep device open once its data ran out!'
        )
    }

    @test()
    protected static async collapsesRunOutDeviceWhenItIsClicked() {
        await this.playTwoDevicesUntilFirstRunsOut()

        this.clickDeviceCard(this.twoDevices[0].name)

        assert.isEqualDeep(
            this.shownPlotsOf(this.twoDevices[0].name),
            [],
            'Did not collapse run out device when it was clicked!'
        )
    }

    @test()
    protected static async keepsDeviceOpenWhenPlaybackEnds() {
        await this.play(this.recording)

        this.nowMs = 3000
        await this.runFrame()

        assert.isEqualDeep(
            this.shownPlotsOf(this.deviceName),
            this.plotIdsFor(this.streams),
            'Did not keep device open when playback ended!'
        )
    }

    @test()
    protected static async keepsXdfDescriptionOnceADevicesDataRunsOut() {
        await this.play({
            ...this.recordingOfTwoDevices,
            header: [{ name: 'protocol-sha256', value: 'abc123' }],
        })

        this.nowMs = 1000
        await this.runFrame()

        assert.isTruthy(
            this.descriptionToggle,
            'Did not keep XDF description once a device ran out of data!'
        )
    }

    @test()
    protected static async reopensRunOutDeviceWhenSeekingBackBeforeItRanOut() {
        const recording = this.recordingOfTwoDevices
        const { rerender } = await this.play(recording)

        this.nowMs = 1000
        await this.runFrame()
        await rerender(
            this.playing(recording, { playbackSeek: { seconds: 0 } })
        )
        await this.runFrame()

        assert.isEqualDeep(
            {
                status: this.deviceStatusOf(this.twoDevices[0].name),
                plots: this.shownPlotsOf(this.twoDevices[0].name),
            },
            {
                status: 'connected',
                plots: this.plotIdsFor(this.twoDevices[0].streams),
            },
            'Did not reopen run out device when seeking back before it ran out!'
        )
    }

    @test()
    protected static async keepsDeviceCollapsedByClickWhenSeekingBack() {
        const recording = this.recordingOfTwoDevices
        const { rerender } = await this.play(recording)

        this.nowMs = 1000
        await this.runFrame()
        this.clickDeviceCard(this.twoDevices[0].name)
        await rerender(
            this.playing(recording, { playbackSeek: { seconds: 0 } })
        )
        await this.runFrame()

        assert.isEqualDeep(
            this.shownPlotsOf(this.twoDevices[0].name),
            [],
            'Did not keep device collapsed by click when seeking back!'
        )
    }

    @test()
    protected static async loopsBackToStartWhileTimelineMovesOn() {
        await this.play(this.recording, { isPlaybackLooping: true })

        this.nowMs = 4000
        await this.runFrame()

        assert.isEqualDeep(
            this.latestFirstPlotChunk,
            {
                samples: [1, 2, 3, 4, 5, 6, 1, 2, 3, 4],
                timestamps: [100, 100.5, 101, 103.5, 104],
            },
            'Did not loop back to start while timeline moved on!'
        )
    }

    @test()
    protected static async neverEndsWhileLooping() {
        let numEnds = 0
        await this.play(this.recording, {
            isPlaybackLooping: true,
            onPlaybackEnd: () => numEnds++,
        })

        this.nowMs = 20000
        await this.runFrame()

        assert.isEqual(numEnds, 0, 'Ended while looping!')
    }

    @test()
    protected static async endsOnceLoopingIsTurnedOff() {
        let numEnds = 0
        const recording = this.recording
        const onPlaybackEnd = () => numEnds++
        const { rerender } = await this.play(recording, {
            isPlaybackLooping: true,
            onPlaybackEnd,
        })

        this.nowMs = 4000
        await this.runFrame()
        await rerender(
            this.playing(recording, {
                isPlaybackLooping: false,
                onPlaybackEnd,
            })
        )
        this.nowMs = 20000
        await this.runFrame()

        assert.isEqual(numEnds, 1, 'Did not end once looping was turned off!')
    }

    @test()
    protected static async reportsProgressWithinCurrentLoop() {
        const reported: PlaybackProgress[] = []
        await this.play(this.recording, {
            isPlaybackLooping: true,
            onPlaybackProgress: (progress) => reported.push(progress),
        })

        this.nowMs = 5000
        await this.runFrame()

        assert.isEqualDeep(
            reported.at(-1),
            { elapsedSeconds: 1, totalSeconds: 3 },
            'Did not report progress within current loop!'
        )
    }

    @test()
    protected static async showsOnlyCurrentLoopOfAllData() {
        await this.play(this.recording, {
            isPlaybackLooping: true,
            windowSeconds: Infinity,
        })

        this.nowMs = 1000
        await this.runFrame()
        this.nowMs = 5000
        await this.runFrame()

        assert.isEqualDeep(
            this.latestFirstPlotChunk.timestamps,
            [103.5, 104, 104.5],
            'Did not show only current loop of all data!'
        )
    }

    @test()
    protected static async detectsPeaksAsTheyPlayWhileLooping() {
        await this.play(this.recording, {
            ...this.peakDetectionOnFirstStream,
            isPlaybackLooping: true,
        })

        await this.runFrame()

        assert.isUndefined(
            this.latestPlotPropsFor(this.streams[0].name)?.knownPeakTimestamps,
            'Did not detect peaks as they played while looping!'
        )
    }

    private static async playTwoDevicesUntilFirstRunsOut() {
        await this.play(this.recordingOfTwoDevices, { windowSeconds: 1 })

        this.nowMs = 1000
        await this.runFrame()
    }

    private static get recordingOfTwoDevices(): Recording {
        const [first, second] = this.recording.devices[0].streams

        return {
            devices: [
                { deviceName: this.twoDevices[0].name, streams: [first] },
                { deviceName: this.twoDevices[1].name, streams: [second] },
            ],
        }
    }

    private static get recording(): Recording {
        return {
            devices: [
                {
                    deviceName: this.deviceName,
                    streams: [
                        {
                            type: this.streams[0].name,
                            channelNames: ['A', 'B'],
                            sampleRateHz: 2,
                            samples: [1, 2, 3, 4, 5, 6],
                            timestamps: [100, 100.5, 101],
                        },
                        {
                            type: this.streams[1].name,
                            channelNames: ['C'],
                            sampleRateHz: 1,
                            samples: [7, 8],
                            timestamps: [100.2, 103],
                        },
                    ],
                },
            ],
        }
    }

    private static get recordingWithGap(): Recording {
        return {
            devices: [
                {
                    deviceName: this.deviceName,
                    streams: [
                        {
                            type: this.streams[0].name,
                            channelNames: ['A'],
                            sampleRateHz: 0,
                            samples: [1, 2],
                            timestamps: [100, 120],
                        },
                    ],
                },
            ],
        }
    }

    private static async play(
        recording = this.recording,
        props: Partial<StreamMonitorProps> = {}
    ) {
        this.setFakeStreamPlot()

        return await render(this.playing(recording, props))
    }

    private static playing(
        recording: Recording,
        props: Partial<StreamMonitorProps> = {}
    ) {
        return (
            <StreamMonitor
                deviceNames={recording.devices.map(
                    (device) => device.deviceName
                )}
                deviceStatusPort={this.deviceStatusPort}
                recording={recording}
                {...props}
            />
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

    private static gatewayDeviceWithRates(
        streams: { type: string; sampleRateHz: number }[]
    ) {
        return {
            deviceName: this.deviceName,
            state: 'streaming',
            streams: streams.map((stream, index) => ({
                ...stream,
                listenPort: 1234 + index,
                channelNames: [],
            })),
        }
    }

    private static get latestWindowSecondsByStream() {
        return this.streams.map(
            (stream) => this.latestPlotPropsFor(stream.name)?.windowSeconds
        )
    }

    private static get latestScrubHandlers() {
        return this.streams.map(
            (stream) => this.latestPlotPropsFor(stream.name)?.onScrubTo
        )
    }

    private static async scrubPausedPlaybackTo(...timestamps: number[]) {
        const seekSeconds: number[] = []

        await this.play(this.recording, {
            isPlaybackPaused: true,
            onPlaybackSeek: (seconds) => seekSeconds.push(seconds),
        })

        const { name } = this.streams[0]
        timestamps.forEach((timestamp) =>
            act(() => this.latestPlotPropsFor(name)?.onScrubTo?.(timestamp))
        )

        return seekSeconds
    }

    private static markTimestamp(timestamp: number, streamIndex = 0) {
        const { name } = this.streams[streamIndex]

        act(() => this.latestPlotPropsFor(name)?.onMarkTimestamp?.(timestamp))
    }

    private static get latestMarkedTimestamps() {
        return this.streams.map(
            (stream) => this.latestPlotPropsFor(stream.name)?.markedTimestamp
        )
    }

    private static chooseWindowSeconds(seconds: number, streamIndex = 0) {
        const { name } = this.streams[streamIndex]

        act(() =>
            this.latestPlotPropsFor(name)?.onWindowSecondsChange?.(seconds)
        )
    }

    private static chooseWindowForAllGraphs(option: string) {
        fireEvent.click(screen.getByTitle('Change time window of all graphs'))
        fireEvent.click(screen.getByRole('menuitemradio', { name: option }))
    }

    private static get monitorHeader() {
        return (
            document.querySelector('.stream-monitor__header')?.textContent ??
            undefined
        )
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

    private static get latestRecordingColors() {
        return this.streams
            .slice(0, 2)
            .map((stream) => this.latestPlotPropsFor(stream.name)?.color)
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

    private static async mountWithScannedIdentifiers(
        props: Partial<StreamMonitorProps> = {}
    ) {
        return await this.mountWithRememberedIdentifiers({
            scannedIdentifiers: {
                [this.deviceName]: [
                    { value: this.remembered[1], source: 'Muse' },
                    { value: 'scanned-uuid', source: 'Muse' },
                ],
            },
            ...props,
        })
    }

    private static get dropdownRowTexts() {
        return Array.from(
            screen.queryByRole('listbox')?.children ?? [],
            (row) =>
                row.querySelector('[role="option"]')?.textContent ??
                row.textContent
        )
    }

    private static get offeredSources() {
        return screen
            .queryAllByRole('option')
            .map(
                (option) =>
                    option
                        .closest('li')
                        ?.querySelector(
                            '.stream-monitor__device-identifier-source'
                        )?.textContent ?? null
            )
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

    private static async showLiveStreamDescribedBy(desc: DescElement[]) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { isRecording: true })

        this.receiveGatewayDevices([
            this.describedGatewayDeviceFor(this.streams[0], desc),
        ])
    }

    private static async showLiveStreamsDescribedBy(descs: DescElement[][]) {
        this.setFakeStreamPlot()
        await this.mount([this.deviceName], { isRecording: true })

        const device = this.gatewayDeviceFor(
            this.devicesFor(this.streams.slice(0, descs.length))[0]
        )

        this.receiveGatewayDevices([
            {
                ...device,
                streams: device.streams.map((reported, index) => ({
                    ...reported,
                    desc: descs[index],
                })),
            },
        ])
    }

    private static gatewayDeviceWithChannels(
        channels: Record<string, string>[]
    ) {
        const device = this.describedGatewayDeviceFor(this.streams[0], [
            this.channelsDesc(channels),
        ])

        return {
            ...device,
            streams: device.streams.map((stream) => ({
                ...stream,
                channelNames: channels.map(({ label }) => label),
            })),
        }
    }

    private static channelsDesc(
        channels: Record<string, string>[]
    ): DescElement {
        return {
            name: 'channels',
            children: channels.map((fields) => ({
                name: 'channel',
                children: Object.entries(fields).map(([name, value]) => ({
                    name,
                    value,
                })),
            })),
        }
    }

    private static describedGatewayDeviceFor(
        stream: TestStream,
        desc: DescElement[] | undefined
    ) {
        const device = this.gatewayDeviceFor(this.devicesFor([stream])[0])

        return {
            ...device,
            streams: device.streams.map((reported) => ({
                ...reported,
                desc,
            })),
        }
    }

    private static get rawXdfToggle() {
        return screen.queryByRole('button', { name: 'Raw XDF' })
    }

    private static get descriptionToggle() {
        return screen.queryByRole('button', { name: 'XDF description' })
    }

    private static get shownDescription() {
        const textsOf = (role: string) =>
            screen.queryAllByRole(role).map((element) => element.textContent)

        return {
            headings: textsOf('heading'),
            fields: textsOf('term'),
            values: screen
                .queryAllByRole('definition')
                .filter((definition) => definition.children.length === 0)
                .map((definition) => definition.textContent),
        }
    }

    private static get shownTable() {
        const [header, ...rows] = screen.queryAllByRole('row')
        const textsIn = (row: HTMLElement | undefined, role: string) =>
            within(row!)
                .queryAllByRole(role)
                .map((element) => element.textContent)

        return {
            columns: textsIn(header, 'columnheader'),
            rows: rows.map((row) => textsIn(row, 'cell')),
        }
    }

    private static get dimmedColumns() {
        const [header, ...rows] = screen.queryAllByRole('row')
        const columns = within(header)
            .queryAllByRole('columnheader')
            .map((column) => column.textContent)

        return columns.filter((_, index) =>
            rows.every((row) =>
                within(row)
                    .queryAllByRole('cell')
                    [index].classList.contains('xdf-description__cell--same')
            )
        )
    }

    private static get nicknameInput() {
        return this.nicknameInputOf(this.deviceName)
    }

    private static nicknameInputOf(deviceKey: string) {
        return screen.queryByRole('textbox', { name: `${deviceKey} nickname` })
    }

    private static get identifierInput() {
        return screen.queryByRole('textbox', {
            name: /\((optional|required)\)$/,
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
