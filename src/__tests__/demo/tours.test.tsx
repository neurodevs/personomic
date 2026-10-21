import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'

import DemoWebSocket from '../../demo/DemoWebSocket'
import TourPlayer from '../../demo/TourPlayer'
import tours from '../../demo/tours'
import App from '../../ui/App'
import { setWebSocketComponent } from '../../ui/components/StreamMonitor'
import AbstractPackageTest from '../AbstractPackageTest'

export default class ToursTest extends AbstractPackageTest {
    protected static async beforeEach() {
        await super.beforeEach()

        setWebSocketComponent(DemoWebSocket as any)
        DemoWebSocket.reset()
        DemoWebSocket.latencyMs = 0
        localStorage.clear()

        render(
            <TourPlayer
                tours={tours}
                backend={{
                    reset: () => DemoWebSocket.reset(),
                    setIsInstant() {},
                }}
            >
                <App isDemo />
            </TourPlayer>
        )
    }

    @test()
    protected static async offersAMuseSessionAnXdfReplayAProtocolAndLiveAnalysis() {
        assert.isEqualDeep(
            tours.map(({ title }) => title),
            [
                'How to run a session with Muse',
                'How to replay an XDF recording',
                'How to define a new protocol',
                'How real-time analytics work',
            ],
            'Did not offer a Muse session, an XDF replay, a protocol, and live analysis!'
        )
    }

    @test()
    protected static async runsAMuseSessionToTheEnd() {
        await this.playToTheEnd('How to run a session with Muse')

        assert.isEqual(
            this.caption,
            this.lastCaptionOf(this.playedTitle!),
            `Got stuck in the Muse tour at ${this.stuckStep}!`
        )
    }

    @test()
    protected static async streamsAndRecordsTheMuseBeforeStopping() {
        await this.choose('How to run a session with Muse')

        await this.goToLastStep()

        assert.isTrue(
            screen.queryByText(/^Recording to/) !== null &&
                screen.queryAllByText('EEG').length > 0,
            'Did not stream and record the Muse before stopping!'
        )
    }

    @test()
    protected static async replaysAnXdfRecordingToTheEnd() {
        await this.playToTheEnd('How to replay an XDF recording')

        assert.isEqual(
            this.caption,
            this.lastCaptionOf(this.playedTitle!),
            `Got stuck in the XDF tour at ${this.stuckStep}!`
        )
    }

    @test()
    protected static async playsTheSampleRecordingBeforeStopping() {
        await this.choose('How to replay an XDF recording')

        await this.goToLastStep()

        assert.isTrue(
            screen.queryByText(/sample-muse-session\.xdf/) !== null,
            'Did not play the sample recording before stopping!'
        )
    }

    @test()
    protected static async definesAProtocolToTheEnd() {
        await this.playToTheEnd('How to define a new protocol')

        assert.isEqual(
            this.caption,
            this.lastCaptionOf(this.playedTitle!),
            `Got stuck in the protocol tour at ${this.stuckStep}!`
        )
    }

    @test()
    protected static async choosesTheDefinedProtocolBeforeConnecting() {
        await this.choose('How to define a new protocol')

        await this.goToLastStep()

        assert.isEqualDeep(
            [
                (screen.getByRole('combobox', { name: 'Protocol' }) as any)
                    .value,
                (
                    screen.getByRole('textbox', {
                        name: 'Muse S Gen 2 nickname',
                    }) as any
                ).value,
            ],
            ['eyes-closed-baseline.json', 'Participant 1'],
            'Did not choose the defined protocol before connecting!'
        )
    }

    @test()
    protected static async explainsTheLiveAnalysisToTheEnd() {
        await this.playToTheEnd('How real-time analytics work')

        assert.isEqual(
            this.caption,
            this.lastCaptionOf(this.playedTitle!),
            `Got stuck in the live analysis tour at ${this.stuckStep}!`
        )
    }

    @test()
    protected static async showsHeartRateAndBandPowersBeforeStopping() {
        await this.choose('How real-time analytics work')

        await this.goToLastStep()

        assert.isTrue(
            screen.queryByText('Heart rate') !== null &&
                screen.queryByText('HRV (RMSSD)') !== null &&
                screen.queryByText(/^Average \(last/) !== null,
            'Did not show heart rate, HRV, and band powers before stopping!'
        )
    }

    @test()
    protected static async startsExplainingAnalyticsOnThePlayingSample() {
        await this.choose('How real-time analytics work')

        assert.isEqualDeep(
            {
                isPlayingSample:
                    screen.queryByText(/sample-muse-session\.xdf/) !== null,
                caption: this.caption,
            },
            {
                isPlayingSample: true,
                caption:
                    "Each EEG channel's last 4 seconds are split into frequency bands, from slow delta to fast gamma, showing how much of the power falls in each.",
            },
            'Did not start explaining analytics on the playing sample!'
        )
    }

    @test()
    protected static async loopsTheSampleWhileExplainingAnalytics() {
        await this.choose('How real-time analytics work')

        await this.goToLastStep()

        assert.isEqual(
            screen
                .getByRole('button', { name: 'Loop' })
                .getAttribute('aria-pressed'),
            'true',
            'Did not loop the sample while explaining analytics!'
        )
    }

    private static async playToTheEnd(title: string) {
        this.playedTitle = title
        await this.choose(title)

        const { steps } = this.tourTitled(title)

        for (let i = 1; i < steps.length; i++) {
            this.stuckStep = screen.getByText(/^Step \d+ of \d+$/).textContent
            await this.press('Next')
        }
    }

    private static async goToLastStep() {
        const dots = screen.getAllByRole('button', { name: /^Go to step/ })
        await this.pressElement(dots[dots.length - 1])
    }

    private static async choose(title: string) {
        await this.press(title)
    }

    private static async press(name: string) {
        await this.pressElement(screen.getByRole('button', { name }))
    }

    private static async pressElement(button: HTMLElement) {
        fireEvent.click(button)
        await screen.findByRole(
            'button',
            { name: 'Next', busy: false },
            { timeout: 4000 }
        )
    }

    private static get caption() {
        return screen.getByRole('status').textContent
    }

    private static tourTitled(title: string) {
        return tours.find((tour) => tour.title === title)!
    }

    private static lastCaptionOf(title: string) {
        return this.tourTitled(title).steps.at(-1)!.caption
    }

    private static stuckStep?: string | null
    private static playedTitle?: string
}
