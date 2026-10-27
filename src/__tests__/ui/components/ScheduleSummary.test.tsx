import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { PlannedEvent } from '../../../ui/components/PlannedEvents'
import { Block, Phase } from '../../../ui/components/ProtocolPhases'
import ScheduleSummary from '../../../ui/components/ScheduleSummary'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class ScheduleSummaryTest extends AbstractPackageTest {
    @test()
    protected static async timesPhasesOneAfterAnother() {
        this.render([
            this.phase('pre-baseline', { durationMs: 300000 }),
            this.phase('post-baseline', { durationMs: 300000 }),
        ])

        assert.isEqualDeep(
            this.rows,
            [
                ['0:00 – 5:00', 'pre-baseline', ''],
                ['5:00 – 10:00', 'post-baseline', ''],
                ['10:00', 'end', ''],
            ],
            'Did not time the phases one after another!'
        )
    }

    @test()
    protected static async collapsesPhasesByDefault() {
        this.render([
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        assert.isEqualDeep(
            {
                rows: this.rows,
                expanded:
                    this.toggleOf('interventions').getAttribute(
                        'aria-expanded'
                    ),
            },
            {
                rows: [
                    ['0:00 – ≥1:47', 'interventions', ''],
                    ['≥1:47', 'end', ''],
                ],
                expanded: 'false',
            },
            'Did not collapse the phases by default!'
        )
    }

    @test()
    protected static async timesPhaseEventsFromPhaseStartOnceOpened() {
        this.render([
            this.phase('pre-baseline', { durationMs: 300000 }),
            this.phase('eyes-closed', {
                events: [
                    this.event('close-eyes', {
                        action: { kind: 'cue', text: 'Close your eyes' },
                        end: { kind: 'duration', length: { ms: 10000 } },
                    }),
                    this.event('settled', {
                        start: {
                            delay: { ms: 5000 },
                            from: { event: 'close-eyes', edge: 'end' },
                        },
                    }),
                ],
            }),
        ])

        this.open('eyes-closed')

        assert.isEqualDeep(
            this.rows,
            [
                ['0:00 – 5:00', 'pre-baseline', ''],
                ['5:00 – 5:15', 'eyes-closed', ''],
                [
                    '+0:00 – 0:10',
                    'close-eyes',
                    'cue "Close your eyes" for 10 s',
                ],
                ['0:15', 'settled', 'marker'],
                ['5:15', 'end', ''],
            ],
            'Did not time the phase events from the phase start once opened!'
        )
    }

    @test()
    protected static async givesEarliestTimesWhenTrialsVary() {
        this.render([
            this.phase('interventions', {
                blocks: [this.reversibleTilt],
            }),
        ])

        this.open('interventions')
        this.open('reversible-tilt')

        assert.isEqualDeep(
            this.rows,
            [
                ['0:00 – ≥1:47', 'interventions', ''],
                ['+0:00 – ≥1:47', 'reversible-tilt', '2 trials, shuffled'],
                ['before trials:', 'before trials', ''],
                ['0:00 – ≥0:01', 'position-check', 'cue "Head upright"'],
                ['each trial:', 'each trial', 'gaps 10–60 s, 20 s on average'],
                [
                    '0:00 – 0:03',
                    'tilt-cue',
                    'cue "Tilt head {tilt-side}" for 3 s',
                ],
                ['0:03 – ≥0:03', 'stroke', 'arm: stroke {stroke-side}-forearm'],
                ['≥0:13 – ≥0:14', 'upright-cue', 'cue "Return head upright"'],
                ['≥0:13 – ≥0:43', 'response-window', 'interval for 30 s'],
                ['≥1:47', 'end', ''],
            ],
            'Did not give the earliest times when trials varied!'
        )
    }

    @test()
    protected static async collapsesBlocksByDefault() {
        this.render([
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        this.open('interventions')

        assert.isEqualDeep(
            {
                rows: this.rows.map(([, what]) => what),
                expanded:
                    this.toggleOf('reversible-tilt').getAttribute(
                        'aria-expanded'
                    ),
            },
            {
                rows: ['interventions', 'reversible-tilt', 'end'],
                expanded: 'false',
            },
            'Did not collapse the blocks by default!'
        )
    }

    @test()
    protected static async expandsAllThenCollapsesAll() {
        this.render([
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        const labelBefore = this.expandAllButton.textContent
        fireEvent.click(this.expandAllButton)
        const expandedRows = this.rows.length
        const labelExpanded = this.expandAllButton.textContent
        fireEvent.click(this.expandAllButton)

        assert.isEqualDeep(
            {
                labelBefore,
                expandedRows,
                labelExpanded,
                collapsed: this.rows.map(([, what]) => what),
            },
            {
                labelBefore: 'Expand all',
                expandedRows: 10,
                labelExpanded: 'Collapse all',
                collapsed: ['interventions', 'end'],
            },
            'Did not expand all and then collapse all!'
        )
    }

    @test()
    protected static async expandsOneLevelAtATime() {
        this.render([
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        const before = this.levelButtonsState
        fireEvent.click(this.expandLevelButton)
        const afterOne = this.levelButtonsState
        fireEvent.click(this.expandLevelButton)

        assert.isEqualDeep(
            { before, afterOne, afterTwo: this.levelButtonsState },
            {
                before: {
                    rows: ['interventions', 'end'],
                    canExpand: true,
                    canCollapse: false,
                },
                afterOne: {
                    rows: ['interventions', 'reversible-tilt', 'end'],
                    canExpand: true,
                    canCollapse: true,
                },
                afterTwo: {
                    rows: [
                        'interventions',
                        'reversible-tilt',
                        'before trials',
                        'position-check',
                        'each trial',
                        'tilt-cue',
                        'stroke',
                        'upright-cue',
                        'response-window',
                        'end',
                    ],
                    canExpand: false,
                    canCollapse: true,
                },
            },
            'Did not expand one level at a time!'
        )
    }

    @test()
    protected static async collapsesOneLevelAtATime() {
        this.render([
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        fireEvent.click(this.expandAllButton)
        fireEvent.click(this.collapseLevelButton)
        const afterOne = this.levelButtonsState
        fireEvent.click(this.collapseLevelButton)

        assert.isEqualDeep(
            { afterOne, afterTwo: this.levelButtonsState },
            {
                afterOne: {
                    rows: ['interventions', 'reversible-tilt', 'end'],
                    canExpand: true,
                    canCollapse: true,
                },
                afterTwo: {
                    rows: ['interventions', 'end'],
                    canExpand: true,
                    canCollapse: false,
                },
            },
            'Did not collapse one level at a time!'
        )
    }

    @test()
    protected static async expandsTheShallowestLevelNotYetOpen() {
        this.render([
            this.phase('pre-baseline', {
                events: [this.event('rest')],
            }),
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        this.open('interventions')
        this.open('reversible-tilt')
        fireEvent.click(this.collapseLevelButton)
        fireEvent.click(this.expandLevelButton)

        assert.isEqualDeep(
            this.rows.map(([, what]) => what),
            ['pre-baseline', 'rest', 'interventions', 'reversible-tilt', 'end'],
            'Did not expand the shallowest level not yet open!'
        )
    }

    private static get levelButtonsState() {
        return {
            rows: this.rows.map(([, what]) => what),
            canExpand: !(this.expandLevelButton as HTMLButtonElement).disabled,
            canCollapse: !(this.collapseLevelButton as HTMLButtonElement)
                .disabled,
        }
    }

    private static get expandLevelButton() {
        return within(this.summary).getByRole('button', {
            name: 'Expand one level',
        })
    }

    private static get collapseLevelButton() {
        return within(this.summary).getByRole('button', {
            name: 'Collapse one level',
        })
    }

    private static get expandAllButton() {
        return within(this.summary).getByRole('button', {
            name: /^(Expand|Collapse) all$/,
        })
    }

    @test()
    protected static async tagsPhases() {
        this.render([
            this.phase('pre-baseline', { durationMs: 300000 }),
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        fireEvent.click(this.tagsButton)

        assert.isEqualDeep(
            [...this.summary.querySelectorAll('.schedule__phase')].map(
                (phase) => phase.querySelector('.kind-tag')?.textContent
            ),
            ['phase #1', 'phase #2'],
            'Did not tag the phases!'
        )
    }

    @test()
    protected static async hidesTagsUntilAskedToShowThem() {
        this.render([this.phase('pre-baseline', { durationMs: 300000 })])

        const before = {
            tags: this.summary.querySelectorAll('.kind-tag').length,
            button: this.tagsButton.textContent,
        }
        fireEvent.click(this.tagsButton)

        assert.isEqualDeep(
            {
                before,
                after: {
                    tags: this.summary.querySelectorAll('.kind-tag').length,
                    button: this.tagsButton.textContent,
                },
            },
            {
                before: { tags: 0, button: 'Show tags' },
                after: { tags: 1, button: 'Hide tags' },
            },
            'Did not hide the tags until asked to show them!'
        )
    }

    @test()
    protected static async widensTheIndentsForTags() {
        this.render([this.phase('pre-baseline', { durationMs: 300000 })])

        const before = this.summary.classList.contains('schedule--tagless')
        fireEvent.click(this.tagsButton)

        assert.isEqualDeep(
            {
                before,
                after: this.summary.classList.contains('schedule--tagless'),
            },
            { before: true, after: false },
            'Did not widen the indents for tags!'
        )
    }

    private static get tagsButton() {
        return within(this.summary).getByRole('button', {
            name: /^(Show|Hide) tags$/,
        })
    }

    @test()
    protected static async tagsBlocksAndGroupsWhatTheyContain() {
        this.render([
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        fireEvent.click(this.tagsButton)
        this.open('interventions')
        this.open('reversible-tilt')
        const block = this.summary.querySelector('.schedule__block')!

        assert.isEqualDeep(
            {
                tag: block.querySelector('.kind-tag')?.textContent,
                contains: [...block.querySelectorAll('.schedule__name')].map(
                    (name) => name.textContent
                ),
            },
            {
                tag: 'block #1',
                contains: [
                    'reversible-tilt',
                    'before trials',
                    'position-check',
                    'each trial',
                    'tilt-cue',
                    'stroke',
                    'upright-cue',
                    'response-window',
                ],
            },
            'Did not tag the block and group what it contains!'
        )
    }

    @test()
    protected static async timesAfterTrialsFromTrialsEnd() {
        this.render([
            this.phase('task', {
                blocks: [
                    this.block('tones', {
                        trial: [
                            this.event('tone', {
                                end: {
                                    kind: 'duration',
                                    length: { ms: 10000 },
                                },
                            }),
                        ],
                        repetitions: 2,
                        teardown: [
                            this.event('relax', {
                                action: { kind: 'cue', text: 'Relax' },
                                end: { kind: 'duration', length: { ms: 5000 } },
                            }),
                        ],
                    }),
                ],
            }),
        ])

        this.open('task')
        this.open('tones')

        assert.isEqualDeep(
            this.rows,
            [
                ['0:00 – 0:25', 'task', ''],
                ['+0:00 – 0:25', 'tones', '2 trials, shuffled'],
                ['each trial:', 'each trial', 'no gaps'],
                ['0:00 – 0:10', 'tone', 'interval for 10 s'],
                ['after trials:', 'after trials', ''],
                ['0:00 – 0:05', 'relax', 'cue "Relax" for 5 s'],
                ['0:25', 'end', ''],
            ],
            'Did not time the after-trials events from the end of the trials!'
        )
    }

    @test()
    protected static async timesEventsAroundBlocks() {
        this.render([
            this.phase('task', {
                items: [
                    {
                        event: this.event('intro', {
                            end: { kind: 'duration', length: { ms: 10000 } },
                        }),
                    },
                    {
                        block: this.block('tones', {
                            trial: [
                                this.event('tone', {
                                    end: {
                                        kind: 'duration',
                                        length: { ms: 10000 },
                                    },
                                }),
                            ],
                        }),
                    },
                    {
                        event: this.event('outro', {
                            start: {
                                delay: { ms: 0 },
                                from: { event: 'tones', edge: 'end' },
                            },
                            end: { kind: 'duration', length: { ms: 5000 } },
                        }),
                    },
                ],
            }),
        ])

        this.open('task')
        this.open('tones')

        assert.isEqualDeep(
            this.rows,
            [
                ['0:00 – 0:25', 'task', ''],
                ['+0:00 – 0:10', 'intro', 'interval for 10 s'],
                ['0:10 – 0:20', 'tones', '1 trial, shuffled'],
                ['each trial:', 'each trial', 'no gaps'],
                ['0:00 – 0:10', 'tone', 'interval for 10 s'],
                ['0:20 – 0:25', 'outro', 'interval for 5 s'],
                ['0:25', 'end', ''],
            ],
            'Did not time the events around the blocks!'
        )
    }

    @test()
    protected static async leavesOutOpenEndedEndings() {
        this.render([
            this.phase('baseline', {
                events: [
                    this.event('close-eyes', {
                        action: { kind: 'cue', text: 'Close your eyes' },
                        end: { kind: 'actionFinishes' },
                    }),
                    this.event('stroke', {
                        action: { kind: 'arm', command: 'stroke left-forearm' },
                        end: { kind: 'actionFinishes' },
                    }),
                ],
            }),
        ])

        this.open('baseline')

        assert.isEqualDeep(
            this.rows.slice(1, 3).map(([, , detail]) => detail),
            ['cue "Close your eyes"', 'arm: stroke left-forearm'],
            'Did not leave out the open-ended endings!'
        )
    }

    @test()
    protected static async namesTheAudioToPlay() {
        this.render([
            this.phase('baseline', {
                events: [
                    this.event('tone', {
                        action: { kind: 'audio', file: 'tone.wav' },
                        end: { kind: 'actionFinishes' },
                    }),
                    this.event('noise', {
                        action: { kind: 'audio', file: 'pink-noise.mp3' },
                        end: { kind: 'duration', length: { ms: 5000 } },
                    }),
                ],
            }),
        ])

        this.open('baseline')

        assert.isEqualDeep(
            this.rows.slice(1, 3).map(([time, , detail]) => [time, detail]),
            [
                ['+0:00 – ≥0:00', 'play tone.wav'],
                ['0:00 – 0:05', 'play pink-noise.mp3 for 5 s'],
            ],
            'Did not name the audio to play!'
        )
    }

    @test()
    protected static async givesLongLengthsInMinutesAndSeconds() {
        this.render([
            this.phase('baseline', {
                events: [
                    this.event('rest', {
                        end: { kind: 'duration', length: { ms: 300000 } },
                    }),
                    this.event('settle', {
                        end: { kind: 'duration', length: { ms: 250000 } },
                    }),
                ],
            }),
        ])

        this.open('baseline')

        assert.isEqualDeep(
            this.rows.slice(1, 3).map(([, , detail]) => detail),
            ['interval for 5m', 'interval for 4m10s'],
            'Did not give long lengths in minutes and seconds!'
        )
    }

    @test()
    protected static async estimatesHowLongCuesTakeToSay() {
        this.render([
            this.phase('baseline', {
                events: [
                    this.event('start', {
                        action: {
                            kind: 'cue',
                            text: 'Please close your eyes for a 5-minute pre-baseline',
                        },
                        end: { kind: 'actionFinishes' },
                    }),
                    this.event('rest', {
                        start: {
                            delay: { ms: 0 },
                            from: { event: 'start', edge: 'end' },
                        },
                        end: { kind: 'duration', length: { ms: 300000 } },
                    }),
                    this.event('end-cue', {
                        action: {
                            kind: 'cue',
                            text: 'You can open your eyes now',
                        },
                        start: {
                            delay: { ms: 0 },
                            from: { event: 'rest', edge: 'end' },
                        },
                        end: { kind: 'actionFinishes' },
                    }),
                ],
            }),
        ])

        this.open('baseline')

        assert.isEqualDeep(
            this.rows,
            [
                ['0:00 – ~5:05', 'baseline', ''],
                [
                    '+0:00 – ~0:03',
                    'start',
                    'cue "Please close your eyes for a 5-minute pre-baseline"',
                ],
                ['~0:03 – ~5:03', 'rest', 'interval for 5m'],
                [
                    '~5:03 – ~5:05',
                    'end-cue',
                    'cue "You can open your eyes now"',
                ],
                ['~5:05', 'end', ''],
            ],
            'Did not estimate how long the cues take to say!'
        )
    }

    @test()
    protected static async numbersEventsWithinEachList() {
        this.render([
            this.phase('task', {
                items: [
                    { event: this.event('intro') },
                    {
                        block: this.block('tones', {
                            trial: [this.event('tone'), this.event('rest')],
                        }),
                    },
                    { event: this.event('outro') },
                ],
            }),
        ])

        fireEvent.click(this.tagsButton)
        fireEvent.click(this.expandAllButton)

        assert.isEqualDeep(
            [...this.summary.querySelectorAll('.schedule__row--event')].map(
                (row) => row.querySelector('.kind-tag')?.textContent
            ),
            ['event #1', 'event #1', 'event #2', 'event #2'],
            'Did not number the events within each list!'
        )
    }

    @test()
    protected static async showsFullCueTextOnHover() {
        const text = 'Please close your eyes for a 5-minute pre-baseline'
        this.render([
            this.phase('baseline', {
                events: [
                    this.event('start', {
                        action: { kind: 'cue', text },
                        end: { kind: 'actionFinishes' },
                    }),
                ],
            }),
        ])

        this.open('baseline')
        const cueText = this.summary.querySelector('.schedule__cue-text')

        assert.isEqualDeep(
            {
                shown: cueText?.textContent,
                title: cueText?.getAttribute('title'),
                detail: this.rows[1][2],
            },
            { shown: text, title: text, detail: `cue "${text}"` },
            'Did not show the full cue text on hover!'
        )
    }

    @test()
    protected static async estimatesCuesThatEndAtOnceOrOnConfirmation() {
        this.render([
            this.phase('task', {
                events: [
                    this.event('instruction', {
                        action: { kind: 'cue', text: 'Close your eyes' },
                    }),
                    this.event('ready-check', {
                        action: { kind: 'cue', text: 'Close your eyes' },
                        end: { kind: 'experimenter' },
                    }),
                ],
            }),
        ])

        this.open('task')

        assert.isEqualDeep(
            this.rows.slice(1, 3).map(([time, , detail]) => [time, detail]),
            [
                ['+0:00 – ~0:01', 'cue "Close your eyes"'],
                ['0:00 – ≥0:01', 'cue "Close your eyes"'],
            ],
            'Did not estimate cues that end at once or on confirmation!'
        )
    }

    @test()
    protected static async hidesMarkersUntilAskedToShowThem() {
        this.render([this.phase('pre-baseline', { durationMs: 300000 })])

        assert.isEqualDeep(
            {
                markers: this.shownMarkers,
                button: this.markersButton.textContent,
            },
            { markers: [], button: 'Show markers' },
            'Did not hide the markers until asked to show them!'
        )
    }

    @test()
    protected static async showsSessionPhaseAndEventMarkers() {
        this.render([
            this.phase('pre-baseline', {
                events: [
                    this.event('start', {
                        action: { kind: 'cue', text: 'Close your eyes' },
                        end: { kind: 'actionFinishes' },
                    }),
                    this.event('rest', {
                        end: { kind: 'duration', length: { ms: 300000 } },
                    }),
                    this.event('note'),
                ],
            }),
        ])

        fireEvent.click(this.markersButton)
        fireEvent.click(this.expandAllButton)

        assert.isEqualDeep(
            {
                markers: this.shownMarkers,
                button: this.markersButton.textContent,
            },
            {
                markers: [
                    'session-begin',
                    'p1-pre-baseline-begin → p1-pre-baseline-end',
                    'p1-start-begin → p1-start-end',
                    'p1-rest-begin → p1-rest-end',
                    'p1-note',
                    'session-end',
                ],
                button: 'Hide markers',
            },
            'Did not show the session, phase and event markers!'
        )
    }

    @test()
    protected static async prefixesBlockAndTrialMarkersWithTheirPosition() {
        this.render([
            this.phase('pre-baseline', { durationMs: 300000 }),
            this.phase('interventions', {
                blocks: [
                    this.block('tilt', {
                        setup: [this.event('check')],
                        trial: [
                            this.event('cue', {
                                end: { kind: 'duration', length: { ms: 3000 } },
                            }),
                            this.event('mark'),
                        ],
                        teardown: [
                            this.event('relax', {
                                end: { kind: 'duration', length: { ms: 5000 } },
                            }),
                        ],
                        conditions: { columns: ['side'], rows: [['l'], ['r']] },
                        repetitions: 3,
                    }),
                ],
            }),
        ])

        fireEvent.click(this.markersButton)
        fireEvent.click(this.expandAllButton)

        assert.isEqualDeep(
            this.shownMarkers,
            [
                'session-begin',
                'p1-pre-baseline-begin → p1-pre-baseline-end',
                'p2-interventions-begin → p2-interventions-end',
                'p2b1-tilt-begin → p2b1-tilt-end',
                'p2b1-check',
                'p2b1t{1–6}-begin-{side} → p2b1t{1–6}-end',
                'p2b1t{1–6}-cue-begin → p2b1t{1–6}-cue-end',
                'p2b1t{1–6}-mark',
                'p2b1-relax-begin → p2b1-relax-end',
                'session-end',
            ],
            'Did not prefix the block and trial markers with their position!'
        )
    }

    @test()
    protected static async endsTrialBeginMarkersWithValuesInColumnOrder() {
        this.render([
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        fireEvent.click(this.markersButton)
        fireEvent.click(this.expandAllButton)

        assert.isTrue(
            this.shownMarkers.includes(
                'p1b1t{1–2}-begin-{tilt-side}-{release-s} → p1b1t{1–2}-end'
            ),
            'Did not end trial begin markers with values in column order!'
        )
    }

    private static get markersButton() {
        return within(this.summary).getByRole('button', {
            name: /^(Show|Hide) markers$/,
        })
    }

    private static get shownMarkers() {
        return [...this.summary.querySelectorAll('.schedule__markers')].map(
            (markers) => markers.textContent
        )
    }

    @test()
    protected static async leavesShuffledBlocksUntimed() {
        this.render([
            this.phase('interventions', {
                blockOrder: 'shuffled',
                blocks: [this.block('tilt'), this.block('menthol')],
            }),
        ])

        this.open('interventions')

        assert.isEqualDeep(
            this.rows
                .filter(([, what]) => what === 'tilt' || what === 'menthol')
                .map(([time]) => time),
            ['', ''],
            'Did not leave the shuffled blocks untimed!'
        )
    }

    @test()
    protected static async offersNothingToEdit() {
        this.render([
            this.phase('interventions', { blocks: [this.reversibleTilt] }),
        ])

        assert.isLength(
            within(this.summary).queryAllByRole('textbox'),
            0,
            'Offered something to edit in the summary!'
        )
    }

    private static render(phases: Phase[]) {
        render(<ScheduleSummary phases={phases} />)
    }

    private static toggleOf(name: string) {
        return within(this.summary).getByRole('button', { name })
    }

    private static open(name: string) {
        fireEvent.click(this.toggleOf(name))
    }

    private static get summary() {
        return screen.getByRole('region', { name: 'Schedule' })
    }

    private static get rows() {
        return [...this.summary.querySelectorAll('.schedule__row')].map(
            (item) =>
                ['.schedule__time', '.schedule__name', '.schedule__detail'].map(
                    (selector) =>
                        (
                            item.querySelector(selector)?.textContent ?? ''
                        ).replace(/\u00a0/g, ' ')
                )
        )
    }

    private static phase(name: string, change: PhaseChange = {}): Phase {
        const { events = [], blocks = [], ...rest } = change

        return {
            name,
            durationMs: 0,
            items: [
                ...events.map((event) => ({ event })),
                ...blocks.map((block) => ({ block })),
            ],
            blockOrder: 'fixed',
            ...rest,
        }
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

    private static event(
        name: string,
        change: Partial<PlannedEvent> = {}
    ): PlannedEvent {
        return {
            name,
            action: { kind: 'marker' },
            start: { delay: { ms: 0 }, from: 'parentStart' },
            end: { kind: 'instant' },
            ...change,
        }
    }

    private static readonly reversibleTilt = this.block('reversible-tilt', {
        setup: [
            this.event('position-check', {
                action: { kind: 'cue', text: 'Head upright' },
                end: { kind: 'experimenter' },
            }),
        ],
        trial: [
            this.event('tilt-cue', {
                action: { kind: 'cue', text: 'Tilt head {tilt-side}' },
                end: { kind: 'duration', length: { ms: 3000 } },
            }),
            this.event('stroke', {
                action: {
                    kind: 'arm',
                    command: 'stroke {stroke-side}-forearm',
                },
                start: {
                    delay: { ms: 0 },
                    from: { event: 'tilt-cue', edge: 'end' },
                },
                end: { kind: 'actionFinishes' },
            }),
            this.event('upright-cue', {
                action: { kind: 'cue', text: 'Return head upright' },
                start: {
                    delay: { column: 'release-s' },
                    from: { event: 'stroke', edge: 'end' },
                },
            }),
            this.event('response-window', {
                start: {
                    delay: { ms: 0 },
                    from: { event: 'upright-cue', edge: 'start' },
                },
                end: { kind: 'duration', length: { ms: 30000 } },
            }),
        ],
        conditions: {
            columns: ['tilt-side', 'release-s'],
            rows: [
                ['left', '10'],
                ['right', '20'],
            ],
        },
        gap: { minMs: 10000, meanMs: 20000, maxMs: 60000 },
    })
}

interface PhaseChange extends Partial<Phase> {
    events?: PlannedEvent[]
    blocks?: Block[]
}
