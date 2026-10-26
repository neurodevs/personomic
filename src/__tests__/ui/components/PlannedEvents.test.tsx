import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import PlannedEvents, {
    EventScope,
    PlannedEvent,
    plannedEventsFrom,
} from '../../../ui/components/PlannedEvents'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class PlannedEventsTest extends AbstractPackageTest {
    private static changed: PlannedEvent[]

    protected static async beforeEach() {
        await super.beforeEach()
        this.changed = []
    }

    @test()
    protected static async addsMarkerThatStartsWithItsParent() {
        this.render()

        this.clickAdd()

        assert.isEqualDeep(
            this.changed,
            [
                {
                    name: '',
                    action: { kind: 'marker' },
                    start: { delay: { ms: 0 }, from: 'parentStart' },
                    end: { kind: 'instant' },
                },
            ],
            'Did not add a marker that starts with its parent!'
        )
    }

    @test()
    protected static async tagsAndNumbersEachEvent() {
        this.render([this.event('tilt-cue'), this.event('stroke')])

        assert.isEqualDeep(
            screen.getAllByRole('listitem').map((item) => ({
                name: item.getAttribute('aria-label'),
                number: item.querySelector('.planned-events__number')
                    ?.textContent,
            })),
            [
                { name: 'Trial event 1', number: 'event #1' },
                { name: 'Trial event 2', number: 'event #2' },
            ],
            'Did not tag and number each event!'
        )
    }

    @test()
    protected static async labelsAfterTrialsEventsApartFromOthers() {
        this.render([this.event('relax')], [], 'afterTrials')

        assert.isEqualDeep(
            {
                add:
                    screen.queryByRole('button', {
                        name: 'Add after-trials event',
                    }) !== null,
                name:
                    screen.queryByLabelText('After-trials event 1 name') !==
                    null,
                startsAfter: this.optionTextsOf(
                    'After-trials event 1 starts after'
                ),
            },
            { add: true, name: true, startsAfter: ['trials end'] },
            'Did not label after-trials events apart from the others!'
        )
    }

    @test()
    protected static async namesEventInKebabCase() {
        this.render([this.event('')])

        this.type('Trial event 1 name', 'Tilt Cue')

        assert.isEqual(
            this.changed[0].name,
            'tilt-cue',
            'Did not name the event in kebab case!'
        )
    }

    @test()
    protected static async givesCueItsText() {
        this.render([this.event('tilt-cue')])

        this.choose('Trial event 1 action', 'cue')
        this.type('Trial event 1 cue', 'Tilt head left')

        assert.isEqualDeep(
            this.changed[0].action,
            { kind: 'cue', text: 'Tilt head left' },
            'Did not give the cue its text!'
        )
    }

    @test()
    protected static async givesArmItsCommand() {
        this.render([this.event('stroke')])

        this.choose('Trial event 1 action', 'arm')
        this.type('Trial event 1 arm command', 'stroke right-forearm')

        assert.isEqualDeep(
            this.changed[0].action,
            { kind: 'arm', command: 'stroke right-forearm' },
            'Did not give the arm its command!'
        )
    }

    @test()
    protected static async givesAudioItsFile() {
        this.render([this.event('tone')])

        this.choose('Trial event 1 action', 'audio')
        const before = this.audioButtonText
        fireEvent.change(screen.getByLabelText('Trial event 1 audio file'), {
            target: { files: [new File([''], 'tone.wav')] },
        })

        assert.isEqualDeep(
            {
                before,
                action: this.changed[0].action,
                after: this.audioButtonText,
            },
            {
                before: 'Choose audio…',
                action: { kind: 'audio', file: 'tone.wav' },
                after: 'tone.wav',
            },
            'Did not give the audio its file!'
        )
    }

    private static get audioButtonText() {
        return screen.getByRole('button', { name: /^Trial event 1 audio:/ })
            .textContent
    }

    @test()
    protected static async readsAudioFromProtocol() {
        assert.isEqualDeep(
            plannedEventsFrom([
                { name: 'tone', action: { kind: 'audio', file: 'tone.wav' } },
            ])[0].action,
            { kind: 'audio', file: 'tone.wav' },
            'Did not read the audio from the protocol!'
        )
    }

    @test()
    protected static async offersOtherEventsToStartAfter() {
        this.render([this.event('tilt-cue'), this.event('stroke')])

        assert.isEqualDeep(
            this.optionTextsOf('Trial event 1 starts after'),
            ['trial start', 'stroke starts', 'stroke ends'],
            'Did not offer the other events to start after!'
        )
    }

    @test()
    protected static async startsAfterAnotherEventEnds() {
        this.render([this.event('stroke'), this.event('release-cue')])

        this.choose('Trial event 2 starts after', 'end:stroke')

        assert.isEqualDeep(
            this.changed[1].start.from,
            { event: 'stroke', edge: 'end' },
            'Did not start after the other event ended!'
        )
    }

    @test()
    protected static async delaysStartBySeconds() {
        this.render([this.event('stroke')])

        this.type('Trial event 1 delay (seconds)', '3')

        assert.isEqualDeep(
            this.changed[0].start.delay,
            { ms: 3000 },
            'Did not delay the start by seconds!'
        )
    }

    @test()
    protected static async delaysStartByConditionColumn() {
        this.render([this.event('release-cue')], ['delta'])

        this.choose('Trial event 1 delay column', 'delta')

        assert.isEqualDeep(
            {
                delay: this.changed[0].start.delay,
                showsSeconds:
                    screen.queryByLabelText('Trial event 1 delay (seconds)') !==
                    null,
            },
            { delay: { column: 'delta' }, showsSeconds: false },
            'Did not delay the start by the condition column!'
        )
    }

    @test()
    protected static async offersNoColumnsWithoutConditions() {
        this.render([this.event('stroke')])

        assert.isNull(
            screen.queryByLabelText('Trial event 1 delay column'),
            'Offered condition columns without any conditions!'
        )
    }

    @test()
    protected static async lastsForGivenSeconds() {
        this.render([this.event('response-window')])

        this.choose('Trial event 1 ends', 'duration')
        this.type('Trial event 1 duration (seconds)', '60')

        assert.isEqualDeep(
            this.changed[0].end,
            { kind: 'duration', length: { ms: 60000 } },
            'Did not last for the given seconds!'
        )
    }

    @test()
    protected static async endsWhenActionFinishesOrExperimenterConfirms() {
        this.render([this.event('stroke'), this.event('tilt-set')])

        this.choose('Trial event 1 ends', 'actionFinishes')
        this.choose('Trial event 2 ends', 'experimenter')

        assert.isEqualDeep(
            this.changed.map(({ end }) => end),
            [{ kind: 'actionFinishes' }, { kind: 'experimenter' }],
            'Did not end when the action finished or the experimenter confirmed!'
        )
    }

    @test()
    protected static async keepsStartingAfterRenamedEvent() {
        this.render([
            this.event('stroke'),
            {
                ...this.event('release-cue'),
                start: {
                    delay: { ms: 0 },
                    from: { event: 'stroke', edge: 'end' },
                },
            },
        ])

        this.type('Trial event 1 name', 'ct-stroke')

        assert.isEqualDeep(
            this.changed[1].start.from,
            { event: 'ct-stroke', edge: 'end' },
            'Did not keep starting after the renamed event!'
        )
    }

    @test()
    protected static async startsWithParentOnceEventItStartsAfterIsRemoved() {
        this.render([
            this.event('stroke'),
            {
                ...this.event('release-cue'),
                start: {
                    delay: { ms: 0 },
                    from: { event: 'stroke', edge: 'end' },
                },
            },
        ])

        fireEvent.click(
            screen.getByRole('button', { name: 'Remove trial event 1' })
        )

        assert.isEqualDeep(
            this.changed.map(({ name, start }) => ({ name, from: start.from })),
            [{ name: 'release-cue', from: 'parentStart' }],
            'Did not start with the parent once the event it started after was removed!'
        )
    }

    @test()
    protected static async readsOlderResearcherConfirmationAsExperimenter() {
        assert.isEqualDeep(
            plannedEventsFrom([
                { name: 'tilt-set', end: { kind: 'researcher' } },
            ])[0].end,
            { kind: 'experimenter' },
            'Did not read an older researcher confirmation as the experimenter!'
        )
    }

    private static render(
        events: PlannedEvent[] = [],
        columns: string[] = [],
        scope: EventScope = 'trial'
    ) {
        const Harness = () => {
            const [current, setCurrent] = useState(events)

            return (
                <PlannedEvents
                    scope={scope}
                    events={current}
                    columns={columns}
                    onChange={(next) => {
                        setCurrent(next)
                        this.changed = next
                    }}
                />
            )
        }

        render(<Harness />)
    }

    private static event(name: string): PlannedEvent {
        return {
            name,
            action: { kind: 'marker' },
            start: { delay: { ms: 0 }, from: 'parentStart' },
            end: { kind: 'instant' },
        }
    }

    private static clickAdd() {
        fireEvent.click(screen.getByRole('button', { name: 'Add trial event' }))
    }

    private static type(label: string, value: string) {
        fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }

    private static choose(label: string, value: string) {
        this.type(label, value)
    }

    private static optionTextsOf(label: string) {
        const select = screen.getByLabelText(label) as HTMLSelectElement
        return [...select.options].map((option) => option.textContent)
    }
}
