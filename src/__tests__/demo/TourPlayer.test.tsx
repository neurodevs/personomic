import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import TourPlayer, { Tour, TourBackend } from '../../demo/TourPlayer'
import AbstractPackageTest from '../AbstractPackageTest'

export default class TourPlayerTest extends AbstractPackageTest {
    private static backendCalls: string[]

    protected static async beforeEach() {
        await super.beforeEach()

        this.backendCalls = []
        render(
            <TourPlayer tours={this.tours} backend={this.backend}>
                <Counter />
            </TourPlayer>
        )
    }

    @test()
    protected static async offersAButtonForEachTour() {
        assert.isEqualDeep(
            this.tours.map(
                ({ title }) =>
                    screen.queryByRole('button', { name: title }) !== null
            ),
            [true, true],
            'Did not offer a button for each tour!'
        )
    }

    @test()
    protected static async showsTheCaptionOfTheFirstStepOfAChosenTour() {
        await this.chooseCountingTour()

        assert.isEqual(
            this.caption,
            'Click Add once.',
            'Did not show the caption of the first step!'
        )
    }

    @test()
    protected static async showsWhichStepOfHowMany() {
        await this.chooseCountingTour()

        assert.isTrue(
            screen.queryByText('Step 1 of 4') !== null,
            'Did not show which step of how many!'
        )
    }

    @test()
    protected static async highlightsTheTargetOfTheStep() {
        await this.chooseCountingTour()

        assert.isTrue(
            this.addButton.hasAttribute('data-tour-target'),
            'Did not highlight the target of the step!'
        )
    }

    @test()
    protected static async performsTheStepOnNext() {
        await this.chooseCountingTour()

        await this.next()

        assert.isEqual(this.count, 1, 'Did not perform the step on Next!')
    }

    @test()
    protected static async showsTheNextCaptionAfterNext() {
        await this.chooseCountingTour()

        await this.next()

        assert.isEqual(
            this.caption,
            'Click Add again.',
            'Did not show the next caption after Next!'
        )
    }

    @test()
    protected static async performsTheStepsOwnActionWhenItHasOne() {
        await this.chooseCountingTour()

        await this.next()
        await this.next()
        await this.next()

        assert.isEqual(
            (screen.getByRole('textbox', { name: 'Note' }) as HTMLInputElement)
                .value,
            'Counted',
            "Did not perform the step's own action!"
        )
    }

    @test()
    protected static async movesTheHighlightOffAnEarlierTarget() {
        await this.chooseCountingTour()

        await this.next()
        await this.next()

        assert.isFalse(
            this.addButton.hasAttribute('data-tour-target'),
            'Did not move the highlight off an earlier target!'
        )
    }

    @test()
    protected static async replaysEarlierStepsInAFreshAppWhenGoingBack() {
        await this.chooseCountingTour()
        await this.next()
        await this.next()

        await this.press('Back')

        assert.isEqualDeep(
            [this.count, this.caption],
            [1, 'Click Add again.'],
            'Did not replay earlier steps in a fresh app when going back!'
        )
    }

    @test()
    protected static async jumpsToAChosenStep() {
        await this.chooseCountingTour()

        await this.press('Go to step 3')

        assert.isEqualDeep(
            [this.count, this.caption],
            [2, 'Write a note.'],
            'Did not jump to a chosen step!'
        )
    }

    @test()
    protected static async startsAChosenTourInAFreshApp() {
        fireEvent.click(this.addButton)

        await this.chooseCountingTour()

        assert.isEqual(this.count, 0, 'Did not start the tour in a fresh app!')
    }

    @test()
    protected static async resetsTheBackendAndReplaysInstantlyWhenJumping() {
        await this.chooseCountingTour()
        this.backendCalls = []

        await this.press('Go to step 3')

        assert.isEqualDeep(
            this.backendCalls,
            ['reset', 'instant', 'not instant'],
            'Did not reset the backend and replay instantly when jumping!'
        )
    }

    @test()
    protected static async disablesNextOnTheLastStep() {
        await this.chooseCountingTour()

        await this.next()
        await this.next()
        await this.next()

        assert.isEqualDeep(
            [this.caption, this.isNextDisabled],
            ['See the count.', true],
            'Did not disable Next on the last step!'
        )
    }

    @test()
    protected static async keepsNextEnabledBeforeTheLastStep() {
        await this.chooseCountingTour()

        await this.next()
        await this.next()

        assert.isFalse(
            this.isNextDisabled,
            'Disabled Next before the last step!'
        )
    }

    @test()
    protected static async offersTheToursAgainAfterExiting() {
        await this.chooseCountingTour()

        fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }))

        assert.isTrue(
            screen.queryByRole('button', { name: 'Count to two' }) !== null,
            'Did not offer the tours again after exiting!'
        )
    }

    @test()
    protected static async saysWhenAStepCannotBeShown() {
        await this.press('Find what is not there')

        assert.isEqual(
            this.caption,
            this.stuckCaption,
            'Did not say when a step cannot be shown!'
        )
    }

    @test()
    protected static async staysOnAnEarlierStepThatCannotBeReplayed() {
        await this.press('Find what is not there')

        await this.press('Go to step 2')

        assert.isEqualDeep(
            [this.caption, this.addButton.hasAttribute('data-tour-target')],
            [this.stuckCaption, false],
            'Did not stay on an earlier step that cannot be replayed!'
        )
    }

    private static async chooseCountingTour() {
        await this.press('Count to two')
    }

    private static async next() {
        await this.press('Next')
    }

    private static async press(name: string) {
        fireEvent.click(screen.getByRole('button', { name }))
        await screen.findByRole('button', { name: 'Next', busy: false })
    }

    private static get isNextDisabled() {
        return (
            screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
        ).disabled
    }

    private static get caption() {
        return screen.getByRole('status').textContent
    }

    private static get count() {
        return Number(screen.getByTestId('count').textContent)
    }

    private static get addButton() {
        return screen.getByRole('button', { name: 'Add' })
    }

    private static readonly stuckCaption =
        'This step could not be shown. Go back, or exit the tour.'

    private static readonly backend: TourBackend = {
        reset: () => this.backendCalls.push('reset'),
        setIsInstant: (isInstant) =>
            this.backendCalls.push(isInstant ? 'instant' : 'not instant'),
    }

    private static readonly tours: Tour[] = [
        {
            title: 'Count to two',
            steps: [
                {
                    caption: 'Click Add once.',
                    target: (view) => view.getByRole('button', { name: 'Add' }),
                },
                {
                    caption: 'Click Add again.',
                    target: (view) => view.getByRole('button', { name: 'Add' }),
                },
                {
                    caption: 'Write a note.',
                    target: (view) =>
                        view.getByRole('textbox', { name: 'Note' }),
                    act: (target) =>
                        fireEvent.change(target, {
                            target: { value: 'Counted' },
                        }),
                },
                {
                    caption: 'See the count.',
                    target: (view) => view.getByTestId('count'),
                },
            ],
        },
        {
            title: 'Find what is not there',
            steps: [
                {
                    caption: 'Click Missing.',
                    target: (view) =>
                        view.getByRole('button', { name: 'Missing' }),
                    waitsUpToMs: 10,
                },
                {
                    caption: 'Click Add.',
                    target: (view) => view.getByRole('button', { name: 'Add' }),
                },
            ],
        },
    ]
}

function Counter() {
    const [count, setCount] = useState(0)
    const [note, setNote] = useState('')

    return (
        <>
            <span data-testid="count">{count}</span>
            <button type="button" onClick={() => setCount(count + 1)}>
                Add
            </button>
            <input
                aria-label="Note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
            />
        </>
    )
}
