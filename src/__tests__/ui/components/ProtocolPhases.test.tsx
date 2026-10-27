import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import FakeSpeaker from '../../../testDoubles/Speaker/FakeSpeaker'
import ProtocolPhases, {
    Block,
    Phase,
    PhaseItem,
    phasesFrom,
} from '../../../ui/components/ProtocolPhases'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class ProtocolPhasesTest extends AbstractPackageTest {
    private static changed: Phase[]
    private static changedVoice?: string

    protected static async beforeEach() {
        await super.beforeEach()
        this.changed = []
        this.changedVoice = undefined
    }

    @test()
    protected static async offersEachVoiceTheBrowserHas() {
        FakeSpeaker.availableVoices = ['Alex', 'Tara']

        this.render()

        assert.isEqualDeep(
            { voices: this.voiceOptions, chosen: this.chosenVoice },
            { voices: ['Alex', 'Tara'], chosen: 'Tara' },
            'Did not offer each voice the browser has!'
        )
    }

    @test()
    protected static async offersChosenVoiceEvenWhenBrowserLacksIt() {
        FakeSpeaker.availableVoices = ['Alex']

        this.render([], 'Rishi')

        assert.isEqualDeep(
            { voices: this.voiceOptions, chosen: this.chosenVoice },
            { voices: ['Alex', 'Rishi'], chosen: 'Rishi' },
            'Did not offer the chosen voice when the browser lacked it!'
        )
    }

    @test()
    protected static async hidesNoveltyAndEloquenceVoices() {
        FakeSpeaker.availableVoices = [
            'Bad News',
            'Eddy (English (US))',
            'Grandma (English (UK))',
            'Samantha',
            'Tara',
            'Zarvox',
        ]

        this.render()

        assert.isEqualDeep(
            this.voiceOptions,
            ['Samantha', 'Tara'],
            'Did not hide the novelty and Eloquence voices!'
        )
    }

    @test()
    protected static async offersOnlyDownloadedVoices() {
        FakeSpeaker.availableVoices = ['Samantha', 'Tara']
        FakeSpeaker.onlineVoices = ['Google US English']

        this.render()

        assert.isEqualDeep(
            this.voiceOptions,
            ['Samantha', 'Tara'],
            'Did not offer only the downloaded voices!'
        )
    }

    @test()
    protected static async keepsOfferingHiddenVoiceOnceChosen() {
        FakeSpeaker.availableVoices = ['Tara', 'Zarvox']

        this.render([], 'Zarvox')

        assert.isEqualDeep(
            this.voiceOptions,
            ['Tara', 'Zarvox'],
            'Did not keep offering the hidden voice once chosen!'
        )
    }

    @test()
    protected static async offersVoicesOnceBrowserLoadsThem() {
        this.render()

        act(() => FakeSpeaker.loadVoices(['Alex', 'Tara']))

        assert.isEqualDeep(
            this.voiceOptions,
            ['Alex', 'Tara'],
            'Did not offer the voices once the browser loaded them!'
        )
    }

    @test()
    protected static async playsCuesInChosenVoice() {
        FakeSpeaker.availableVoices = ['Alex', 'Tara']
        this.render([
            this.phase('pre-baseline', [
                {
                    event: {
                        name: 'close-eyes',
                        action: { kind: 'cue', text: 'Close your eyes' },
                        start: { delay: { ms: 0 }, from: 'parentStart' },
                        end: { kind: 'actionFinishes' },
                    },
                },
            ]),
        ])

        this.type('Cue voice', 'Alex')
        this.click('Play phase event 1 cue')

        assert.isEqualDeep(
            {
                changedVoice: this.changedVoice,
                spoken: FakeSpeaker.spokenVoices,
            },
            { changedVoice: 'Alex', spoken: ['Alex'] },
            'Did not play the cues in the chosen voice!'
        )
    }

    private static get voiceOptions() {
        const select = screen.getByLabelText('Cue voice') as HTMLSelectElement
        return [...select.options].map((option) => option.value)
    }

    private static get chosenVoice() {
        return (screen.getByLabelText('Cue voice') as HTMLSelectElement).value
    }

    @test()
    protected static async addsPhaseThatLastsUntilItsContentsFinish() {
        this.render()

        this.click('Add phase')

        assert.isEqualDeep(
            this.changed,
            [this.phase('')],
            'Did not add a phase that lasts until its contents finish!'
        )
    }

    @test()
    protected static async namesPhaseAndSetsItsLength() {
        this.render([this.phase('')])

        this.type('Phase 1 name', 'Pre Baseline')
        this.type('Phase 1 lasts (seconds)', '300')

        assert.isEqualDeep(
            {
                name: this.changed[0].name,
                durationMs: this.changed[0].durationMs,
            },
            { name: 'pre-baseline', durationMs: 300000 },
            'Did not name the phase and set its length!'
        )
    }

    @test()
    protected static async givesPhaseItsOwnEvents() {
        this.render([this.phase('pre-baseline')])

        this.click('Add phase event')

        assert.isLength(
            this.eventsOf(this.changed[0]),
            1,
            'Did not give the phase its own events!'
        )
    }

    @test()
    protected static async addsBlockThatShufflesItsTrials() {
        this.render([this.phase('interventions')])

        this.click('Add block to phase 1')

        assert.isEqualDeep(
            this.blocksOf(this.changed[0]),
            [this.block('')],
            'Did not add a block that shuffles its trials!'
        )
    }

    @test()
    protected static async interleavesEventsAndBlocks() {
        this.render([
            this.phase('interventions', [
                { event: this.event('intro') },
                { block: this.block('tilt') },
            ]),
        ])

        this.click('Add phase event')
        this.click('Add block to phase 1')

        assert.isEqualDeep(
            this.changed[0].items.map((item) =>
                'event' in item ? `event ${item.event.name}` : 'block'
            ),
            ['event intro', 'block', 'event ', 'block'],
            'Did not interleave events and blocks!'
        )
    }

    @test()
    protected static async startsEventAddedAfterBlockWhenBlockEnds() {
        this.render([
            this.phase('interventions', [{ block: this.block('tilt') }]),
        ])

        this.click('Add phase event')

        assert.isEqualDeep(
            this.eventsOf(this.changed[0])[0].start.from,
            { event: 'tilt', edge: 'end' },
            'Did not start the event added after a block when the block ended!'
        )
    }

    @test()
    protected static async offersBlocksToStartAfter() {
        this.render([
            this.phase('interventions', [
                { block: this.block('tilt') },
                { event: this.event('outro') },
            ]),
        ])

        const select = screen.getByLabelText(
            'Phase event 1 starts after'
        ) as HTMLSelectElement

        assert.isEqualDeep(
            [...select.options].map((option) => option.textContent),
            ['phase start', 'tilt starts', 'tilt ends'],
            'Did not offer the blocks to start after!'
        )
    }

    @test()
    protected static async definesConditionsInTable() {
        this.render([this.phaseWithBlock()])

        this.click('Add column to block 1 conditions')
        this.type('Block 1 column 1 name', 'Delta')
        this.click('Add row to block 1 conditions')
        this.click('Add row to block 1 conditions')
        this.type('Block 1 row 1 delta', '10')
        this.type('Block 1 row 2 delta', '20')

        assert.isEqualDeep(
            this.changedBlock.conditions,
            { columns: ['delta'], rows: [['10'], ['20']] },
            'Did not define the conditions in the table!'
        )
    }

    @test()
    protected static async kebabCasesConditionValues() {
        this.render([this.phaseWithBlock()])

        this.click('Add column to block 1 conditions')
        this.type('Block 1 column 1 name', 'side')
        this.click('Add row to block 1 conditions')
        this.type('Block 1 row 1 side', 'Head  Left')

        assert.isEqualDeep(
            this.changedBlock.conditions.rows,
            [['head-left']],
            'Did not kebab-case the condition values!'
        )
    }

    @test()
    protected static async namesColumnsVariablesAndRowsConditions() {
        this.render([this.phaseWithBlock()])

        this.click('Add column to block 1 conditions')

        assert.isEqualDeep(
            ['Add column to', 'Add row to'].map(
                (action) =>
                    screen.getByRole('button', {
                        name: `${action} block 1 conditions`,
                    }).textContent
            ),
            ['+ Column / Variable', '+ Row / Condition'],
            'Did not name the columns variables and the rows conditions!'
        )
    }

    @test()
    protected static async letsTrialEventsUseConditionColumns() {
        this.render([
            this.phaseWithBlock({
                trial: [this.event('release-cue')],
                conditions: { columns: ['delta'], rows: [['10']] },
            }),
        ])

        this.type('Trial event 1 delay column', 'delta')

        assert.isEqualDeep(
            this.changedBlock.trial[0].start.delay,
            { column: 'delta' },
            'Did not let trial events use the condition columns!'
        )
    }

    @test()
    protected static async countsTrialsFromConditionsAndRepetitions() {
        this.render([
            this.phaseWithBlock({
                conditions: {
                    columns: ['delta'],
                    rows: [['10'], ['20'], ['30']],
                },
            }),
        ])

        this.type('Block 1 repetitions', '4')

        assert.isEqualDeep(
            {
                repetitions: this.changedBlock.repetitions,
                count: screen.queryByText('12 trials') !== null,
            },
            { repetitions: 4, count: true },
            'Did not count trials from conditions and repetitions!'
        )
    }

    @test()
    protected static async setsTrialOrderAndGapBetweenTrials() {
        this.render([this.phaseWithBlock()])

        this.type('Block 1 trial order', 'fixed')
        this.type('Block 1 gap at least (seconds)', '10')
        this.type('Block 1 gap on average (seconds)', '15')
        this.type('Block 1 gap at most (seconds)', '60')

        assert.isEqualDeep(
            {
                trialOrder: this.changedBlock.trialOrder,
                gap: this.changedBlock.gap,
            },
            {
                trialOrder: 'fixed',
                gap: { minMs: 10000, meanMs: 15000, maxMs: 60000 },
            },
            'Did not set the trial order and gap between trials!'
        )
    }

    @test()
    protected static async ordersBlockSectionsByWhenTheyHappen() {
        this.render([this.phaseWithBlock()])

        assert.isEqualDeep(
            [
                ...document.querySelectorAll(
                    '.phases__block .phases__subheading'
                ),
            ].map((heading) => heading.textContent),
            ['Before trials', 'Each trial', 'After trials', 'Conditions'],
            'Did not order the block sections by when they happen!'
        )
    }

    @test()
    protected static async givesBlockEventsAfterItsTrials() {
        this.render([this.phaseWithBlock()])

        this.click('Add after-trials event')

        assert.isLength(
            this.changedBlock.teardown,
            1,
            'Did not give the block events after its trials!'
        )
    }

    @test()
    protected static async givesBlockEventsBeforeItsTrials() {
        this.render([this.phaseWithBlock()])

        this.click('Add block event')

        assert.isLength(
            this.changedBlock.setup,
            1,
            'Did not give the block events before its trials!'
        )
    }

    @test()
    protected static async ordersBlocksOnceThereAreTwo() {
        this.render([
            this.phase('interventions', [{ block: this.block('neutral') }]),
        ])
        const offeredWithOne = this.has('Phase 1 block order')

        this.click('Add block to phase 1')
        this.type('Phase 1 block order', 'counterbalanced')

        assert.isEqualDeep(
            { offeredWithOne, order: this.changed[0].blockOrder },
            { offeredWithOne: false, order: 'counterbalanced' },
            'Did not order the blocks once there were two!'
        )
    }

    @test()
    protected static async offersOnlyNumericColumnsForTimes() {
        this.render([
            this.phaseWithBlock({
                trial: [this.event('upright-cue')],
                conditions: {
                    columns: ['tilt-side', 'release-s'],
                    rows: [
                        ['left', '10'],
                        ['right', '20'],
                    ],
                },
            }),
        ])

        const select = screen.getByLabelText(
            'Trial event 1 delay column'
        ) as HTMLSelectElement

        assert.isEqualDeep(
            [...select.options].map((option) => option.textContent),
            ['s', '{release-s}'],
            'Did not offer only the numeric columns for times!'
        )
    }

    @test()
    protected static async countsOnlyFilledRowsAsTrials() {
        this.render([
            this.phaseWithBlock({
                conditions: {
                    columns: ['delta'],
                    rows: [['10'], ['20'], ['']],
                },
            }),
        ])

        assert.isTrue(
            screen.queryByText('2 trials') !== null,
            'Did not count only the filled rows as trials!'
        )
    }

    @test()
    protected static async addsFiveMinuteBaselinesAroundOtherPhases() {
        this.render([this.phase('interventions')])

        this.click('+ 5m Post-baseline')
        this.click('+ 5m Pre-baseline')

        assert.isEqualDeep(
            this.changed.map(({ name }) => name),
            ['pre-baseline', 'interventions', 'post-baseline'],
            'Did not add the five minute baselines around the other phases!'
        )
    }

    @test()
    protected static async restsFiveSilentMinutesBetweenBaselineCues() {
        this.render([this.phase('interventions')])

        this.click('+ 5m Pre-baseline')

        assert.isEqualDeep(
            {
                durationMs: this.changed[0].durationMs,
                events: this.eventsOf(this.changed[0]),
            },
            {
                durationMs: 0,
                events: [
                    {
                        ...this.event('pre-baseline-before'),
                        action: {
                            kind: 'cue',
                            text: 'Please close your eyes for the next 5 minutes',
                        },
                        end: { kind: 'actionFinishes' },
                    },
                    {
                        ...this.event('pre-baseline-rest'),
                        start: {
                            delay: { ms: 0 },
                            from: { event: 'pre-baseline-before', edge: 'end' },
                        },
                        end: { kind: 'duration', length: { ms: 300000 } },
                    },
                    {
                        ...this.event('pre-baseline-after'),
                        action: {
                            kind: 'cue',
                            text: 'Please open your eyes now',
                        },
                        start: {
                            delay: { ms: 0 },
                            from: { event: 'pre-baseline-rest', edge: 'end' },
                        },
                        end: { kind: 'actionFinishes' },
                    },
                ],
            },
            'Did not rest five silent minutes between the baseline cues!'
        )
    }

    @test()
    protected static async namesEachBaselinesEventsUniquely() {
        this.render([this.phase('interventions')])

        this.click('+ 5m Pre-baseline')
        this.click('+ 5m Post-baseline')

        assert.isEqualDeep(
            this.changed.flatMap((phase) =>
                this.eventsOf(phase).map(({ name }) => name)
            ),
            [
                'pre-baseline-before',
                'pre-baseline-rest',
                'pre-baseline-after',
                'post-baseline-before',
                'post-baseline-rest',
                'post-baseline-after',
            ],
            "Did not name each baseline's events uniquely!"
        )
    }

    @test()
    protected static async addsPhasesBetweenTheBaselines() {
        this.render([])
        this.click('+ 5m Pre-baseline')
        this.click('+ 5m Post-baseline')

        this.click('Add phase')
        this.type('Phase 2 name', 'interventions')
        this.click('Add phase')

        assert.isEqualDeep(
            this.changed.map(({ name }) => name),
            ['pre-baseline', 'interventions', '', 'post-baseline'],
            'Did not add the phases between the baselines!'
        )
    }

    @test()
    protected static async removesBaselineWhenPressedAgain() {
        this.render([this.phase('interventions')])
        this.click('+ 5m Pre-baseline')
        const pressedOnceAdded = this.isPressed('+ 5m Pre-baseline')

        this.click('+ 5m Pre-baseline')

        assert.isEqualDeep(
            {
                pressedOnceAdded,
                pressedOnceRemoved: this.isPressed('+ 5m Pre-baseline'),
                names: this.changed.map(({ name }) => name),
            },
            {
                pressedOnceAdded: true,
                pressedOnceRemoved: false,
                names: ['interventions'],
            },
            'Did not remove the baseline when pressed again!'
        )
    }

    @test()
    protected static async locksEverythingWhileLocked() {
        render(
            <ProtocolPhases
                phases={[this.phaseWithBlock()]}
                voice="Tara"
                isLocked
                onChange={() => {}}
                onVoiceChange={() => {}}
            />
        )

        assert.isTrue(
            screen
                .getAllByRole('button')
                .filter((button) => !button.closest('.schedule'))
                .every((button) => button.matches(':disabled')),
            'Did not lock everything while locked!'
        )
    }

    @test()
    protected static async showsScheduleAbovePhases() {
        this.render([this.phase('pre-baseline')])

        const schedule = screen.getByRole('region', { name: 'Schedule' })
        const phases = screen.getByRole('region', { name: 'Phases' })

        assert.isTrue(
            (schedule.compareDocumentPosition(phases) &
                Node.DOCUMENT_POSITION_FOLLOWING) !==
                0 && !phases.contains(schedule),
            'Did not show the schedule above the phases!'
        )
    }

    @test()
    protected static async labelsAndNumbersPhaseAndBlockCards() {
        this.render([this.phaseWithBlock()])

        assert.isEqualDeep(
            [...document.querySelectorAll('.phases__kind')].map(
                (row) => row.textContent
            ),
            ['phase #1', 'block #1'],
            'Did not label and number the phase and block cards!'
        )
    }

    @test()
    protected static async removesPhase() {
        this.render([this.phase('pre-baseline'), this.phase('post-baseline')])

        this.click('Remove phase 1')

        assert.isEqualDeep(
            this.changed.map(({ name }) => name),
            ['post-baseline'],
            'Did not remove the phase!'
        )
    }

    @test()
    protected static async readsPhasesFromSavedContents() {
        const saved = [
            this.phase('interventions', [
                { event: this.event('intro') },
                {
                    block: this.block('reversible-tilt', {
                        trial: [this.event('stroke')],
                        conditions: { columns: ['delta'], rows: [['10']] },
                    }),
                },
            ]),
        ]

        assert.isEqualDeep(
            phasesFrom(JSON.parse(JSON.stringify(saved))),
            saved,
            'Did not read the phases from the saved contents!'
        )
    }

    @test()
    protected static async readsOlderPhasesWithSeparateEventsAndBlocks() {
        assert.isEqualDeep(
            phasesFrom([
                { name: 'baseline', events: [this.event('cue')] },
                { name: 'interventions', blocks: [this.block('tilt')] },
            ]),
            [
                this.phase('baseline', [{ event: this.event('cue') }]),
                this.phase('interventions', [{ block: this.block('tilt') }]),
            ],
            'Did not read older phases with separate events and blocks!'
        )
    }

    @test()
    protected static async skipsWhatIsNotAPhase() {
        assert.isEqualDeep(
            phasesFrom([null, 'baseline', { name: 'baseline' }]),
            [this.phase('baseline')],
            'Did not skip what is not a phase!'
        )
    }

    private static render(phases: Phase[] = [], voice = 'Tara') {
        const Harness = () => {
            const [current, setCurrent] = useState(phases)
            const [currentVoice, setCurrentVoice] = useState(voice)

            return (
                <ProtocolPhases
                    phases={current}
                    voice={currentVoice}
                    onChange={(next) => {
                        setCurrent(next)
                        this.changed = next
                    }}
                    onVoiceChange={(next) => {
                        setCurrentVoice(next)
                        this.changedVoice = next
                    }}
                />
            )
        }

        render(<Harness />)
    }

    private static phase(name: string, items: PhaseItem[] = []): Phase {
        return { name, durationMs: 0, items, blockOrder: 'fixed' }
    }

    private static eventsOf({ items }: Phase) {
        return items.flatMap((item) => ('event' in item ? [item.event] : []))
    }

    private static blocksOf({ items }: Phase) {
        return items.flatMap((item) => ('block' in item ? [item.block] : []))
    }

    private static block(name: string, change: Partial<Block> = {}): Block {
        return {
            name,
            setup: [],
            trial: [],
            teardown: [],
            conditions: { columns: [], rows: [] },
            repetitions: 1,
            trialOrder: 'shuffled',
            gap: { minMs: 0, meanMs: 0, maxMs: 0 },
            ...change,
        }
    }

    private static phaseWithBlock(change: Partial<Block> = {}): Phase {
        return this.phase('interventions', [
            { block: this.block('reversible-tilt', change) },
        ])
    }

    private static event(name: string) {
        return {
            name,
            action: { kind: 'marker' as const },
            start: { delay: { ms: 0 }, from: 'parentStart' as const },
            end: { kind: 'instant' as const },
        }
    }

    private static get changedBlock() {
        return this.blocksOf(this.changed[0])[0]
    }

    private static click(name: string) {
        fireEvent.click(screen.getAllByRole('button', { name })[0])
    }

    private static isPressed(name: string) {
        return (
            screen
                .getByRole('button', { name })
                .getAttribute('aria-pressed') === 'true'
        )
    }

    private static has(name: string, index = 0) {
        return screen.queryAllByRole('button', { name }).length > index
    }

    private static type(label: string, value: string) {
        fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
}
