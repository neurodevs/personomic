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
    protected static async drawsEachChannelInGivenColor() {
        await this.render({ ...this.twoChannels, color: '#abcdef' })

        assert.isEqualDeep(
            FakeUPlot.instances.map((plot) => plot.options.series[1].stroke),
            ['#abcdef', '#abcdef'],
            'Did not draw each channel in given color!'
        )
    }

    @test()
    protected static async labelsEachChannel() {
        await this.render(this.twoChannels)

        assert.isTruthy(
            screen.getByText('CH 1') && screen.getByText('CH 2'),
            'Did not label each channel!'
        )
    }

    @test()
    protected static async labelsChannelsByName() {
        await this.render({ ...this.twoChannels, channelNames: ['TP9', 'AF7'] })

        assert.isTruthy(
            screen.getByText('TP9') && screen.getByText('AF7'),
            'Did not label channels by name!'
        )
    }

    @test()
    protected static async numbersChannelsWhenNamesDoNotMatchChannelCount() {
        await this.render({ ...this.twoChannels, channelNames: ['PPG'] })

        assert.isTruthy(
            screen.getByText('CH 1') && screen.getByText('CH 2'),
            'Did not number channels when names did not match!'
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
                labels: [
                    screen.queryByText('CH 1'),
                    screen.queryByText('CH 2'),
                ],
                arePlotsDestroyed: FakeUPlot.instances.map(
                    (plot) => plot.isDestroyed
                ),
            },
            { labels: [null, null], arePlotsDestroyed: [true, true] },
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
