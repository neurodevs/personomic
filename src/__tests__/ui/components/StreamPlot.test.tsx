import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen } from '@testing-library/react'

import FakePpgDetector from '../../../testDoubles/PpgDetector/FakePpgDetector'
import FakeResizeObserver from '../../../testDoubles/ResizeObserver/FakeResizeObserver'
import FakeUPlot from '../../../testDoubles/UPlot/FakeUPlot'
import StreamPlot, {
    Downsampling,
    StreamPlotProps,
} from '../../../ui/components/StreamPlot'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class StreamPlotTest extends AbstractPackageTest {
    private static readonly plotName = this.generateId()

    protected static async beforeEach() {
        await super.beforeEach()

        FakeUPlot.resetTestDouble()
    }

    @test()
    protected static async rendersTopLevelView() {
        await this.render()

        assert.isTruthy(
            screen.getByTestId(`stream-plot-${this.plotName}`),
            'Failed to render top-level view!'
        )
    }

    @test()
    protected static async rendersName() {
        await this.render()

        assert.isTruthy(
            screen.getByText(this.plotName),
            'Failed to render plot name!'
        )
    }

    @test()
    protected static async createsPlotForEachChannel() {
        await this.render(this.twoChannels)

        assert.isEqual(
            FakeUPlot.instances.length,
            2,
            'Did not create a plot for each channel!'
        )
    }

    @test()
    protected static async plotsEachChannelSeparately() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => ({
                numSeries: plot.options.series.length,
                data: plot.data,
            })),
            [
                {
                    numSeries: 2,
                    data: [
                        [0, 1, 2],
                        [1, 2, 3],
                    ],
                },
                {
                    numSeries: 2,
                    data: [
                        [0, 1, 2],
                        [10, 20, 30],
                    ],
                },
            ],
            'Did not plot each channel separately!'
        )
    }

    @test()
    protected static async createsEachChannelPlotWithSize() {
        await this.render({ ...this.twoChannels, width: 100, height: 50 })

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => ({
                width: plot.options.width,
                height: plot.options.height,
            })),
            [
                { width: 100, height: 50 },
                { width: 100, height: 50 + this.xAxisHeight },
            ],
            'Did not create each channel plot with size!'
        )
    }

    @test()
    protected static async keepsRoomForTimeLabelsBelowLastChannelOnResize() {
        await this.render({ ...this.twoChannels, width: 100, height: 50 })

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.size?.height),
            [50, 50 + this.xAxisHeight],
            'Did not keep room for time labels below last channel on resize!'
        )
    }

    @test()
    protected static async showsYAxisOnLeftAndXAxisBelowEachChannel() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) =>
                plot.options.axes?.map((axis) => ({
                    isShown: axis.show !== false,
                    side: axis.side,
                }))
            ),
            Array.from({ length: 2 }, () => [
                { isShown: true, side: undefined },
                { isShown: true, side: 3 },
            ]),
            'Did not show y-axis on left and x-axis below each channel!'
        )
    }

    @test()
    protected static async givesEachChannelSameYAxisWidthToKeepTimeAligned() {
        await this.render(this.twoChannels)

        const sizes = FakeUPlot.instances.map(
            (plot) => plot.options.axes?.[1].size
        )

        assert.isEqualDeep(
            {
                areNumbers: sizes.every((size) => typeof size === 'number'),
                numDistinct: new Set(sizes).size,
            },
            { areNumbers: true, numDistinct: 1 },
            'Did not give each channel the same y-axis width!'
        )
    }

    @test('every 2s across 10s', 0, 10, [0, 2, 4, 6, 8])
    @test('every 5s across 30s', 100, 130, [100, 105, 110, 115, 120, 125])
    @test('every 15s across 1m', 0, 60, [0, 15, 30, 45])
    @test('every 30s across 2m', 0, 120, [0, 30, 60, 90])
    @test('every 1m across 5m', 0, 300, [0, 60, 120, 180, 240])
    @test('counting back from latest', 2.5, 10, [3, 4, 5, 6, 7, 8, 9])
    @test('every half second across 2s', 0, 2, [0, 0.5, 1, 1.5])
    @test('nowhere when no time is shown', 5, 5, [])
    protected static async putsTimeBarsAtRoundSecondsBeforeLatest(
        earliest: number,
        latest: number,
        expected: number[]
    ) {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            this.xTicksBetween(earliest, latest),
            expected,
            'Did not put time bars at round seconds before latest!'
        )
    }

    @test()
    protected static async putsSameTimeBarsOnEveryChannel() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => this.xTicksBetween(0, 10, plot)),
            [
                [0, 2, 4, 6, 8],
                [0, 2, 4, 6, 8],
            ],
            'Did not put same time bars on every channel!'
        )
    }

    @test()
    protected static async labelsTimeBarsBelowLastChannelAsTimeBeforeLatest() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            this.xTickLabelsFor([1.5, -8, -58, -88]),
            ['-0.5s', '-10s', '-1m', '-1m 30s'],
            'Did not label time bars below last channel as time before latest!'
        )
    }

    @test()
    protected static async leavesGapBetweenXAxisAndItsTimeLabels() {
        await this.render(this.twoChannels)

        const xAxis = FakeUPlot.latest.options.axes?.[0]
        const labelHeight = 10

        assert.isEqualDeep(
            {
                gap: xAxis?.gap,
                hasRoomForLabels:
                    this.xAxisHeight - (xAxis?.gap ?? 0) >= labelHeight,
            },
            { gap: 6, hasRoomForLabels: true },
            'Did not leave gap between x-axis and its time labels!'
        )
    }

    @test()
    protected static async leavesSameGapBeforeYLabelsPastOccurrenceStripAsBeforeTimeLabels() {
        await this.render(this.twoChannels)

        const [xAxis, yAxis] = FakeUPlot.latest.options.axes ?? []
        const occurrenceStripFootprint = 6

        assert.isEqual(
            (yAxis?.gap ?? 0) - occurrenceStripFootprint,
            xAxis?.gap,
            'Did not leave same gap before y labels as before time labels!'
        )
    }

    @test()
    protected static async labelsTimeBarsBelowLastChannelOnly() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            {
                labels: this.xTickLabelsFor([0, 1], FakeUPlot.instances[0]),
                size: FakeUPlot.instances[0].options.axes?.[0].size,
            },
            { labels: [], size: 0 },
            'Did not label time bars below last channel only!'
        )
    }

    @test('labels whole tick', 250, '250')
    @test('labels negative fractional tick', -0.25, '-0.25')
    @test('labels large tick without separators', 251200, '251200')
    @test('labels tick too long to fit in exponent form', 123456789, '1.23e+8')
    @test(
        'labels negative tick with fewer digits to fit',
        -123456789,
        '-1.2e+8'
    )
    @test(
        'labels tiny tick too long to fit in exponent form',
        0.00000125,
        '1.25e-6'
    )
    protected static async labelsYAxisTicksToFitAxis(
        tick: number,
        expected: string
    ) {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            this.yTickLabelsFor([tick]),
            [expected],
            'Did not label y-axis tick to fit axis!'
        )
    }

    @test('four bars at ones', 21.3, 23.9, [21, 22, 23, 24])
    @test('three bars at fifths when tighter', 0.02, 0.37, [0, 0.2, 0.4])
    @test('three bars around zero when tighter', -50, 50, [-50, 0, 50])
    @test('three bars at fifties when tighter', 0, 100, [0, 50, 100])
    @test(
        'bars at hundreds on an offset range',
        251210,
        251390,
        [251200, 251300, 251400]
    )
    @test('bars above a flat signal', 100, 100, [100, 110, 120])
    @test(
        'bars stay put when range is already on bars',
        0,
        0.6,
        [0, 0.2, 0.4, 0.6]
    )
    protected static async putsTightestRoundYBarsAroundRange(
        min: number,
        max: number,
        expected: number[]
    ) {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            this.yBarsBetween(min, max),
            expected,
            'Did not put tightest round y-bars around range!'
        )
    }

    @test()
    protected static async scalesYFromLowestBarToHighestBar() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            this.yRangeFor(21.3, 23.9),
            [21, 24],
            'Did not scale y from lowest bar to highest bar!'
        )
    }

    @test()
    protected static async scalesYBeforeAnyDataArrives() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            this.yRangeFor(null, null),
            [0, 0.2],
            'Did not scale y before any data arrived!'
        )
    }

    @test()
    protected static async tightensYScaleWhenVisibleSignalNarrows() {
        await this.render(this.twoChannels)

        this.yRangeFor(0, 100)

        assert.isEqualDeep(
            this.yRangeFor(40, 60),
            [40, 60],
            'Did not tighten y-scale when visible signal narrowed!'
        )
    }

    @test()
    protected static async movesYScaleWhenVisibleSignalMoves() {
        await this.render(this.twoChannels)

        this.yRangeFor(0, 100)

        assert.isEqualDeep(
            this.yRangeFor(-20, 10),
            [-20, 10],
            'Did not move y-scale when visible signal moved!'
        )
    }

    @test()
    protected static async keepsYScaleWhenDataGoesMissing() {
        await this.render(this.twoChannels)

        this.yRangeFor(0, 100)

        assert.isEqualDeep(
            this.yRangeFor(null, null),
            [0, 100],
            'Did not keep y-scale when data went missing!'
        )
    }

    @test()
    protected static async keepsYScaleOfEachChannelSeparately() {
        await this.render(this.twoChannels)

        this.yRangeFor(0, 100, FakeUPlot.instances[0])

        assert.isEqualDeep(
            this.yRangeFor(null, null, FakeUPlot.instances[1]),
            [0, 0.2],
            'Did not keep y-scale of each channel separately!'
        )
    }

    @test()
    protected static async scalesYToVisibleSignalInsideGivenLimits() {
        await this.render({
            ...this.twoChannels,
            yLimits: { min: 0, max: 100 },
        })

        assert.isEqualDeep(
            this.yRangeFor(87, 88),
            [87, 88],
            'Did not scale y to visible signal inside given limits!'
        )
    }

    @test()
    protected static async scalesYAcrossGivenLimitsBeforeAnyDataArrives() {
        await this.render({
            ...this.twoChannels,
            yLimits: { min: 0, max: 100 },
        })

        assert.isEqualDeep(
            this.yRangeFor(null, null),
            [0, 100],
            'Did not scale y across given limits before any data arrived!'
        )
    }

    @test('shifts up to given min', { min: 0 }, -5, 15, [0, 30])
    @test('shifts down to given max', { max: 100 }, 100, 100, [80, 100])
    @test('ignores side without limit', { min: 0 }, 40, 60, [40, 60])
    protected static async keepsYScaleWithinTheOneGivenLimit(
        yLimits: StreamPlotProps['yLimits'],
        min: number,
        max: number,
        expected: number[]
    ) {
        await this.render({ ...this.twoChannels, yLimits })

        assert.isEqualDeep(
            this.yRangeFor(min, max),
            expected,
            'Did not keep y-scale within the one given limit!'
        )
    }

    @test()
    protected static async keepsYScaleWithinGivenLimitsWhenDataExceedsThem() {
        await this.render({
            ...this.twoChannels,
            yLimits: { min: 0, max: 100 },
        })

        assert.isEqualDeep(
            this.yRangeFor(-5, 120),
            [0, 100],
            'Did not keep y-scale within given limits when data exceeded them!'
        )
    }

    @test()
    protected static async recreatesPlotsWhenGivenYLimitsChange() {
        await this.renderThenUpdate(
            { ...this.twoChannels, yLimits: { min: 0 } },
            { ...this.twoChannels, yLimits: { min: 0, max: 100 } }
        )

        assert.isEqualDeep(
            {
                numPlots: FakeUPlot.instances.length,
                range: this.yRangeFor(100, 100),
            },
            { numPlots: 4, range: [80, 100] },
            'Did not recreate plots when given y-limits changed!'
        )
    }

    @test()
    protected static async keepsPlotsWhenGivenYLimitsAreSameValues() {
        await this.renderThenUpdate(
            { ...this.twoChannels, yLimits: { min: 0, max: 100 } },
            { ...this.twoChannels, yLimits: { min: 0, max: 100 } }
        )

        assert.isEqual(
            FakeUPlot.instances.length,
            2,
            'Recreated plots for y-limits with the same values!'
        )
    }

    @test()
    protected static async drawsOccurrenceStripBetweenScaleAndPlotWindow() {
        await this.render(this.oneChannelAtTwoLevels)

        const strip = this.drawOccurrenceStrip()

        assert.isEqualDeep(
            {
                track: strip.track,
                lefts: [...new Set(strip.rows.map((row) => row.x))],
                widths: [...new Set(strip.rows.map((row) => row.width))],
                isInsideWindowHeight: strip.rows.every(
                    (row) => row.y >= 10 && row.y < 50
                ),
            },
            {
                track: { x: 94, y: 10, width: 4, height: 40 },
                lefts: [94],
                widths: [4],
                isInsideWindowHeight: true,
            },
            'Did not draw occurrence strip between scale and plot window!'
        )
    }

    @test()
    protected static async colorsStripRowsByRelativeOccurrenceInStreamColor() {
        await this.render({ ...this.oneChannelAtTwoLevels, color: '#abcdef' })

        const strip = this.drawOccurrenceStrip()

        assert.isEqualDeep(
            strip.rows.map(({ y, color, opacity }) => ({ y, color, opacity })),
            [
                { y: 19, color: '#abcdef', opacity: 0.43 },
                { y: 39, color: '#abcdef', opacity: 1 },
            ],
            'Did not color strip rows by relative occurrence in stream color!'
        )
    }

    @test()
    protected static async keepsOccurrencesOfValuesThatLeftTheWindow() {
        await this.renderThenUpdate(this.oneChannelAtTwoLevels, {
            samples: [1.05],
            timestamps: [4],
        })

        assert.isEqualDeep(
            this.drawOccurrenceStrip().rows.map(({ y, opacity }) => ({
                y,
                opacity,
            })),
            [
                { y: 19, opacity: 0.36 },
                { y: 39, opacity: 1 },
            ],
            'Did not keep occurrences of values that left the window!'
        )
    }

    @test()
    protected static async countsEachSampleOnceWhenWindowsOverlap() {
        await this.renderThenUpdate(this.oneChannelAtTwoLevels, {
            samples: [...this.oneChannelAtTwoLevels.samples, 3.05, 3.05],
            timestamps: [...this.oneChannelAtTwoLevels.timestamps, 4, 5],
        })

        assert.isEqualDeep(
            this.drawOccurrenceStrip().rows.map(({ y, opacity }) => ({
                y,
                opacity,
            })),
            [
                { y: 19, opacity: 1 },
                { y: 39, opacity: 1 },
            ],
            'Did not count each sample once when windows overlapped!'
        )
    }

    @test()
    protected static async tracksOccurrencesOfEachChannelSeparately() {
        await this.render({
            samples: [1.05, 3.05, 1.05, 3.05],
            timestamps: [0, 1],
        })

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) =>
                this.drawOccurrenceStrip(plot).rows.map((row) => row.y)
            ),
            [[39], [19]],
            'Did not track occurrences of each channel separately!'
        )
    }

    @test()
    protected static async drawsOnlyStripTrackBeforeAnyValueOccurs() {
        await this.render(this.oneChannelAtTwoLevels)

        const strip = this.drawOccurrenceStrip(FakeUPlot.latest, {
            min: 100,
            max: 104,
        })

        assert.isEqualDeep(
            { numRows: strip.rows.length, hasTrack: strip.track !== undefined },
            { numRows: 0, hasTrack: true },
            'Did not draw only strip track when no value was in range!'
        )
    }

    @test()
    protected static async drawsBarAtEveryYTick() {
        await this.render(this.twoChannels)

        assert.isTrue(
            FakeUPlot.latest.options.axes?.[1].grid?.show !== false,
            'Did not draw a bar at every y-tick!'
        )
    }

    @test()
    protected static async drawsEachChannelInGivenColor() {
        await this.render({ ...this.twoChannels, color: '#abcdef' })

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.options.series[1].stroke),
            ['#abcdef', '#abcdef'],
            'Did not draw each channel in given color!'
        )
    }

    @test()
    protected static async showsChannelNamesOnlyInHeaderAbovePlotWindow() {
        await this.render({ ...this.twoChannels, channelNames: ['TP9', 'AF7'] })

        const shown = ['TP9', 'AF7'].flatMap((name) =>
            screen.queryAllByText(name)
        )

        assert.isEqualDeep(
            shown.map((name) => name.parentElement?.className),
            ['stream-plot__channel-header', 'stream-plot__channel-header'],
            'Showed a channel name outside header above plot window!'
        )
    }

    @test()
    protected static async showsWindowEndingAtLatestSample() {
        await this.render({
            samples: [0, 0, 5, 5, 10, 10],
            timestamps: [4, 5, 6],
        })

        assert.isEqualDeep(
            this.xScales,
            [
                { min: -4, max: 6 },
                { min: -4, max: 6 },
            ],
            'Did not show window ending at latest sample!'
        )
    }

    @test()
    protected static async showsWindowEndingAtNowTimestamp() {
        await this.render({
            samples: [0, 10],
            timestamps: [4, 5],
            windowSeconds: 2,
            nowTimestamp: 7,
        })

        assert.isEqualDeep(
            this.xScales,
            [{ min: 5, max: 7 }],
            'Did not show window ending at nowTimestamp!'
        )
    }

    @test()
    protected static async dropsSamplesThatScrolledOutOfWindow() {
        await this.render({
            samples: [1, 2, 3],
            timestamps: [0, 1, 2],
            windowSeconds: 10,
            nowTimestamp: 11,
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data,
            [
                [1, 2],
                [2, 3],
            ],
            'Did not drop samples that scrolled out of window!'
        )
    }

    @test()
    protected static async clearsPlotOnceAllSamplesScrollOut() {
        await this.render({
            samples: [1, 2, 3],
            timestamps: [0, 1, 2],
            windowSeconds: 10,
            nowTimestamp: 13,
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data,
            [[], []],
            'Did not clear plot once all samples scrolled out!'
        )
    }

    @test()
    protected static async doesNotDetectPeaksByDefault() {
        await this.render(this.twoChannels)

        assert.isEqual(
            FakePpgDetector.callsToConstructor.length,
            0,
            'Created a peak detector without being asked to!'
        )
    }

    @test()
    protected static async createsPeakDetectorWithSampleRate() {
        await this.render({
            ...this.twoChannels,
            detectPeaks: { sampleRate: 64 },
        })

        assert.isEqualDeep(
            FakePpgDetector.callsToConstructor,
            [{ sampleRate: 64 }],
            'Did not create peak detector with sample rate!'
        )
    }

    @test()
    protected static async showsNoLatestValueWithoutUnits() {
        await this.render(this.twoChannels)

        assert.isEqual(
            this.readoutValue('latest'),
            undefined,
            'Showed latest value without units!'
        )
    }

    @test()
    protected static async showsNoLatestValueBeforeFirstData() {
        await this.render({ units: '°C' })

        assert.isEqual(
            this.readoutValue('latest'),
            undefined,
            'Showed latest value before first data!'
        )
    }

    @test('shows latest sample with spaced units', [20, 21.5], '°C', '21.5 °C')
    @test('shows percent without a space', [40, 45], '%', '45%')
    @test('rounds to one decimal', [22.46], '°C', '22.5 °C')
    @test('drops trailing zero decimal', [99.98], '%', '100%')
    protected static async showsLatestValueWithUnits(
        samples: number[],
        latestValueUnits: string,
        expected: string
    ) {
        await this.render({
            samples,
            timestamps: samples.map((_, i) => i),
            units: latestValueUnits,
        })

        assert.isEqual(
            this.readoutValue('latest'),
            expected,
            'Did not show latest value with units!'
        )
    }

    @test()
    protected static async showsLabelledLatestValueRightOfStreamName() {
        await this.render({ ...this.twoChannels, units: '%' })

        const latest = this.plot.querySelector('.stream-plot__readout--latest')

        assert.isEqualDeep(
            {
                label: latest?.firstElementChild?.textContent,
                isRightOfName:
                    latest?.previousElementSibling ===
                    this.plot.querySelector('.stream-plot__name'),
                value: this.readoutValue('latest'),
            },
            { label: 'Latest', isRightOfName: true, value: '3%, 30%' },
            'Did not show labelled latest value right of stream name!'
        )
    }

    @test()
    protected static async showsNoHeartRateWithoutHeartRateWindow() {
        await this.render({
            ...this.twoChannels,
            detectPeaks: { sampleRate: 64 },
        })

        assert.isEqual(
            this.heartRate,
            undefined,
            'Showed heart rate without heart rate window!'
        )
    }

    @test()
    protected static async showsNoHeartRateBeforeFirstData() {
        await this.render({ detectPeaks: this.heartRateOverThirtySeconds })

        assert.isEqual(
            this.heartRate,
            undefined,
            'Showed heart rate before first data!'
        )
    }

    @test()
    protected static async showsHeartRateRightOfStreamName() {
        await this.renderOneChannelAt([0], this.heartRateOverThirtySeconds)

        const name = this.plot.querySelector('.stream-plot__name')
        const heartRate = this.plot.querySelector(
            '.stream-plot__readout--heart-rate'
        )

        assert.isEqual(
            name?.nextElementSibling,
            heartRate,
            'Did not show heart rate right of stream name!'
        )
    }

    @test('labels countdown as heart rate', [5])
    @test('labels beats per minute as heart rate', [0, 30])
    protected static async labelsHeartRateWhateverItShows(
        timestamps: number[]
    ) {
        await this.renderOneChannelAt(
            timestamps,
            this.heartRateOverThirtySeconds
        )

        assert.isEqual(
            this.plot.querySelector('.stream-plot__readout--heart-rate')
                ?.firstElementChild?.textContent,
            'Heart rate',
            'Did not label heart rate!'
        )
    }

    @test('counts down from full window at first data', [5], 'Ready in 30s')
    @test('counts down whole seconds received', [5, 6, 7], 'Ready in 28s')
    @test('rounds partial seconds up', [5, 6.5], 'Ready in 29s')
    @test('counts down to last second', [5, 34.5], 'Ready in 1s')
    protected static async countsDownUntilHeartRateWindowIsFilled(
        timestamps: number[],
        expected: string
    ) {
        await this.renderOneChannelAt(
            timestamps,
            this.heartRateOverThirtySeconds
        )

        assert.isEqual(
            this.heartRate,
            expected,
            'Did not count down until heart rate window was filled!'
        )
    }

    @test()
    protected static async countsDownFromFirstDataAfterItLeavesTheWindow() {
        const detectPeaks = this.heartRateOverThirtySeconds

        await this.renderThenUpdate(
            { samples: [1, 1], timestamps: [100, 101], detectPeaks },
            { samples: [1, 1], timestamps: [110.5, 111], detectPeaks }
        )

        assert.isEqual(
            this.heartRate,
            'Ready in 19s',
            'Did not count down from first data after it left the window!'
        )
    }

    @test()
    protected static async showsBeatsPerMinuteOnceWindowIsFilled() {
        FakePpgDetector.peakTimestamps = [10, 10.8, 11.6]

        await this.renderOneChannelAt(
            [0, 10, 10.8, 11.6, 30],
            this.heartRateOverThirtySeconds
        )

        assert.isEqual(
            this.heartRate,
            '75 bpm',
            'Did not show beats per minute once window was filled!'
        )
    }

    @test()
    protected static async derivesHeartRateOnlyFromPeaksInsideWindow() {
        FakePpgDetector.peakTimestamps = [1, 1.5, 2, 20, 21]

        await this.renderOneChannelAt(
            [0, 1, 1.5, 2, 20, 21, 40],
            this.heartRateOverThirtySeconds
        )

        assert.isEqual(
            this.heartRate,
            '60 bpm',
            'Did not derive heart rate only from peaks inside window!'
        )
    }

    @test()
    protected static async derivesHeartRateFromTypicalGapSoMissedBeatDoesNotSkewIt() {
        FakePpgDetector.peakTimestamps = [10, 11, 12, 14, 15]

        await this.renderOneChannelAt(
            [0, 10, 11, 12, 14, 15, 30],
            this.heartRateOverThirtySeconds
        )

        assert.isEqual(
            this.heartRate,
            '60 bpm',
            'Did not derive heart rate from typical gap between beats!'
        )
    }

    @test()
    protected static async derivesHeartRateOnlyFromPeakChannels() {
        FakePpgDetector.peakTimestamps = [10, 11]

        await this.render({
            samples: [1, 1, 1, 1, 1, 1],
            timestamps: [0, 10, 30],
            channelNames: ['INFRARED', 'RED'],
            detectPeaks: {
                ...this.heartRateOverThirtySeconds,
                channels: ['GREEN'],
            },
        })

        assert.isEqual(
            this.heartRate,
            '-- bpm',
            'Did not derive heart rate only from peak channels!'
        )
    }

    @test()
    protected static async showsPlaceholderWhenTooFewBeatsWereDetected() {
        FakePpgDetector.peakTimestamps = [10]

        await this.renderOneChannelAt(
            [0, 10, 30],
            this.heartRateOverThirtySeconds
        )

        assert.isEqual(
            this.heartRate,
            '-- bpm',
            'Did not show placeholder when too few beats were detected!'
        )
    }

    @test()
    protected static async showsNoBandPowersWithoutBandPowerOptions() {
        await this.render(this.twoChannels)

        assert.isEqual(
            this.plot.querySelectorAll('.stream-plot__band-power').length,
            0,
            'Showed band powers without band power options!'
        )
    }

    @test()
    protected static async showsHeaderAboveEachChannelPlot() {
        await this.render(this.twoChannels)

        const channels = Array.from(
            this.plot.querySelectorAll('.stream-plot__channel')
        )

        assert.isEqualDeep(
            channels.map(
                (channel) => channel.firstElementChild?.className ?? undefined
            ),
            ['stream-plot__channel-header', 'stream-plot__channel-header'],
            'Did not show header above each channel plot!'
        )
    }

    @test('labels with given names', ['X', 'Y'], ['X', 'Y'])
    @test('numbers channels without names', undefined, ['CH 1', 'CH 2'])
    protected static async labelsEachChannelWithItsName(
        channelNames: string[] | undefined,
        expected: string[]
    ) {
        await this.render({ ...this.twoChannels, channelNames })

        assert.isEqualDeep(
            this.channelNames,
            expected,
            'Did not label each channel with its name!'
        )
    }

    @test()
    protected static async leavesOnlyChannelUnlabelledAsStreamNameSaysEnough() {
        await this.renderOneChannelAt([0, 1], undefined)

        assert.isEqualDeep(
            this.channelNames,
            [],
            'Did not leave only channel unlabelled!'
        )
    }

    @test()
    protected static async labelsOnlyChannelWhenItShowsBandPowers() {
        await this.renderOscillating([10])

        assert.isEqualDeep(
            this.channelNames,
            ['CH 1'],
            'Did not label only channel when it shows band powers!'
        )
    }

    @test()
    protected static async showsBandPowersRightOfEachChannelName() {
        await this.render({
            ...this.twoChannels,
            bandPowers: this.bandPowersOverFourSeconds,
        })

        assert.isEqualDeep(
            this.bandPowers.map((powers) => Object.keys(powers).length),
            [5, 5],
            'Did not show band powers right of each channel name!'
        )
    }

    @test('fits longest given name', ['TP9', 'AUX_RIGHT'], '9')
    @test('fits longest default name', undefined, '4')
    protected static async givesEveryChannelNameRoomForLongestSoBandPowersAlign(
        channelNames: string[] | undefined,
        expected: string
    ) {
        await this.render({
            ...this.twoChannels,
            channelNames,
            bandPowers: this.bandPowersOverFourSeconds,
        })

        assert.isEqual(
            this.plot.style.getPropertyValue('--channel-name-length'),
            expected,
            'Did not give every channel name room for longest!'
        )
    }

    @test()
    protected static async namesEachBandFromSlowestToQuickest() {
        await this.renderOscillating([10])

        assert.isEqualDeep(
            Object.keys(this.bandPowers[0]),
            ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'],
            'Did not name each band from slowest to quickest!'
        )
    }

    @test('gives 2 Hz to delta', 2, 'Delta')
    @test('gives 6 Hz to theta', 6, 'Theta')
    @test('gives 10 Hz to alpha', 10, 'Alpha')
    @test('gives 20 Hz to beta', 20, 'Beta')
    @test('gives 40 Hz to gamma', 40, 'Gamma')
    protected static async givesAllPowerToBandOfOscillation(
        hz: number,
        band: string
    ) {
        await this.renderOscillating([hz])

        assert.isEqualDeep(
            this.bandPowers[0],
            { ...this.noPowerInAnyBand, [band]: '100%' },
            `Did not give all power to band of ${hz} Hz oscillation!`
        )
    }

    @test()
    protected static async sharesPowerBetweenBandsOfEquallyStrongOscillations() {
        await this.renderOscillating([10, 20])

        assert.isEqualDeep(
            this.bandPowers[0],
            { ...this.noPowerInAnyBand, Alpha: '50%', Beta: '50%' },
            'Did not share power between bands of equally strong oscillations!'
        )
    }

    @test()
    protected static async derivesBandPowersOfEachChannelFromItsOwnSamples() {
        const alpha = this.oscillationAt([10])
        const beta = this.oscillationAt([20])

        await this.render({
            samples: alpha.flatMap((value, i) => [value, beta[i]]),
            timestamps: this.timestampsFor(alpha),
            bandPowers: this.bandPowersOverFourSeconds,
        })

        assert.isEqualDeep(
            this.bandPowers.map(({ Alpha, Beta }) => ({ Alpha, Beta })),
            [
                { Alpha: '100%', Beta: '0%' },
                { Alpha: '0%', Beta: '100%' },
            ],
            'Did not derive band powers of each channel from its own samples!'
        )
    }

    @test()
    protected static async derivesBandPowersOnlyFromSamplesInsideWindow() {
        const samples = [
            ...this.oscillationAt([10]),
            ...this.oscillationAt([20]),
        ]

        await this.render({
            samples,
            timestamps: this.timestampsFor(samples),
            bandPowers: this.bandPowersOverFourSeconds,
        })

        assert.isEqualDeep(
            this.bandPowers[0],
            { ...this.noPowerInAnyBand, Beta: '100%' },
            'Did not derive band powers only from samples inside window!'
        )
    }

    @test()
    protected static async leavesSteadyOffsetOutOfBandPowersAtAnySampleRate() {
        const sampleRate = 250
        const samples = this.oscillationAt([10], { sampleRate }).map(
            (value) => value + 1000
        )

        await this.render({
            samples,
            timestamps: this.timestampsFor(samples, sampleRate),
            bandPowers: { ...this.bandPowersOverFourSeconds, sampleRate },
        })

        assert.isEqualDeep(
            this.bandPowers[0],
            { ...this.noPowerInAnyBand, Alpha: '100%' },
            'Did not leave steady offset out of band powers at any sample rate!'
        )
    }

    @test()
    protected static async showsPlaceholdersUntilBandPowerWindowIsFilled() {
        await this.renderOscillating([10], { seconds: 3.5 })

        assert.isEqualDeep(
            this.bandPowers[0],
            this.placeholderInEveryBand,
            'Did not show placeholders until band power window is filled!'
        )
    }

    @test()
    protected static async showsPlaceholdersWhenSignalHasNoPowerInAnyBand() {
        const samples = this.oscillationAt([10]).map(() => 1)

        await this.render({
            samples,
            timestamps: this.timestampsFor(samples),
            bandPowers: this.bandPowersOverFourSeconds,
        })

        assert.isEqualDeep(
            this.bandPowers[0],
            this.placeholderInEveryBand,
            'Did not show placeholders when signal has no power in any band!'
        )
    }

    @test()
    protected static async showsPlaceholdersWhenMostOfWindowWasDropped() {
        const samples = this.oscillationAt([10])
        const timestamps = this.timestampsFor(samples)
        const isKept = (i: number) => i < 100 || i >= samples.length - 100

        await this.render({
            samples: samples.filter((_, i) => isKept(i)),
            timestamps: timestamps.filter((_, i) => isKept(i)),
            bandPowers: this.bandPowersOverFourSeconds,
        })

        assert.isEqualDeep(
            this.bandPowers[0],
            this.placeholderInEveryBand,
            'Did not show placeholders when most of window was dropped!'
        )
    }

    @test()
    protected static async showsNoAverageBandPowersWithoutBandPowerOptions() {
        await this.render(this.twoChannels)

        assert.isEqual(
            this.averageBandPowers,
            undefined,
            'Showed average band powers without band power options!'
        )
    }

    @test()
    protected static async showsLabelledAverageBandPowersRightOfStreamName() {
        await this.renderAlphaAndBetaChannels()

        const average = this.plot.querySelector(
            '.stream-plot__average-band-powers'
        )

        assert.isEqualDeep(
            {
                isRightOfName:
                    average?.previousElementSibling ===
                    this.plot.querySelector('.stream-plot__name'),
                label: average?.firstElementChild?.textContent,
                numBars: average?.querySelectorAll(
                    '.stream-plot__band-power-bar'
                ).length,
            },
            { isRightOfName: true, label: 'Average', numBars: 5 },
            'Did not show labelled average band powers right of stream name!'
        )
    }

    @test()
    protected static async averagesBandPowersAcrossChannels() {
        await this.renderAlphaAndBetaChannels()

        assert.isEqualDeep(
            this.averageBandPowers,
            { ...this.noPowerInAnyBand, Alpha: '50%', Beta: '50%' },
            'Did not average band powers across channels!'
        )
    }

    @test()
    protected static async leavesGivenChannelsOutOfAverageButShowsTheirOwn() {
        await this.renderAlphaAndBetaChannels({
            channelNames: ['TP9', 'AUX'],
            bandPowers: {
                ...this.bandPowersOverFourSeconds,
                channelsLeftOutOfAverage: ['AUX'],
            },
        })

        assert.isEqualDeep(
            {
                average: this.averageBandPowers,
                betaOfLeftOut: this.bandPowers[1].Beta,
            },
            {
                average: { ...this.noPowerInAnyBand, Alpha: '100%' },
                betaOfLeftOut: '100%',
            },
            'Did not leave given channels out of average but show their own!'
        )
    }

    @test()
    protected static async leavesChannelWithNoBandPowersOutOfAverage() {
        const alpha = this.oscillationAt([10])

        await this.render({
            samples: alpha.flatMap((value) => [value, 1]),
            timestamps: this.timestampsFor(alpha),
            bandPowers: this.bandPowersOverFourSeconds,
        })

        assert.isEqualDeep(
            this.averageBandPowers,
            { ...this.noPowerInAnyBand, Alpha: '100%' },
            'Did not leave channel with no band powers out of average!'
        )
    }

    @test()
    protected static async showsAveragePlaceholdersUntilBandPowerWindowIsFilled() {
        await this.renderOscillating([10], { seconds: 3.5 })

        assert.isEqualDeep(
            this.averageBandPowers,
            this.placeholderInEveryBand,
            'Did not show average placeholders until window is filled!'
        )
    }

    @test()
    protected static async keepsAverageBandPowersShownWhenChannelsAreHidden() {
        await this.renderAlphaAndBetaChannels()

        this.clickPlot()

        assert.isEqualDeep(
            this.averageBandPowers,
            { ...this.noPowerInAnyBand, Alpha: '50%', Beta: '50%' },
            'Did not keep average band powers shown when channels are hidden!'
        )
    }

    @test()
    protected static async showsNoAverageBandPowersBeforeFirstData() {
        await this.render({ bandPowers: this.bandPowersOverFourSeconds })

        assert.isEqual(
            this.averageBandPowers,
            undefined,
            'Showed average band powers before first data!'
        )
    }

    @test()
    protected static async showsBandPowerBarsBetweenChannelNameAndFirstBand() {
        await this.renderOscillating([10])

        const bars = this.channelRows.querySelector(
            '.stream-plot__band-power-bars'
        )

        assert.isEqualDeep(
            {
                before: bars?.previousElementSibling?.className,
                after: bars?.nextElementSibling?.className,
                numBars: this.bandPowerBars.length,
            },
            {
                before: 'stream-plot__channel-name',
                after: 'stream-plot__band-power',
                numBars: 5,
            },
            'Did not show band power bars between channel name and first band!'
        )
    }

    @test()
    protected static async raisesEachBarToItsBandShareOfChartHeight() {
        await this.renderOscillating([10, 20])

        assert.isEqualDeep(
            this.bandPowerBars.map((bar) => bar.style.height),
            ['0%', '0%', '50%', '50%', '0%'],
            'Did not raise each bar to its band share of chart height!'
        )
    }

    @test()
    protected static async leavesBarsFlatUntilBandPowerWindowIsFilled() {
        await this.renderOscillating([10], { seconds: 3.5 })

        assert.isEqualDeep(
            this.bandPowerBars.map((bar) => bar.style.height),
            ['0%', '0%', '0%', '0%', '0%'],
            'Did not leave bars flat until band power window is filled!'
        )
    }

    @test()
    protected static async givesEachBandItsOwnColor() {
        await this.renderOscillating([10])

        const colors = this.bandPowerBars.map(
            (bar) => bar.style.backgroundColor
        )

        assert.isEqualDeep(
            {
                numDistinct: new Set(colors).size,
                areAllSet: colors.every((color) => color !== ''),
            },
            { numDistinct: 5, areAllSet: true },
            'Did not give each band its own color!'
        )
    }

    @test()
    protected static async showsColorOfEachBarLeftOfItsBandName() {
        await this.renderOscillating([10])

        assert.isEqualDeep(
            this.bandPowerSwatches.map((swatch) => ({
                color: swatch.style.backgroundColor,
                isLeftOfName:
                    swatch.nextElementSibling?.className ===
                    'stream-plot__band-power-name',
            })),
            this.bandPowerBars.map((bar) => ({
                color: bar.style.backgroundColor,
                isLeftOfName: true,
            })),
            'Did not show color of each bar left of its band name!'
        )
    }

    @test()
    protected static async showsNoHrvWithoutHrvWindow() {
        await this.renderOneChannelAt([0], this.heartRateOverThirtySeconds)

        assert.isEqual(this.hrv, undefined, 'Showed HRV without HRV window!')
    }

    @test()
    protected static async showsLabelledHrvRightOfHeartRate() {
        await this.renderOneChannelAt([0], {
            ...this.heartRateOverThirtySeconds,
            ...this.hrvOverFiveMinutes,
        })

        const hrv = this.plot.querySelector('.stream-plot__readout--hrv')

        assert.isEqualDeep(
            {
                label: hrv?.firstElementChild?.textContent,
                isRightOfHeartRate:
                    hrv?.previousElementSibling ===
                    this.plot.querySelector(
                        '.stream-plot__readout--heart-rate'
                    ),
            },
            { label: 'HRV (RMSSD)', isRightOfHeartRate: true },
            'Did not show labelled HRV right of heart rate!'
        )
    }

    @test('counts down from five minutes at first data', [5], 'Ready in 5:00')
    @test('counts down minutes and seconds', [5, 6.5], 'Ready in 4:59')
    @test('pads seconds within a minute', [5, 60], 'Ready in 4:05')
    @test('counts down seconds in last minute', [5, 250.5], 'Ready in 55s')
    protected static async countsDownUntilHrvWindowIsFilled(
        timestamps: number[],
        expected: string
    ) {
        await this.renderOneChannelAt(timestamps, this.hrvOverFiveMinutes)

        assert.isEqual(
            this.hrv,
            expected,
            'Did not count down until HRV window was filled!'
        )
    }

    @test()
    protected static async showsRmssdInMillisecondsOnceWindowIsFilled() {
        FakePpgDetector.peakTimestamps = [10, 11, 12.1, 13.1]

        await this.renderOneChannelAt(
            [0, 10, 11, 12.1, 13.1, 301],
            this.hrvOverFiveMinutes
        )

        assert.isEqual(
            this.hrv,
            '100 ms',
            'Did not show RMSSD in milliseconds once window was filled!'
        )
    }

    @test()
    protected static async marksHrvReliableOnceWindowIsFilled() {
        await this.renderOneChannelAt([0, 301], this.hrvOverFiveMinutes)

        assert.isEqual(
            this.hrvNote,
            '(reliable)',
            'Did not mark HRV reliable once window was filled!'
        )
    }

    @test()
    protected static async marksCountdownToProvisionalHrvAsUnreliable() {
        await this.renderOneChannelAt([0, 20], this.provisionalHrv)

        assert.isEqualDeep(
            { value: this.hrv, note: this.hrvNote },
            { value: 'Ready in 10s', note: '(unreliable)' },
            'Did not mark countdown to provisional HRV as unreliable!'
        )
    }

    @test()
    protected static async showsNoHrvNoteWhileCountingDownToReliableValue() {
        await this.renderOneChannelAt([0, 20], this.hrvOverFiveMinutes)

        assert.isEqualDeep(
            { value: this.hrv, note: this.hrvNote },
            { value: 'Ready in 4:40', note: undefined },
            'Showed an HRV note while counting down to reliable value!'
        )
    }

    @test()
    protected static async showsUnreliableHrvWithCountdownBeforeWindowIsFilled() {
        FakePpgDetector.peakTimestamps = [10, 11, 12.1, 13.1]

        await this.renderOneChannelAt(
            [0, 10, 11, 12.1, 13.1, 40],
            this.provisionalHrv
        )

        assert.isEqualDeep(
            { value: this.hrv, note: this.hrvNote },
            { value: '100 ms', note: '(unreliable, reliable in 4:20)' },
            'Did not show unreliable HRV with countdown before window filled!'
        )
    }

    @test()
    protected static async marksProvisionalHrvReliableOnceWindowIsFilled() {
        FakePpgDetector.peakTimestamps = [10, 11, 12.1, 13.1]

        await this.renderOneChannelAt(
            [0, 10, 11, 12.1, 13.1, 300],
            this.provisionalHrv
        )

        assert.isEqualDeep(
            { value: this.hrv, note: this.hrvNote },
            { value: '100 ms', note: '(reliable)' },
            'Did not mark provisional HRV reliable once window was filled!'
        )
    }

    @test()
    protected static async leavesMissedBeatOutOfHrv() {
        FakePpgDetector.peakTimestamps = [10, 11, 12, 14, 15, 16]

        await this.renderOneChannelAt(
            [0, 10, 11, 12, 14, 15, 16, 301],
            this.hrvOverFiveMinutes
        )

        assert.isEqual(
            this.hrv,
            '0 ms',
            'Did not leave missed beat out of HRV!'
        )
    }

    @test()
    protected static async leavesImplausiblyFastBeatsOutOfHrv() {
        FakePpgDetector.peakTimestamps = [10, 11, 12, 12.28, 13.28, 14.28]

        await this.renderOneChannelAt(
            [0, 10, 11, 12, 12.28, 13.28, 14.28, 301],
            this.hrvOverFiveMinutes
        )

        assert.isEqual(
            this.hrv,
            '0 ms',
            'Did not leave implausibly fast beats out of HRV!'
        )
    }

    @test()
    protected static async leavesBeatsStillSettlingOutOfHrv() {
        FakePpgDetector.peakTimestamps = [298, 299, 300.1]

        await this.renderOneChannelAt(
            [0, 298, 299, 300.1, 301],
            this.hrvOverFiveMinutes
        )

        assert.isEqual(
            this.hrv,
            '-- ms',
            'Did not leave beats still settling out of HRV!'
        )
    }

    @test()
    protected static async countsBeatOnceWhenDetectedAgainSlightlyShifted() {
        FakePpgDetector.peakTimestamps = [10, 11, 12.1, 13.1]

        await this.renderOneChannelThenAt(
            [0, 10, 11, 12.1, 13.1, 301],
            [0, 10, 11, 12.1, 13.1, 14.1, 302],
            [10.05, 11, 12.1, 13.1, 14.1]
        )

        assert.isEqual(
            this.hrv,
            '82 ms',
            'Did not count beat once when detected again slightly shifted!'
        )
    }

    @test()
    protected static async dropsBeatsOlderThanHrvWindow() {
        FakePpgDetector.peakTimestamps = [10, 11, 12.1]

        await this.renderOneChannelThenAt(
            [0, 10, 11, 12.1, 301],
            [200, 201, 202, 400],
            [200, 201, 202]
        )

        assert.isEqual(
            this.hrv,
            '0 ms',
            'Did not drop beats older than HRV window!'
        )
    }

    @test()
    protected static async showsPlaceholderWhenTooFewBeatsForHrv() {
        FakePpgDetector.peakTimestamps = [10, 11]

        await this.renderOneChannelAt([0, 10, 11, 301], this.hrvOverFiveMinutes)

        assert.isEqual(
            this.hrv,
            '-- ms',
            'Did not show placeholder when too few beats for HRV!'
        )
    }

    @test()
    protected static async detectsPeaksInEachChannel() {
        await this.render({
            ...this.twoChannels,
            detectPeaks: { sampleRate: 64 },
        })

        assert.isEqualDeep(
            FakePpgDetector.callsToRun,
            [
                { rawSignal: [1, 2, 3], timestamps: [0, 1, 2] },
                { rawSignal: [10, 20, 30], timestamps: [0, 1, 2] },
            ],
            'Did not detect peaks in each channel!'
        )
    }

    @test()
    protected static async marksDetectedPeaksOnTrace() {
        FakePpgDetector.peakTimestamps = [1]

        await this.render({
            ...this.twoChannels,
            detectPeaks: { sampleRate: 64 },
        })

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.data[2]),
            [
                [null, 2, null],
                [null, 20, null],
            ],
            'Did not mark detected peaks on trace!'
        )
    }

    @test()
    protected static async detectsPeaksOnlyInGivenChannels() {
        await this.render({
            ...this.twoChannels,
            channelNames: ['INFRARED', 'RED'],
            detectPeaks: { sampleRate: 64, channels: ['INFRARED'] },
        })

        assert.isEqualDeep(
            FakePpgDetector.callsToRun,
            [{ rawSignal: [1, 2, 3], timestamps: [0, 1, 2] }],
            'Did not detect peaks only in given channels!'
        )
    }

    @test()
    protected static async leavesOtherChannelsWithoutPeakMarkers() {
        FakePpgDetector.peakTimestamps = [1]

        await this.render({
            ...this.twoChannels,
            channelNames: ['INFRARED', 'RED'],
            detectPeaks: { sampleRate: 64, channels: ['INFRARED'] },
        })

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.data[2]),
            [
                [null, 2, null],
                [null, null, null],
            ],
            'Did not leave other channels without peak markers!'
        )
    }

    @test()
    protected static async matchesPeakChannelsByNumberWithoutNames() {
        await this.render({
            ...this.twoChannels,
            detectPeaks: { sampleRate: 64, channels: ['CH 2'] },
        })

        assert.isEqualDeep(
            FakePpgDetector.callsToRun,
            [{ rawSignal: [10, 20, 30], timestamps: [0, 1, 2] }],
            'Did not match peak channels by number without names!'
        )
    }

    @test()
    protected static async skipsPeakDetectionWithinInterval() {
        await this.renderThenUpdate(
            { ...this.twoChannels, detectPeaks: { sampleRate: 64 } },
            {
                samples: [1, 10, 2, 20, 3, 30, 4, 40],
                timestamps: [0, 1, 2, 2.2],
                detectPeaks: { sampleRate: 64 },
            }
        )

        assert.isEqual(
            FakePpgDetector.callsToRun.length,
            2,
            'Did not skip peak detection within interval!'
        )
    }

    @test()
    protected static async detectsPeaksAgainOnceIntervalPasses() {
        await this.renderThenUpdate(
            { ...this.twoChannels, detectPeaks: { sampleRate: 64 } },
            {
                samples: [1, 10, 2, 20, 3, 30, 4, 40],
                timestamps: [0, 1, 2, 2.6],
                detectPeaks: { sampleRate: 64 },
            }
        )

        assert.isEqual(
            FakePpgDetector.callsToRun.length,
            4,
            'Did not detect peaks again once interval passed!'
        )
    }

    @test()
    protected static async keepsPeakMarkersOnPeakSamplesBetweenDetections() {
        FakePpgDetector.peakTimestamps = [1]

        await this.renderThenUpdate(
            { ...this.twoChannels, detectPeaks: { sampleRate: 64 } },
            {
                samples: [2, 20, 3, 30, 4, 40],
                timestamps: [1, 2, 2.2],
                detectPeaks: { sampleRate: 64 },
            }
        )

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.data[2]),
            [
                [2, null, null],
                [20, null, null],
            ],
            'Did not keep peak markers on peak samples between detections!'
        )
    }

    @test()
    protected static async keepsEverySampleWithoutDownsampling() {
        await this.render({ ...this.oneChannelMaxBeforeMin, width: 1 })

        assert.isEqualDeep(
            FakeUPlot.latest.data,
            [
                [0, 1, 2, 3, 4],
                [5, 9, 3, 1, 4],
            ],
            'Did not keep every sample without downsampling!'
        )
    }

    @test()
    protected static async keepsMinAndMaxPerPixelWithLightDownsampling() {
        await this.render({
            ...this.oneChannelMaxBeforeMin,
            width: 1,
            downsampling: 'light',
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data,
            [
                [1, 3],
                [9, 1],
            ],
            'Did not keep min and max per pixel with light downsampling!'
        )
    }

    @test('light keeps all six samples', 'light', [0, 1, 3, 4, 6, 8])
    @test('medium keeps four samples', 'medium', [0, 4, 6, 8])
    @test('heavy keeps two samples', 'heavy', [0, 8])
    protected static async keepsFewerSamplesWithHeavierDownsampling(
        downsampling: Downsampling,
        expectedTimestamps: number[]
    ) {
        await this.render({
            samples: [1, 2, 3, 4, 5, 6],
            timestamps: [0, 1, 3, 4, 6, 8],
            width: 4,
            downsampling,
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data[0],
            expectedTimestamps,
            `Did not keep expected samples with ${downsampling} downsampling!`
        )
    }

    @test()
    protected static async alignsBucketsToAbsoluteTime() {
        await this.render({
            samples: [1, 2, 3, 4],
            timestamps: [3, 4, 5, 6],
            width: 2,
            downsampling: 'light',
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data,
            [
                [3, 4, 5, 6],
                [1, 2, 3, 4],
            ],
            'Did not align buckets to absolute time!'
        )
    }

    @test()
    protected static async keepsPeakSamplesWhenDecimating() {
        FakePpgDetector.peakTimestamps = [2]

        await this.render({
            ...this.oneChannelMaxBeforeMin,
            width: 1,
            downsampling: 'light',
            detectPeaks: { sampleRate: 64 },
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data,
            [
                [1, 2, 3],
                [9, 3, 1],
                [null, 3, null],
            ],
            'Did not keep peak samples when decimating!'
        )
    }

    @test()
    protected static async hidesChannelsWhenClicked() {
        await this.render(this.twoChannels)

        this.clickPlot()

        assert.isEqualDeep(
            {
                numChannels: this.plot.querySelectorAll('.stream-plot__channel')
                    .length,
                arePlotsDestroyed: FakeUPlot.instances.map(
                    (plot) => plot.isDestroyed
                ),
            },
            { numChannels: 0, arePlotsDestroyed: [true, true] },
            'Did not hide channels when clicked!'
        )
    }

    @test()
    protected static async keepsIndicatorAndNameWhenHidden() {
        await this.render(this.twoChannels)

        this.clickPlot()

        assert.isEqualDeep(
            {
                hasIndicator:
                    this.plot.querySelector('.stream-plot__indicator') !== null,
                name: screen.queryByText(this.plotName)?.textContent,
            },
            { hasIndicator: true, name: this.plotName },
            'Did not keep indicator and name when hidden!'
        )
    }

    @test()
    protected static async showsHiddenChannelCountWithoutWindowWhenHidden() {
        await this.render(this.twoChannels)

        this.clickPlot()

        assert.isEqual(
            this.meta,
            '2 ch · Hidden',
            'Did not show hidden channel count without window when hidden!'
        )
    }

    @test()
    protected static async showsChannelCountAndWindowAgainWhenShownAgain() {
        await this.render(this.twoChannels)

        this.clickPlot()
        this.clickPlot()

        assert.isEqual(
            this.meta,
            '2 ch · 10s window',
            'Did not show channel count and window again when shown again!'
        )
    }

    @test()
    protected static async showsAwaitingSignalWhenHiddenWithoutSamples() {
        await this.render()

        this.clickPlot()

        assert.isEqual(
            this.meta,
            'Awaiting signal',
            'Did not show awaiting signal when hidden without samples!'
        )
    }

    @test()
    protected static async plotsChannelsAgainWhenClickedAgain() {
        await this.render(this.twoChannels)

        this.clickPlot()
        this.clickPlot()

        assert.isEqualDeep(
            FakeUPlot.instances
                .filter((plot) => !plot.isDestroyed)
                .map((plot) => plot.data),
            [
                [
                    [0, 1, 2],
                    [1, 2, 3],
                ],
                [
                    [0, 1, 2],
                    [10, 20, 30],
                ],
            ],
            'Did not plot channels again when clicked again!'
        )
    }

    @test()
    protected static async staysHiddenWhenNewSamplesArrive() {
        const { rerender } = await this.render(this.twoChannels)

        this.clickPlot()
        rerender(
            <StreamPlot
                name={this.plotName}
                samples={[1, 10, 2, 20, 3, 30, 4, 40]}
                timestamps={[0, 1, 2, 3]}
            />
        )

        assert.isEqualDeep(
            FakeUPlot.instances.filter((plot) => !plot.isDestroyed),
            [],
            'Did not stay hidden when new samples arrived!'
        )
    }

    @test()
    protected static async destroysPlotsOnUnmount() {
        const { unmount } = await this.render(this.twoChannels)

        unmount()

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.isDestroyed),
            [true, true],
            'Did not destroy plots on unmount!'
        )
    }

    @test()
    protected static async measuresWidthOfChannelsRatherThanWholeCard() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            FakeResizeObserver.latest.observed.map(
                (element) => element.className
            ),
            ['stream-plot__channels'],
            'Did not measure width of channels!'
        )
    }

    @test()
    protected static async fillsContainerWidthByDefault() {
        await this.render(this.twoChannels)

        act(() => FakeResizeObserver.latest.resize(800))

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.size?.width),
            [800, 800],
            'Did not fill container width by default!'
        )
    }

    @test()
    protected static async usesGivenWidthInsteadOfContainerWidth() {
        await this.render({ ...this.twoChannels, width: 100 })

        assert.isEqual(
            FakeResizeObserver.instances.length,
            0,
            'Observed container width despite a given width!'
        )
    }

    @test()
    protected static async stopsObservingContainerOnUnmount() {
        const { unmount } = await this.render(this.twoChannels)

        unmount()

        assert.isTrue(
            FakeResizeObserver.latest.isDisconnected,
            'Did not stop observing container on unmount!'
        )
    }

    @test('labels seconds', 30, '2 ch · 30s window')
    @test('labels whole minutes', 120, '2 ch · 2m window')
    @test('labels minutes and seconds', 90, '2 ch · 1m 30s window')
    protected static async labelsWindow(windowSeconds: number, label: string) {
        await this.render({ ...this.twoChannels, windowSeconds })

        assert.isEqual(this.meta, label, 'Did not label window!')
    }

    @test()
    protected static async labelsAllWindowAsAllData() {
        await this.render({ ...this.twoChannels, windowSeconds: Infinity })

        assert.isEqual(
            this.meta,
            '2 ch · All data',
            'Did not label all window as all data!'
        )
    }

    @test()
    protected static async changesToAllWindow() {
        await this.renderWithChangeableWindow()

        this.pressWindowLabel()
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'All' }))

        assert.isEqualDeep(
            this.chosenWindows,
            [Infinity],
            'Did not change to all window!'
        )
    }

    @test()
    protected static async showsEverythingSinceFirstSampleInAllWindow() {
        await this.render({
            samples: [1, 2, 3],
            timestamps: [0, 100, 1000],
            windowSeconds: Infinity,
            nowTimestamp: 1500,
        })

        assert.isEqualDeep(
            { xScales: this.xScales, data: FakeUPlot.latest.data },
            {
                xScales: [{ min: 0, max: 1500 }],
                data: [
                    [0, 100, 1000],
                    [1, 2, 3],
                ],
            },
            'Did not show everything since first sample in all window!'
        )
    }

    @test()
    protected static async decimatesAllWindowAcrossEverythingShown() {
        await this.render({
            samples: [5, 9, 3, 1, 4, 2],
            timestamps: [0, 1, 2, 3, 4, 5],
            windowSeconds: Infinity,
            nowTimestamp: 8,
            width: 4,
            downsampling: 'medium',
        })

        assert.isEqualDeep(
            FakeUPlot.latest.data[0],
            [1, 3, 4, 5],
            'Did not decimate all window across everything shown!'
        )
    }

    @test()
    protected static async showsWindowAsPlainTextWhenItCannotChange() {
        await this.render(this.twoChannels)

        assert.isFalsy(
            this.plot.querySelector('.stream-plot__meta button'),
            'Offered to change a window that cannot change!'
        )
    }

    @test()
    protected static async hidesWindowOptionsUntilLabelPressed() {
        await this.renderWithChangeableWindow()

        assert.isLength(
            this.windowOptions,
            0,
            'Showed window options before label was pressed!'
        )
    }

    @test()
    protected static async offersCommonWindowsWhenLabelPressed() {
        await this.renderWithChangeableWindow()

        this.pressWindowLabel()

        assert.isEqualDeep(
            this.windowOptions.map((option) => option.textContent),
            ['10s', '30s', '1m', '2m', '5m', 'All'],
            'Did not offer common windows when label was pressed!'
        )
    }

    @test()
    protected static async checksCurrentWindowAmongOptions() {
        await this.renderWithChangeableWindow({ windowSeconds: 120 })

        this.pressWindowLabel()

        assert.isEqualDeep(
            this.windowOptions
                .filter(
                    (option) => option.getAttribute('aria-checked') === 'true'
                )
                .map((option) => option.textContent),
            ['2m'],
            'Did not check current window among options!'
        )
    }

    @test()
    protected static async changesToChosenWindow() {
        await this.renderWithChangeableWindow()

        this.pressWindowLabel()
        fireEvent.click(screen.getByRole('menuitemradio', { name: '2m' }))

        assert.isEqualDeep(
            this.chosenWindows,
            [120],
            'Did not change to chosen window!'
        )
    }

    @test()
    protected static async closesWindowOptionsAfterChoosing() {
        await this.renderWithChangeableWindow()

        this.pressWindowLabel()
        fireEvent.click(screen.getByRole('menuitemradio', { name: '30s' }))

        assert.isLength(
            this.windowOptions,
            0,
            'Did not close window options after choosing!'
        )
    }

    @test()
    protected static async closesWindowOptionsWhenLabelPressedAgain() {
        await this.renderWithChangeableWindow()

        this.pressWindowLabel()
        this.pressWindowLabel()

        assert.isLength(
            this.windowOptions,
            0,
            'Did not close window options when label was pressed again!'
        )
    }

    @test()
    protected static async keepsChannelsShownWhenLabelPressed() {
        await this.renderWithChangeableWindow()

        this.pressWindowLabel()

        assert.isLength(
            Array.from(this.plot.querySelectorAll('.stream-plot__channel')),
            2,
            'Did not keep channels shown when label was pressed!'
        )
    }

    @test('takes plain number as seconds', '90', 90)
    @test('takes seconds with suffix', '45s', 45)
    @test('takes minutes with suffix', '3m', 180)
    @test('takes fractional minutes', '1.5 m', 90)
    protected static async changesToCustomWindow(
        typed: string,
        seconds: number
    ) {
        await this.renderWithChangeableWindow()

        this.submitCustomWindow(typed)

        assert.isEqualDeep(
            this.chosenWindows,
            [seconds],
            'Did not change to custom window!'
        )
    }

    @test('ignores words', 'soon')
    @test('ignores zero', '0')
    @test('ignores nothing typed', '')
    protected static async ignoresInvalidCustomWindow(typed: string) {
        await this.renderWithChangeableWindow()

        this.submitCustomWindow(typed)

        assert.isEqualDeep(
            { chosen: this.chosenWindows, isStillOpen: this.isMenuOpen },
            { chosen: [], isStillOpen: true },
            'Did not ignore invalid custom window!'
        )
    }

    private static chosenWindows: number[] = []

    private static async renderWithChangeableWindow(
        props?: Partial<StreamPlotProps>
    ) {
        this.chosenWindows = []

        return this.render({
            ...this.twoChannels,
            onWindowSecondsChange: (seconds) =>
                this.chosenWindows.push(seconds),
            ...props,
        })
    }

    private static pressWindowLabel() {
        fireEvent.click(screen.getByRole('button', { name: /window$/ }))
    }

    private static submitCustomWindow(typed: string) {
        this.pressWindowLabel()

        const input = screen.getByRole('textbox', { name: /custom window/i })
        fireEvent.change(input, { target: { value: typed } })
        fireEvent.submit(input.closest('form')!)
    }

    private static get windowOptions() {
        return screen.queryAllByRole('menuitemradio')
    }

    private static get isMenuOpen() {
        return screen.queryByRole('menu') !== null
    }

    private static readonly bandPowersOverFourSeconds = {
        sampleRate: 256,
        windowSeconds: 4,
    }

    private static readonly noPowerInAnyBand = {
        Delta: '0%',
        Theta: '0%',
        Alpha: '0%',
        Beta: '0%',
        Gamma: '0%',
    }

    private static readonly placeholderInEveryBand = {
        Delta: '--%',
        Theta: '--%',
        Alpha: '--%',
        Beta: '--%',
        Gamma: '--%',
    }

    private static async renderOscillating(
        frequenciesHz: number[],
        span?: { seconds: number }
    ) {
        const samples = this.oscillationAt(frequenciesHz, span)

        return this.render({
            samples,
            timestamps: this.timestampsFor(samples),
            bandPowers: this.bandPowersOverFourSeconds,
        })
    }

    private static oscillationAt(
        frequenciesHz: number[],
        options?: { seconds?: number; sampleRate?: number }
    ) {
        const { seconds = 4, sampleRate = 256 } = options ?? {}

        return Array.from({ length: seconds * sampleRate + 1 }, (_, i) =>
            frequenciesHz.reduce(
                (sum, hz) =>
                    sum + Math.sin((2 * Math.PI * hz * i) / sampleRate),
                0
            )
        )
    }

    private static timestampsFor(samples: number[], sampleRate = 256) {
        return samples.map((_, i) => i / sampleRate)
    }

    private static get bandPowers() {
        const channels = Array.from(
            this.plot.querySelectorAll('.stream-plot__channel-header')
        )

        return channels.map((channel) => this.bandPowersShownIn(channel))
    }

    private static get averageBandPowers() {
        const average = this.plot.querySelector(
            '.stream-plot__average-band-powers'
        )

        return average ? this.bandPowersShownIn(average) : undefined
    }

    private static bandPowersShownIn(element: Element) {
        return Object.fromEntries(
            Array.from(
                element.querySelectorAll('.stream-plot__band-power')
            ).map((band) => [
                band.querySelector('.stream-plot__band-power-name')
                    ?.textContent,
                band.querySelector('.stream-plot__band-power-value')
                    ?.textContent,
            ])
        )
    }

    private static async renderAlphaAndBetaChannels(
        props?: Partial<StreamPlotProps>
    ) {
        const alpha = this.oscillationAt([10])
        const beta = this.oscillationAt([20])

        return this.render({
            samples: alpha.flatMap((value, i) => [value, beta[i]]),
            timestamps: this.timestampsFor(alpha),
            bandPowers: this.bandPowersOverFourSeconds,
            ...props,
        })
    }

    private static get channelRows() {
        return this.plot.querySelector('.stream-plot__channels')!
    }

    private static get channelNames() {
        return Array.from(
            this.plot.querySelectorAll('.stream-plot__channel-name')
        ).map((name) => name.textContent)
    }

    private static get bandPowerBars() {
        return Array.from(
            this.channelRows.querySelectorAll<HTMLElement>(
                '.stream-plot__band-power-bar'
            )
        )
    }

    private static get bandPowerSwatches() {
        return Array.from(
            this.channelRows.querySelectorAll<HTMLElement>(
                '.stream-plot__band-power-swatch'
            )
        )
    }

    private static readonly twoChannels = {
        samples: [1, 10, 2, 20, 3, 30],
        timestamps: [0, 1, 2],
    }

    private static readonly heartRateOverThirtySeconds = {
        sampleRate: 64,
        heartRateWindowSeconds: 30,
    }

    private static async renderOneChannelAt(
        timestamps: number[],
        detectPeaks: StreamPlotProps['detectPeaks']
    ) {
        return this.render({
            samples: timestamps.map(() => 1),
            timestamps,
            detectPeaks,
        })
    }

    private static get heartRate() {
        return this.readoutValue('heart-rate')
    }

    private static get hrv() {
        return this.readoutValue('hrv')
    }

    private static readoutValue(kind: string) {
        return (
            this.plot.querySelector(
                `.stream-plot__readout--${kind} .stream-plot__readout-value`
            )?.textContent ?? undefined
        )
    }

    private static get hrvNote() {
        return (
            this.plot.querySelector(
                '.stream-plot__readout--hrv .stream-plot__readout-note'
            )?.textContent ?? undefined
        )
    }

    private static readonly provisionalHrv = {
        sampleRate: 64,
        hrvWindowSeconds: 300,
        hrvProvisionalAfterSeconds: 30,
    }

    private static readonly hrvOverFiveMinutes = {
        sampleRate: 64,
        hrvWindowSeconds: 300,
    }

    private static async renderOneChannelThenAt(
        timestamps: number[],
        nextTimestamps: number[],
        peakTimestampsAfter: number[]
    ) {
        const detectPeaks = this.hrvOverFiveMinutes
        const { rerender } = await this.renderOneChannelAt(
            timestamps,
            detectPeaks
        )

        FakePpgDetector.peakTimestamps = peakTimestampsAfter

        rerender(
            <StreamPlot
                name={this.plotName}
                samples={nextTimestamps.map(() => 1)}
                timestamps={nextTimestamps}
                detectPeaks={detectPeaks}
            />
        )
    }

    private static readonly oneChannelAtTwoLevels = {
        samples: [1.05, 1.05, 1.05, 3.05],
        timestamps: [0, 1, 2, 3],
    }

    private static drawOccurrenceStrip(
        plot = FakeUPlot.latest,
        yScale = { min: 0, max: 4 }
    ) {
        const bbox = { left: 100, top: 10, width: 200, height: 40 }
        const rects: StripRect[] = []

        const ctx = {
            fillStyle: '',
            globalAlpha: 1,
            fillRect(x: number, y: number, width: number, height: number) {
                rects.push({
                    x,
                    y,
                    width,
                    height,
                    color: this.fillStyle,
                    opacity: Math.round(this.globalAlpha * 100) / 100,
                })
            },
        }

        const valToPos = (value: number) =>
            bbox.top +
            bbox.height * (1 - (value - yScale.min) / (yScale.max - yScale.min))

        const draw = plot.options.hooks?.draw?.[0] as unknown as (
            plot: unknown
        ) => void

        draw({ ctx, bbox, valToPos })

        const [track, ...rows] = rects

        return {
            track: track && {
                x: track.x,
                y: track.y,
                width: track.width,
                height: track.height,
            },
            rows: rows.sort((a, b) => a.y - b.y),
        }
    }

    private static readonly oneChannelMaxBeforeMin = {
        samples: [5, 9, 3, 1, 4],
        timestamps: [0, 1, 2, 3, 4],
    }

    private static clickPlot() {
        fireEvent.click(this.plot)
    }

    private static get meta() {
        return this.plot.querySelector('.stream-plot__meta')?.textContent
    }

    private static get plot() {
        return screen.getByTestId(`stream-plot-${this.plotName}`)
    }

    private static yBarsBetween(min: number, max: number) {
        const barsFor = FakeUPlot.latest.options.axes?.[1]
            .splits as unknown as (
            plot: unknown,
            axisIdx: number,
            min: number,
            max: number
        ) => number[]

        return barsFor(FakeUPlot.latest, 1, min, max)
    }

    private static get xAxisHeight() {
        return FakeUPlot.latest.options.axes?.[0].size as number
    }

    private static xTicksBetween(
        earliest: number,
        latest: number,
        plot = FakeUPlot.latest
    ) {
        const ticksFor = plot.options.axes?.[0].splits as unknown as (
            plot: unknown,
            axisIdx: number,
            min: number,
            max: number
        ) => number[]

        return ticksFor(plot, 0, earliest, latest)
    }

    private static xTickLabelsFor(ticks: number[], plot = FakeUPlot.latest) {
        const formatTicks = plot.options.axes?.[0].values as unknown as (
            plot: unknown,
            ticks: number[]
        ) => string[]

        return formatTicks(plot, ticks)
    }

    private static yRangeFor(
        min: number | null,
        max: number | null,
        plot = FakeUPlot.latest
    ) {
        const rangeFor = FakeUPlot.latest.options.scales?.y
            ?.range as unknown as (
            plot: unknown,
            min: number | null,
            max: number | null
        ) => number[]

        return rangeFor(plot, min, max)
    }

    private static yTickLabelsFor(ticks: number[]) {
        const formatTicks = FakeUPlot.latest.options.axes?.[1]
            .values as unknown as (plot: unknown, ticks: number[]) => string[]

        return formatTicks(FakeUPlot.latest, ticks)
    }

    private static get xScales() {
        return FakeUPlot.instances.map((plot) => plot.scales.x)
    }

    private static async render(props?: Partial<StreamPlotProps>) {
        return render(<StreamPlot name={this.plotName} {...props} />)
    }

    private static async renderThenUpdate(
        props: Partial<StreamPlotProps>,
        nextProps: Partial<StreamPlotProps>
    ) {
        const { rerender } = await this.render(props)
        rerender(<StreamPlot name={this.plotName} {...nextProps} />)
    }
}

interface StripRect {
    x: number
    y: number
    width: number
    height: number
    color: string
    opacity: number
}
