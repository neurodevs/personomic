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
                { width: 100, height: 50 },
            ],
            'Did not create each channel plot with size!'
        )
    }

    @test()
    protected static async showsYAxisOnLeftOfEachChannelWithoutXAxis() {
        await this.render(this.twoChannels)

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) =>
                plot.options.axes?.map((axis) => ({
                    isShown: axis.show !== false,
                    side: axis.side,
                }))
            ),
            Array.from({ length: 2 }, () => [
                { isShown: false, side: undefined },
                { isShown: true, side: 3 },
            ]),
            'Did not show y-axis on left of each channel without x-axis!'
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

    @test()
    protected static async tellsStylesTheYAxisWidthToKeepItOutsidePlotWindow() {
        await this.render(this.twoChannels)

        assert.isEqual(
            this.plot.style.getPropertyValue('--y-axis-width'),
            `${FakeUPlot.latest.options.axes?.[1].size}px`,
            'Did not tell styles the y-axis width!'
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
    protected static async keepsYScaleWhenSignalNarrows() {
        await this.render(this.twoChannels)

        this.yRangeFor(0, 100)

        assert.isEqualDeep(
            this.yRangeFor(40, 60),
            [0, 100],
            'Did not keep y-scale when signal narrowed!'
        )
    }

    @test()
    protected static async widensYScaleUpwardKeepingLowerBound() {
        await this.render(this.twoChannels)

        this.yRangeFor(21.3, 23.9)

        assert.isEqualDeep(
            this.yRangeFor(22, 31),
            [20, 35],
            'Did not widen y-scale upward keeping lower bound covered!'
        )
    }

    @test()
    protected static async widensYScaleDownwardKeepingUpperBound() {
        await this.render(this.twoChannels)

        this.yRangeFor(0, 100)

        assert.isEqualDeep(
            this.yRangeFor(-20, 10),
            [-50, 100],
            'Did not widen y-scale downward keeping upper bound covered!'
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
    protected static async widensYScaleOfEachChannelSeparately() {
        await this.render(this.twoChannels)

        this.yRangeFor(0, 100, FakeUPlot.instances[0])

        assert.isEqualDeep(
            this.yRangeFor(40, 60, FakeUPlot.instances[1]),
            [40, 60],
            'Did not widen y-scale of each channel separately!'
        )
    }

    @test()
    protected static async scalesYAcrossGivenRangeFromFirstSample() {
        await this.render({
            ...this.twoChannels,
            yRange: { min: 0, max: 100 },
        })

        assert.isEqualDeep(
            this.yRangeFor(87, 88),
            [0, 100],
            'Did not scale y across given range from first sample!'
        )
    }

    @test()
    protected static async scalesYAcrossGivenRangeBeforeAnyDataArrives() {
        await this.render({
            ...this.twoChannels,
            yRange: { min: 0, max: 100 },
        })

        assert.isEqualDeep(
            this.yRangeFor(null, null),
            [0, 100],
            'Did not scale y across given range before any data arrived!'
        )
    }

    @test('given min only', { min: 0 }, 40, 60, [0, 60])
    @test('given max only', { max: 100 }, 87, 88, [85, 100])
    protected static async scalesYToIncludeTheOneGivenBound(
        yRange: StreamPlotProps['yRange'],
        min: number,
        max: number,
        expected: number[]
    ) {
        await this.render({ ...this.twoChannels, yRange })

        assert.isEqualDeep(
            this.yRangeFor(min, max),
            expected,
            'Did not scale y to include the one given bound!'
        )
    }

    @test()
    protected static async widensYScalePastGivenRangeWhenDataExceedsIt() {
        await this.render({
            ...this.twoChannels,
            yRange: { min: 0, max: 100 },
        })

        assert.isEqualDeep(
            this.yRangeFor(-5, 120),
            [-100, 200],
            'Did not widen y-scale past given range when data exceeded it!'
        )
    }

    @test()
    protected static async recreatesPlotsWhenGivenYRangeChanges() {
        await this.renderThenUpdate(
            { ...this.twoChannels, yRange: { min: 0 } },
            { ...this.twoChannels, yRange: { min: 0, max: 100 } }
        )

        assert.isEqualDeep(
            {
                numPlots: FakeUPlot.instances.length,
                range: this.yRangeFor(87, 88),
            },
            { numPlots: 4, range: [0, 100] },
            'Did not recreate plots when given y-range changed!'
        )
    }

    @test()
    protected static async keepsPlotsWhenGivenYRangeIsSameValues() {
        await this.renderThenUpdate(
            { ...this.twoChannels, yRange: { min: 0, max: 100 } },
            { ...this.twoChannels, yRange: { min: 0, max: 100 } }
        )

        assert.isEqual(
            FakeUPlot.instances.length,
            2,
            'Recreated plots for a y-range with the same values!'
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
    protected static async tellsStylesTheYPaddingToEndTimeBarsAtOuterYBars() {
        await this.render(this.twoChannels)

        assert.isEqual(
            this.plot.style.getPropertyValue('--y-padding'),
            `${(FakeUPlot.latest.options.padding as number[])[0]}px`,
            'Did not tell styles the y-padding!'
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
    protected static async showsNoChannelNameInsidePlotWindow() {
        await this.render({ ...this.twoChannels, channelNames: ['TP9', 'AF7'] })

        assert.isEqualDeep(
            [screen.queryByText('TP9'), screen.queryByText('AF7')],
            [null, null],
            'Showed a channel name inside plot window!'
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
