import React, { useEffect, useId, useState } from 'react'

import PlannedEvents, {
    CueVoice,
    kebabCaseOf,
    msFromSeconds,
    newEvent,
    objectsIn,
    PlannedEvent,
    PlannedEventRow,
    plannedEventsFrom,
    startingAfterRenamed,
    speaker,
    startingWithParentInsteadOf,
} from './PlannedEvents'
import ScheduleSummary from './ScheduleSummary'

export interface ProtocolPhasesProps {
    phases: Phase[]
    voice: string
    isLocked?: boolean
    onChange: (phases: Phase[]) => void
    onVoiceChange: (voice: string) => void
}

const ProtocolPhases: React.FC<ProtocolPhasesProps> = (
    props: ProtocolPhasesProps
) => {
    const { phases, voice, isLocked = false, onChange, onVoiceChange } = props

    const headingId = useId()

    const changeAt = (index: number, change: Partial<Phase>) =>
        onChange(
            phases.map((phase, other) =>
                other === index ? { ...phase, ...change } : phase
            )
        )

    return (
        <CueVoice.Provider value={voice}>
            <ScheduleSummary phases={phases} />
            <section className="phases" aria-labelledby={headingId}>
                <h3 id={headingId} className="event-markers__heading">
                    Phases
                </h3>
                <fieldset className="phases__fieldset" disabled={isLocked}>
                    <VoiceChooser voice={voice} onChange={onVoiceChange} />
                    {phases.length > 0 && (
                        <ol className="phases__list">
                            {phases.map((phase, index) => (
                                <PhaseCard
                                    key={index}
                                    number={index + 1}
                                    phase={phase}
                                    onChange={(change) =>
                                        changeAt(index, change)
                                    }
                                    onRemove={() =>
                                        onChange(
                                            phases.filter(
                                                (_, other) => other !== index
                                            )
                                        )
                                    }
                                />
                            ))}
                        </ol>
                    )}
                    <div className="phases__add">
                        <button
                            type="button"
                            className="add-biosensor__button"
                            aria-label="Add phase"
                            onClick={() => onChange(withNewPhase(phases))}
                        >
                            + Phase
                        </button>
                        {baselines.map(({ name, label, isFirst }) => {
                            const hasBaseline = phases.some(
                                (phase) => phase.name === name
                            )

                            return (
                                <button
                                    key={name}
                                    type="button"
                                    className="add-biosensor__button"
                                    title={`${hasBaseline ? 'Remove' : 'Add'} 5 min ${name}`}
                                    aria-label={`+ 5m ${label}`}
                                    aria-pressed={hasBaseline}
                                    onClick={() =>
                                        onChange(
                                            hasBaseline
                                                ? phases.filter(
                                                      (phase) =>
                                                          phase.name !== name
                                                  )
                                                : isFirst
                                                  ? [
                                                        baselinePhase(name),
                                                        ...phases,
                                                    ]
                                                  : [
                                                        ...phases,
                                                        baselinePhase(name),
                                                    ]
                                        )
                                    }
                                >
                                    + 5<span className="phases__unit">m</span>{' '}
                                    {label}
                                </button>
                            )
                        })}
                    </div>
                </fieldset>
            </section>
        </CueVoice.Provider>
    )
}

export default ProtocolPhases

const VoiceChooser: React.FC<VoiceChooserProps> = ({ voice, onChange }) => {
    const [browserVoices, setBrowserVoices] = useState(() =>
        speaker.voiceNames()
    )

    useEffect(
        () =>
            speaker.onVoicesChanged(() =>
                setBrowserVoices(speaker.voiceNames())
            ),
        []
    )

    const voices = [...new Set([...browserVoices, voice])].sort()

    return (
        <label className="event-markers__wait phases__voice">
            cue voice
            <select
                aria-label="Cue voice"
                value={voice}
                onChange={(change) => onChange(change.target.value)}
            >
                {voices.map((name) => (
                    <option key={name} value={name}>
                        {name}
                    </option>
                ))}
            </select>
        </label>
    )
}

interface VoiceChooserProps {
    voice: string
    onChange: (voice: string) => void
}

export interface Phase {
    name: string
    durationMs: number
    items: PhaseItem[]
    blockOrder: BlockOrder
}

export type PhaseItem = { event: PlannedEvent } | { block: Block }

export type BlockOrder = 'fixed' | 'shuffled' | 'counterbalanced'

export interface Block {
    name: string
    setup: PlannedEvent[]
    trial: PlannedEvent[]
    teardown: PlannedEvent[]
    conditions: Conditions
    repetitions: number
    trialOrder: TrialOrder
    gap: { minMs: number; meanMs: number; maxMs: number }
}

export type TrialOrder = 'fixed' | 'shuffled'

export interface Conditions {
    columns: string[]
    rows: string[][]
}

const PhaseCard: React.FC<PhaseCardProps> = ({
    number,
    phase,
    onChange,
    onRemove,
}) => {
    const { name, durationMs, items, blockOrder } = phase
    const label = `Phase ${number}`
    const numBlocks = items.filter((item) => 'block' in item).length

    const changeItems = (next: PhaseItem[]) => onChange({ items: next })

    const changeItemAt = (index: number, changed: PhaseItem) => {
        const previousName = nameOf(items[index])
        const renamed = nameOf(changed)

        changeItems(
            items.map((item, other) =>
                other === index
                    ? changed
                    : withEvent(item, (event) =>
                          startingAfterRenamed(event, previousName, renamed)
                      )
            )
        )
    }

    const removeItemAt = (index: number) => {
        const removedName = nameOf(items[index])

        changeItems(
            items
                .filter((_, other) => other !== index)
                .map((item) =>
                    withEvent(item, (event) =>
                        startingWithParentInsteadOf(event, removedName)
                    )
                )
        )
    }

    const addEvent = () => {
        const last = items.at(-1)
        const event = newEvent()

        changeItems([
            ...items,
            {
                event:
                    last && 'block' in last && last.block.name
                        ? {
                              ...event,
                              start: {
                                  ...event.start,
                                  from: { event: last.block.name, edge: 'end' },
                              },
                          }
                        : event,
            },
        ])
    }

    let eventNumber = 0
    let blockNumber = 0

    return (
        <li className="phases__phase" aria-label={label}>
            <div className="phases__kind">
                <span className="kind-tag" aria-hidden="true">
                    phase #{number}
                </span>
            </div>
            <div className="phases__header">
                <input
                    type="text"
                    className="event-markers__name"
                    aria-label={`${label} name`}
                    placeholder="phase-name"
                    value={name}
                    onChange={(change) =>
                        onChange({ name: kebabCaseOf(change.target.value) })
                    }
                />
                <label className="event-markers__wait">
                    lasts
                    <input
                        type="number"
                        min={0}
                        aria-label={`${label} lasts (seconds)`}
                        placeholder="—"
                        title="Leave blank to last until its events and blocks finish"
                        value={durationMs === 0 ? '' : durationMs / 1000}
                        onChange={(change) =>
                            onChange({
                                durationMs: msFromSeconds(change.target.value),
                            })
                        }
                    />
                    s
                </label>
                {numBlocks > 1 && (
                    <label className="event-markers__wait">
                        blocks
                        <select
                            aria-label={`${label} block order`}
                            value={blockOrder}
                            onChange={(change) =>
                                onChange({
                                    blockOrder: change.target
                                        .value as BlockOrder,
                                })
                            }
                        >
                            <option value="fixed">in order</option>
                            <option value="shuffled">shuffled</option>
                            <option value="counterbalanced">
                                counterbalanced across sessions
                            </option>
                        </select>
                    </label>
                )}
                <button
                    type="button"
                    className="protocols__remove"
                    aria-label={`Remove ${label.toLowerCase()}`}
                    title="Remove"
                    onClick={onRemove}
                >
                    ×
                </button>
            </div>
            {items.length > 0 && (
                <ol className="phases__items">
                    {items.map((item, index) => {
                        if ('block' in item) {
                            blockNumber += 1

                            return (
                                <BlockItem
                                    key={index}
                                    number={blockNumber}
                                    block={item.block}
                                    onChange={(change) =>
                                        changeItemAt(index, {
                                            block: { ...item.block, ...change },
                                        })
                                    }
                                    onRemove={() => removeItemAt(index)}
                                />
                            )
                        }

                        eventNumber += 1

                        return (
                            <PlannedEventRow
                                key={index}
                                number={eventNumber}
                                label={`Phase event ${eventNumber}`}
                                scope="phase"
                                event={item.event}
                                otherNames={items
                                    .filter((_, other) => other !== index)
                                    .map(nameOf)
                                    .filter(Boolean)}
                                columns={[]}
                                onChange={(change) =>
                                    changeItemAt(index, {
                                        event: { ...item.event, ...change },
                                    })
                                }
                                onRemove={() => removeItemAt(index)}
                            />
                        )
                    })}
                </ol>
            )}
            <div className="phases__add">
                <button
                    type="button"
                    className="add-biosensor__button"
                    aria-label="Add phase event"
                    onClick={addEvent}
                >
                    + Event
                </button>
                <button
                    type="button"
                    className="add-biosensor__button"
                    aria-label={`Add block to ${label.toLowerCase()}`}
                    onClick={() =>
                        changeItems([...items, { block: newBlock() }])
                    }
                >
                    + Block
                </button>
            </div>
        </li>
    )
}

interface PhaseCardProps {
    number: number
    phase: Phase
    onChange: (change: Partial<Phase>) => void
    onRemove: () => void
}

function nameOf(item: PhaseItem) {
    return 'event' in item ? item.event.name : item.block.name
}

function withEvent(
    item: PhaseItem,
    change: (event: PlannedEvent) => PlannedEvent
): PhaseItem {
    return 'event' in item ? { event: change(item.event) } : item
}

const BlockItem: React.FC<BlockItemProps> = ({
    number,
    block,
    onChange,
    onRemove,
}) => {
    const { name, setup, trial, conditions, repetitions, trialOrder, gap } =
        block
    const label = `Block ${number}`
    const numFilledRows = conditions.rows.filter((row) =>
        row.some((cell) => cell.trim())
    ).length
    const numTrials = Math.max(1, numFilledRows) * repetitions

    return (
        <li className="phases__block" aria-label={label}>
            <div className="phases__kind">
                <span className="kind-tag" aria-hidden="true">
                    block #{number}
                </span>
            </div>
            <div className="phases__header">
                <input
                    type="text"
                    className="event-markers__name"
                    aria-label={`${label} name`}
                    placeholder="block-name"
                    value={name}
                    onChange={(change) =>
                        onChange({ name: kebabCaseOf(change.target.value) })
                    }
                />
                <button
                    type="button"
                    className="protocols__remove"
                    aria-label={`Remove ${label.toLowerCase()}`}
                    title="Remove"
                    onClick={onRemove}
                >
                    ×
                </button>
            </div>
            <h4 className="phases__subheading">Before trials</h4>
            <PlannedEvents
                scope="block"
                events={setup}
                onChange={(setup) => onChange({ setup })}
            />
            <h4 className="phases__subheading">Each trial</h4>
            <PlannedEvents
                scope="trial"
                events={trial}
                columns={numericColumnsOf(conditions)}
                onChange={(trial) => onChange({ trial })}
            />
            <h4 className="phases__subheading">After trials</h4>
            <PlannedEvents
                scope="afterTrials"
                events={block.teardown}
                onChange={(teardown) => onChange({ teardown })}
            />
            <h4 className="phases__subheading">Conditions</h4>
            <ConditionsTable
                label={label}
                conditions={conditions}
                onChange={(conditions) => onChange({ conditions })}
            />
            <div className="phases__trials">
                <label className="event-markers__wait">
                    repeat each
                    <input
                        type="number"
                        min={1}
                        aria-label={`${label} repetitions`}
                        value={repetitions}
                        onChange={(change) =>
                            onChange({
                                repetitions: Math.max(
                                    1,
                                    Math.round(Number(change.target.value)) || 1
                                ),
                            })
                        }
                    />
                    ×
                </label>
                <select
                    aria-label={`${label} trial order`}
                    value={trialOrder}
                    onChange={(change) =>
                        onChange({
                            trialOrder: change.target.value as TrialOrder,
                        })
                    }
                >
                    <option value="shuffled">shuffled</option>
                    <option value="fixed">in order</option>
                </select>
                <span className="phases__count">
                    {numTrials} {numTrials === 1 ? 'trial' : 'trials'}
                </span>
                <label className="event-markers__wait">
                    gap between trials at least
                    <input
                        type="number"
                        min={0}
                        aria-label={`${label} gap at least (seconds)`}
                        placeholder="0"
                        value={gap.minMs === 0 ? '' : gap.minMs / 1000}
                        onChange={(change) =>
                            onChange({
                                gap: {
                                    ...gap,
                                    minMs: msFromSeconds(change.target.value),
                                },
                            })
                        }
                    />
                    s, on average
                    <input
                        type="number"
                        min={0}
                        aria-label={`${label} gap on average (seconds)`}
                        placeholder="0"
                        title="Gaps longer than the minimum are rarer the longer they are"
                        value={gap.meanMs === 0 ? '' : gap.meanMs / 1000}
                        onChange={(change) =>
                            onChange({
                                gap: {
                                    ...gap,
                                    meanMs: msFromSeconds(change.target.value),
                                },
                            })
                        }
                    />
                    s, at most
                    <input
                        type="number"
                        min={0}
                        aria-label={`${label} gap at most (seconds)`}
                        placeholder="—"
                        value={gap.maxMs === 0 ? '' : gap.maxMs / 1000}
                        onChange={(change) =>
                            onChange({
                                gap: {
                                    ...gap,
                                    maxMs: msFromSeconds(change.target.value),
                                },
                            })
                        }
                    />
                    s
                </label>
            </div>
        </li>
    )
}

interface BlockItemProps {
    number: number
    block: Block
    onChange: (change: Partial<Block>) => void
    onRemove: () => void
}

const ConditionsTable: React.FC<ConditionsTableProps> = ({
    label,
    conditions,
    onChange,
}) => {
    const { columns, rows } = conditions
    const what = `${label.toLowerCase()} conditions`

    const columnLabelOf = (index: number) =>
        columns[index] || `column ${index + 1}`

    return (
        <div className="conditions">
            {columns.length > 0 && (
                <div className="conditions__scroll">
                    <table className="conditions__table">
                        <thead>
                            <tr>
                                {columns.map((column, index) => (
                                    <th key={index}>
                                        <input
                                            type="text"
                                            aria-label={`${label} column ${index + 1} name`}
                                            placeholder="column"
                                            value={column}
                                            onChange={(change) =>
                                                onChange({
                                                    columns: columns.map(
                                                        (other, at) =>
                                                            at === index
                                                                ? kebabCaseOf(
                                                                      change
                                                                          .target
                                                                          .value
                                                                  )
                                                                : other
                                                    ),
                                                    rows,
                                                })
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="protocols__remove"
                                            aria-label={`Remove column ${columnLabelOf(index)} of ${what}`}
                                            title="Remove"
                                            onClick={() =>
                                                onChange({
                                                    columns: columns.filter(
                                                        (_, at) => at !== index
                                                    ),
                                                    rows: rows.map((row) =>
                                                        row.filter(
                                                            (_, at) =>
                                                                at !== index
                                                        )
                                                    ),
                                                })
                                            }
                                        >
                                            ×
                                        </button>
                                    </th>
                                ))}
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    {row.map((value, columnIndex) => (
                                        <td key={columnIndex}>
                                            <input
                                                type="text"
                                                aria-label={`${label} row ${rowIndex + 1} ${columnLabelOf(columnIndex)}`}
                                                value={value}
                                                onChange={(change) =>
                                                    onChange({
                                                        columns,
                                                        rows: withCell(
                                                            rows,
                                                            rowIndex,
                                                            columnIndex,
                                                            change.target.value
                                                        ),
                                                    })
                                                }
                                            />
                                        </td>
                                    ))}
                                    <td>
                                        <button
                                            type="button"
                                            className="protocols__remove"
                                            aria-label={`Remove row ${rowIndex + 1} of ${what}`}
                                            title="Remove"
                                            onClick={() =>
                                                onChange({
                                                    columns,
                                                    rows: rows.filter(
                                                        (_, at) =>
                                                            at !== rowIndex
                                                    ),
                                                })
                                            }
                                        >
                                            ×
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="conditions__add">
                <button
                    type="button"
                    className="add-biosensor__button"
                    aria-label={`Add column to ${what}`}
                    onClick={() =>
                        onChange({
                            columns: [...columns, ''],
                            rows: rows.map((row) => [...row, '']),
                        })
                    }
                >
                    + Column / Variable
                </button>
                {columns.length > 0 && (
                    <button
                        type="button"
                        className="add-biosensor__button"
                        aria-label={`Add row to ${what}`}
                        onClick={() =>
                            onChange({
                                columns,
                                rows: [...rows, columns.map(() => '')],
                            })
                        }
                    >
                        + Row / Condition
                    </button>
                )}
            </div>
        </div>
    )
}

interface ConditionsTableProps {
    label: string
    conditions: Conditions
    onChange: (conditions: Conditions) => void
}

function withCell(
    rows: string[][],
    rowIndex: number,
    columnIndex: number,
    value: string
) {
    return rows.map((row, at) =>
        at === rowIndex
            ? row.map((cell, column) => (column === columnIndex ? value : cell))
            : row
    )
}

function withNewPhase(phases: Phase[]) {
    const postBaselineIndex = phases.findIndex(
        ({ name }) => name === 'post-baseline'
    )
    const index = postBaselineIndex === -1 ? phases.length : postBaselineIndex

    return [...phases.slice(0, index), newPhase(), ...phases.slice(index)]
}

function newPhase(): Phase {
    return {
        name: '',
        durationMs: 0,
        items: [],
        blockOrder: 'fixed',
    }
}

function newBlock(): Block {
    return {
        name: '',
        setup: [],
        trial: [],
        teardown: [],
        conditions: { columns: [], rows: [] },
        repetitions: 1,
        trialOrder: 'shuffled',
        gap: { minMs: 0, meanMs: 0, maxMs: 0 },
    }
}

const baselines = [
    { name: 'pre-baseline', label: 'Pre-baseline', isFirst: true },
    { name: 'post-baseline', label: 'Post-baseline', isFirst: false },
]

function baselinePhase(name: string): Phase {
    const events: PlannedEvent[] = [
        {
            name: `${name}-before`,
            action: {
                kind: 'cue',
                text: 'Please close your eyes for the next 5 minutes',
            },
            start: { delay: { ms: 0 }, from: 'parentStart' },
            end: { kind: 'actionFinishes' },
        },
        {
            name: `${name}-rest`,
            action: { kind: 'marker' },
            start: {
                delay: { ms: 0 },
                from: { event: `${name}-before`, edge: 'end' },
            },
            end: { kind: 'duration', length: { ms: 5 * 60 * 1000 } },
        },
        {
            name: `${name}-after`,
            action: { kind: 'cue', text: 'Please open your eyes now' },
            start: {
                delay: { ms: 0 },
                from: { event: `${name}-rest`, edge: 'end' },
            },
            end: { kind: 'actionFinishes' },
        },
    ]

    return {
        ...newPhase(),
        name,
        items: events.map((event) => ({ event })),
    }
}

function numericColumnsOf({ columns, rows }: Conditions) {
    return columns.filter((column, index) => {
        const values = rows.map((row) => row[index].trim()).filter(Boolean)
        return column && values.length > 0 && values.every(isNumeric)
    })
}

function isNumeric(value: string) {
    return Number.isFinite(Number(value))
}

export function phasesFrom(value: unknown): Phase[] {
    return objectsIn(value)
        .filter((phase) => typeof phase.name === 'string')
        .map((phase) => ({
            name: phase.name as string,
            durationMs: msOr(phase.durationMs),
            items: Array.isArray(phase.items)
                ? itemsFrom(phase.items)
                : [
                      ...plannedEventsFrom(phase.events).map((event) => ({
                          event,
                      })),
                      ...blocksFrom(phase.blocks).map((block) => ({ block })),
                  ],
            blockOrder: oneOf(phase.blockOrder, blockOrders),
        }))
}

function itemsFrom(items: unknown[]): PhaseItem[] {
    return objectsIn(items).flatMap((item): PhaseItem[] => {
        const [event] = plannedEventsFrom([item.event])
        const [block] = blocksFrom([item.block])

        return event ? [{ event }] : block ? [{ block }] : []
    })
}

function blocksFrom(value: unknown): Block[] {
    return objectsIn(value)
        .filter((block) => typeof block.name === 'string')
        .map((block) => {
            const gap = objectsIn([block.gap])[0] ?? {}

            return {
                name: block.name as string,
                setup: plannedEventsFrom(block.setup),
                trial: plannedEventsFrom(block.trial),
                teardown: plannedEventsFrom(block.teardown),
                conditions: conditionsFrom(block.conditions),
                repetitions: Math.max(
                    1,
                    Math.round(Number(block.repetitions)) || 1
                ),
                trialOrder: oneOf(block.trialOrder, trialOrders),
                gap: {
                    minMs: msOr(gap.minMs),
                    meanMs: msOr(gap.meanMs),
                    maxMs: msOr(gap.maxMs),
                },
            }
        })
}

function conditionsFrom(value: unknown): Conditions {
    const conditions = objectsIn([value])[0] ?? {}
    const columns = Array.isArray(conditions.columns)
        ? conditions.columns.map(String)
        : []
    const rows = Array.isArray(conditions.rows)
        ? conditions.rows
              .filter(Array.isArray)
              .map((row: unknown[]) =>
                  columns.map((_, index) => String(row[index] ?? ''))
              )
        : []

    return { columns, rows }
}

const blockOrders: BlockOrder[] = ['fixed', 'shuffled', 'counterbalanced']
const trialOrders: TrialOrder[] = ['shuffled', 'fixed']

function oneOf<Choice extends string>(value: unknown, choices: Choice[]) {
    return choices.includes(value as Choice) ? (value as Choice) : choices[0]
}

function msOr(value: unknown) {
    return typeof value === 'number' && value > 0 ? value : 0
}
