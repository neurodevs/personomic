import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import FakeSpeaker from '../../../testDoubles/Speaker/FakeSpeaker'
import PlannedEvents, {
    CueVoice,
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
    protected static async offersEachActionByWhatItDoes() {
        this.render([this.event('tilt-cue')])

        assert.isEqualDeep(
            this.optionTextsOf('Trial event 1 action'),
            ['Marker only', 'Spoken cue', 'Robotic arm', 'Play audio'],
            'Did not offer each action by what it does!'
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
    protected static async playsCueAloud() {
        this.render([this.cue('tilt-cue', 'Head {tilt-side}')])

        this.clickCueButton('Play')

        assert.isEqualDeep(
            { spoken: FakeSpeaker.spoken, button: this.cueButtonVerb },
            { spoken: ['Head {tilt-side}'], button: 'Stop' },
            'Did not play the cue aloud!'
        )
    }

    @test()
    protected static async stopsCueAndPlaysItFromStartAgain() {
        this.render([this.cue('tilt-cue', 'Tilt head left')])

        this.clickCueButton('Play')
        this.clickCueButton('Stop')
        const afterStopping = this.cueButtonVerb
        this.clickCueButton('Play')

        assert.isEqualDeep(
            { calls: FakeSpeaker.calls, afterStopping },
            { calls: ['speak', 'cancel', 'speak'], afterStopping: 'Play' },
            'Did not stop the cue and play it from the start again!'
        )
    }

    @test()
    protected static async playsCueFromStartOnceItFinishes() {
        this.render([this.cue('tilt-cue', 'Tilt head left')])

        this.clickCueButton('Play')
        act(() => FakeSpeaker.finish())
        const afterFinishing = this.cueButtonVerb
        this.clickCueButton('Play')

        assert.isEqualDeep(
            { calls: FakeSpeaker.calls, afterFinishing },
            { calls: ['speak', 'speak'], afterFinishing: 'Play' },
            'Did not play the cue from the start once it finished!'
        )
    }

    @test()
    protected static async stopsCueOnceItsTextIsEdited() {
        this.render([this.cue('tilt-cue', 'Tilt head left')])

        this.clickCueButton('Play')
        this.type('Trial event 1 cue', 'Tilt head right')
        const afterEditing = this.cueButtonVerb
        this.clickCueButton('Play')

        assert.isEqualDeep(
            {
                calls: FakeSpeaker.calls,
                spoken: FakeSpeaker.spoken,
                afterEditing,
            },
            {
                calls: ['speak', 'cancel', 'speak'],
                spoken: ['Tilt head left', 'Tilt head right'],
                afterEditing: 'Play',
            },
            'Did not stop the cue once its text was edited!'
        )
    }

    @test()
    protected static async stopsCueWhenEditorCloses() {
        const { unmount } = this.render([this.cue('tilt-cue', 'Tilt')])

        this.clickCueButton('Play')
        unmount()

        assert.isEqualDeep(
            FakeSpeaker.calls,
            ['speak', 'cancel'],
            'Did not stop the cue when the editor closed!'
        )
    }

    @test()
    protected static async showsPlayAndStopAsSymbols() {
        this.render([this.cue('tilt-cue', 'Tilt head left')])

        const symbolOf = (verb: CueVerb) => ({
            text: this.cueButton(verb).textContent,
            symbol: this.cueButton(verb).querySelector('svg')?.dataset.symbol,
        })
        const beforePlaying = symbolOf('Play')
        this.clickCueButton('Play')

        assert.isEqualDeep(
            { beforePlaying, whilePlaying: symbolOf('Stop') },
            {
                beforePlaying: { text: '', symbol: 'play' },
                whilePlaying: { text: '', symbol: 'stop' },
            },
            'Did not show Play and Stop as symbols!'
        )
    }

    @test()
    protected static async speaksCueInProtocolVoice() {
        this.render(
            [this.cue('tilt-cue', 'Tilt head left')],
            [],
            'trial',
            'Rishi'
        )

        this.clickCueButton('Play')

        assert.isEqualDeep(
            FakeSpeaker.spokenVoices,
            ['Rishi'],
            'Did not speak the cue in the protocol voice!'
        )
    }

    @test()
    protected static async speaksCueInTaraUntilVoiceIsChosen() {
        this.render([this.cue('tilt-cue', 'Tilt head left')])

        this.clickCueButton('Play')

        assert.isEqualDeep(
            FakeSpeaker.spokenVoices,
            ['Tara'],
            'Did not speak the cue in Tara until a voice was chosen!'
        )
    }

    @test()
    protected static async disablesPlayUntilCueHasText() {
        this.render([this.cue('tilt-cue', '')])

        assert.isTrue(
            this.cueButton('Play').hasAttribute('disabled'),
            'Did not disable Play until the cue had text!'
        )
    }

    private static clickCueButton(verb: CueVerb) {
        fireEvent.click(this.cueButton(verb))
    }

    private static cueButton(verb: CueVerb) {
        return screen.getByRole('button', { name: `${verb} trial event 1 cue` })
    }

    private static get cueButtonVerb() {
        return screen
            .getByRole('button', { name: /trial event 1 cue$/ })
            .getAttribute('aria-label')
            ?.split(' ')[0]
    }

    private static cue(name: string, text: string): PlannedEvent {
        return { ...this.event(name), action: { kind: 'cue', text } }
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
        scope: EventScope = 'trial',
        voice?: string
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

        return render(
            voice ? (
                <CueVoice.Provider value={voice}>
                    <Harness />
                </CueVoice.Provider>
            ) : (
                <Harness />
            )
        )
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

type CueVerb = 'Play' | 'Stop'
