import React, { useId, useState } from 'react'

import type { Amount, PlannedEvent } from './PlannedEvents'
import type { Block, Conditions, Phase, PhaseItem } from './ProtocolPhases'

export interface ScheduleSummaryProps {
    phases: Phase[]
}

const ScheduleSummary: React.FC<ScheduleSummaryProps> = (
    props: ScheduleSummaryProps
) => {
    const { phases } = props

    const headingId = useId()
    const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

    const { phaseRows, endRow } = scheduleOf(phases)
    const allKeys = phaseRows.flatMap(({ children }, index) =>
        children.length === 0
            ? []
            : [
                  phaseKeyOf(index),
                  ...children.flatMap((child, childIndex) =>
                      'contents' in child ? [blockKeyOf(index, childIndex)] : []
                  ),
              ]
    )
    const isAllOpen =
        allKeys.length > 0 && allKeys.every((key) => openKeys.has(key))

    const toggleOf = (key: string) => ({
        isOpen: openKeys.has(key),
        onToggle: () =>
            setOpenKeys((previous) => {
                const next = new Set(previous)
                next[next.has(key) ? 'delete' : 'add'](key)
                return next
            }),
    })

    return (
        <section className="schedule" aria-labelledby={headingId}>
            <h4 id={headingId} className="phases__subheading">
                Schedule
            </h4>
            <div className="schedule__card">
                {allKeys.length > 0 && (
                    <div className="schedule__controls">
                        <button
                            type="button"
                            className="schedule__expand-all"
                            onClick={() =>
                                setOpenKeys(new Set(isAllOpen ? [] : allKeys))
                            }
                        >
                            {isAllOpen ? 'Collapse all' : 'Expand all'}
                        </button>
                    </div>
                )}
                <ol className="schedule__list">
                    {phaseRows.map(({ row, children }, index) => {
                        const phaseToggle = toggleOf(phaseKeyOf(index))

                        return (
                            <li key={index} className="schedule__phase">
                                <ScheduleRowItem
                                    row={row}
                                    toggle={
                                        children.length > 0
                                            ? phaseToggle
                                            : undefined
                                    }
                                />
                                {phaseToggle.isOpen && (
                                    <ol className="schedule__children">
                                        {children.map((child, childIndex) =>
                                            'contents' in child ? (
                                                <BlockGroupItem
                                                    key={childIndex}
                                                    group={child}
                                                    toggle={toggleOf(
                                                        blockKeyOf(
                                                            index,
                                                            childIndex
                                                        )
                                                    )}
                                                />
                                            ) : (
                                                <li key={childIndex}>
                                                    <ScheduleRowItem
                                                        row={child}
                                                    />
                                                </li>
                                            )
                                        )}
                                    </ol>
                                )}
                            </li>
                        )
                    })}
                    <li>
                        <ScheduleRowItem row={endRow} />
                    </li>
                </ol>
            </div>
        </section>
    )
}

export default ScheduleSummary

const BlockGroupItem: React.FC<BlockGroupItemProps> = ({ group, toggle }) => (
    <li className="schedule__block">
        <ScheduleRowItem row={group.row} toggle={toggle} />
        {toggle.isOpen && (
            <ol>
                {group.contents.map((row, index) => (
                    <li key={index}>
                        <ScheduleRowItem row={row} />
                    </li>
                ))}
            </ol>
        )}
    </li>
)

interface BlockGroupItemProps {
    group: BlockGroup
    toggle: Toggle
}

function phaseKeyOf(phaseIndex: number) {
    return `${phaseIndex}`
}

function blockKeyOf(phaseIndex: number, itemIndex: number) {
    return `${phaseIndex}/${itemIndex}`
}

const ScheduleRowItem: React.FC<ScheduleRowItemProps> = ({ row, toggle }) => {
    const { time, what, kind, number, cueText, detail, depth } = row
    const label = <span className="schedule__name">{what}</span>

    return (
        <div
            className={[
                'schedule__row',
                `schedule__row--depth-${depth}`,
                kind && `schedule__row--${kind}`,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <span className="schedule__time">{time}</span>
            <span className="schedule__what">
                {kind && (
                    <span className="kind-tag" aria-hidden="true">
                        {kind} #{number}
                    </span>
                )}
                {toggle ? (
                    <button
                        type="button"
                        className="schedule__toggle"
                        aria-expanded={toggle.isOpen}
                        onClick={toggle.onToggle}
                    >
                        {label}
                    </button>
                ) : (
                    label
                )}
            </span>
            {cueText === undefined ? (
                <span className="schedule__detail">{detail}</span>
            ) : (
                <span className="schedule__detail schedule__detail--cue">
                    <span className="schedule__detail-edge">cue "</span>
                    <span className="schedule__cue-text" title={cueText}>
                        {cueText}
                    </span>
                    <span className="schedule__detail-edge">
                        "{detail && ` ${detail}`}
                    </span>
                </span>
            )}
        </div>
    )
}

interface ScheduleRowItemProps {
    row: ScheduleRow
    toggle?: Toggle
}

interface Toggle {
    isOpen: boolean
    onToggle: () => void
}

interface ScheduleRow {
    time: string
    what: string
    kind?: 'phase' | 'block' | 'event'
    number?: number
    cueText?: string
    detail: string
    depth: number
}

interface BlockGroup {
    row: ScheduleRow
    contents: ScheduleRow[]
}

interface Time {
    ms: number
    isExact: boolean
    isEstimate?: boolean
}

type ValueOf = (column: string) => Time

interface ItemTimes {
    start: Time
    end: Time
}

function scheduleOf(phases: Phase[]) {
    let phaseStart: Time = zero

    const phaseRows = phases.map((phase, index) => {
        const length = lengthOfPhase(phase)
        const phaseEnd = sumOf(phaseStart, length)
        const row: ScheduleRow = {
            time: spanOf({ start: phaseStart, end: phaseEnd }),
            what: phase.name || 'unnamed phase',
            kind: 'phase',
            number: index + 1,
            detail: '',
            depth: 0,
        }

        phaseStart = phaseEnd

        return { row, children: childRowsOf(phase) }
    })

    const endRow = {
        time: clockOf(phaseStart),
        what: 'end',
        detail: '',
        depth: 0,
    }

    return { phaseRows, endRow }
}

function childRowsOf(phase: Phase): (ScheduleRow | BlockGroup)[] {
    const isShuffled = hasShuffledBlocks(phase)
    const timesOf = itemTimesOf(phase.items, noColumns, isShuffled)

    let blockNumber = 0
    let eventNumber = 0

    const rows = phase.items.map((item, index) =>
        'block' in item
            ? blockGroupOf(
                  item.block,
                  isShuffled ? '' : spanOf(timesOf(index)),
                  ++blockNumber
              )
            : {
                  ...eventRowOf(item.event, ++eventNumber),
                  time: spanOf(timesOf(index), isInstant(item.event)),
                  depth: 1,
              }
    )

    return rows.map((row, index) => (index === 0 ? markedAsRelative(row) : row))
}

function markedAsRelative(
    row: ScheduleRow | BlockGroup
): ScheduleRow | BlockGroup {
    const withPlus = (time: string) => time.replace(/^([~≥]?)(?=\d)/, '$1+')

    return 'contents' in row
        ? { ...row, row: { ...row.row, time: withPlus(row.row.time) } }
        : { ...row, time: withPlus(row.time) }
}

function hasShuffledBlocks({ items, blockOrder }: Phase) {
    const numBlocks = items.filter((item) => 'block' in item).length
    return blockOrder !== 'fixed' && numBlocks > 1
}

function blockGroupOf(block: Block, time: string, number: number): BlockGroup {
    const { name, setup, trial, teardown, conditions, trialOrder, gap } = block
    const numTrials = conditionRowsOf(conditions).length * block.repetitions

    const beforeTrials: ScheduleRow[] =
        setup.length > 0
            ? [
                  {
                      time: 'before trials:',
                      what: 'before trials',
                      detail: '',
                      depth: 2,
                  },
                  ...eventRowsOf(setup, noColumns, 3),
              ]
            : []

    const afterTrials: ScheduleRow[] =
        teardown.length > 0
            ? [
                  {
                      time: 'after trials:',
                      what: 'after trials',
                      detail: '',
                      depth: 2,
                  },
                  ...eventRowsOf(teardown, noColumns, 3),
              ]
            : []

    return {
        row: {
            time,
            what: name || 'unnamed block',
            kind: 'block',
            number,
            detail: `${numTrials} ${numTrials === 1 ? 'trial' : 'trials'}, ${
                trialOrder === 'shuffled' ? 'shuffled' : 'in order'
            }`,
            depth: 1,
        },
        contents: [
            ...beforeTrials,
            {
                time: 'each trial:',
                what: 'each trial',
                detail: gapTextOf(gap),
                depth: 2,
            },
            ...eventRowsOf(trial, smallestValueOf(conditions), 3),
            ...afterTrials,
        ],
    }
}

function eventRowsOf(
    events: PlannedEvent[],
    valueOf: ValueOf,
    depth: number
): ScheduleRow[] {
    const timesOf = eventTimesOf(events, valueOf)

    return events.map((event, index) => ({
        ...eventRowOf(event, index + 1),
        time: spanOf(timesOf(index), isInstant(event)),
        depth,
    }))
}

function eventRowOf(event: PlannedEvent, number: number) {
    const { action } = event
    const row = {
        what: event.name || 'unnamed event',
        kind: 'event' as const,
        number,
    }

    return action.kind === 'cue'
        ? { ...row, cueText: action.text, detail: endTextOf(event) }
        : {
              ...row,
              detail: [actionTextOf(event), endTextOf(event)]
                  .filter(Boolean)
                  .join(' '),
          }
}

function lengthOfPhase(phase: Phase): Time {
    if (phase.durationMs > 0) {
        return { ms: phase.durationMs, isExact: true }
    }

    const { items } = phase
    return latestEndOf(
        itemTimesOf(items, noColumns, hasShuffledBlocks(phase)),
        items.length
    )
}

function lengthOfBlock(block: Block): Time {
    const { setup, trial, teardown, conditions, repetitions, gap } = block
    const conditionRows = conditionRowsOf(conditions)
    const numTrials = conditionRows.length * repetitions

    const trialLengths = conditionRows.map((row) =>
        lengthOfEvents(trial, (column) =>
            secondsIn(row[conditions.columns.indexOf(column)])
        )
    )
    const allTrials = Array(repetitions).fill(trialLengths).flat() as Time[]
    const gaps: Time = {
        ms: Math.max(0, numTrials - 1) * gap.minMs,
        isExact: numTrials <= 1 || isFixedGap(gap),
    }

    return [
        lengthOfEvents(setup, noColumns),
        ...allTrials,
        gaps,
        lengthOfEvents(teardown, noColumns),
    ].reduce(sumOf, zero)
}

function lengthOfEvents(events: PlannedEvent[], valueOf: ValueOf): Time {
    return latestEndOf(eventTimesOf(events, valueOf), events.length)
}

function latestEndOf(timesOf: (index: number) => ItemTimes, count: number) {
    return Array.from(
        { length: count },
        (_, index) => timesOf(index).end
    ).reduce(
        (latest, end) => ({
            ms: Math.max(latest.ms, end.ms),
            isExact: latest.isExact && end.isExact,
            isEstimate: latest.isEstimate || end.isEstimate,
        }),
        zero
    )
}

function eventTimesOf(events: PlannedEvent[], valueOf: ValueOf) {
    return itemTimesOf(
        events.map((event) => ({ event })),
        valueOf,
        false
    )
}

function itemTimesOf(
    items: PhaseItem[],
    valueOf: ValueOf,
    isShuffled: boolean
) {
    const resolved = new Map<number, ItemTimes>()

    const timesOf = (
        index: number,
        visiting = new Set<number>()
    ): ItemTimes => {
        const known = resolved.get(index)

        if (known) {
            return known
        }

        if (visiting.has(index)) {
            return { start: unknown, end: unknown }
        }

        visiting.add(index)

        const item = items[index]
        const times =
            'block' in item
                ? blockTimesOf(item.block, index, visiting)
                : eventTimesAt(item.event, visiting)

        resolved.set(index, times)
        return times
    }

    const blockTimesOf = (
        block: Block,
        index: number,
        visiting: Set<number>
    ): ItemTimes => {
        const start = index === 0 ? zero : timesOf(index - 1, visiting).end
        const end = sumOf(start, lengthOfBlock(block))

        return isShuffled
            ? {
                  start: { ...start, isExact: false },
                  end: { ...end, isExact: false },
              }
            : { start, end }
    }

    const eventTimesAt = (
        event: PlannedEvent,
        visiting: Set<number>
    ): ItemTimes => {
        const { start } = event
        const anchor =
            start.from === 'parentStart'
                ? zero
                : anchorTimeOf(start.from, visiting)
        const startTime = sumOf(anchor, amountOf(start.delay, valueOf))

        return {
            start: startTime,
            end: endTimeOf(startTime, event, valueOf),
        }
    }

    const anchorTimeOf = (
        { event, edge }: { event: string; edge: 'start' | 'end' },
        visiting: Set<number>
    ) => {
        const index = items.findIndex(
            (item) => ('event' in item ? item.event : item.block).name === event
        )
        return index === -1 ? unknown : timesOf(index, visiting)[edge]
    }

    return (index: number) => timesOf(index)
}

function endTimeOf(
    start: Time,
    { action, end }: PlannedEvent,
    valueOf: ValueOf
): Time {
    if (end.kind === 'duration') {
        return sumOf(start, amountOf(end.length, valueOf))
    }

    if (action.kind === 'cue') {
        return sumOf(start, {
            ms: spokenMsOf(action.text),
            isExact: end.kind !== 'experimenter',
            isEstimate: true,
        })
    }

    return end.kind === 'instant' ? start : { ...start, isExact: false }
}

function spokenMsOf(text: string) {
    const words = text.toLowerCase().match(/[a-z]+|\d/g) ?? []
    const syllables = words
        .map(syllablesIn)
        .reduce((total, count) => total + count, 0)
    const pauses = (
        text
            .trim()
            .slice(0, -1)
            .match(/[,;:.!?]/g) ?? []
    ).length

    return (syllables / syllablesPerSecond + pauses * pauseSeconds) * 1000
}

function syllablesIn(word: string) {
    if (/\d/.test(word)) {
        return 1
    }

    const vowelGroups = word.match(/[aeiouy]+/g)?.length ?? 0
    const hasSilentE =
        word.endsWith('e') && !word.endsWith('le') && vowelGroups > 1

    return Math.max(1, vowelGroups - (hasSilentE ? 1 : 0))
}

const syllablesPerSecond = 4.4
const pauseSeconds = 0.3

function amountOf(amount: Amount, valueOf: ValueOf): Time {
    return 'ms' in amount
        ? { ms: amount.ms, isExact: true }
        : valueOf(amount.column)
}

function smallestValueOf(conditions: Conditions): ValueOf {
    return (column) => {
        const index = conditions.columns.indexOf(column)
        const values = conditionRowsOf(conditions).map((row) =>
            secondsIn(row[index])
        )
        const smallest = Math.min(...values.map(({ ms }) => ms))

        return {
            ms: smallest,
            isExact: values.every(
                ({ ms, isExact }) => isExact && ms === smallest
            ),
        }
    }
}

function conditionRowsOf({ rows }: Conditions) {
    const filled = rows.filter((row) => row.some((cell) => cell.trim()))
    return filled.length > 0 ? filled : [[]]
}

function secondsIn(cell = ''): Time {
    const seconds = Number(cell)

    return cell.trim() && Number.isFinite(seconds)
        ? { ms: seconds * 1000, isExact: true }
        : unknown
}

function isFixedGap({ minMs, meanMs, maxMs }: Block['gap']) {
    return maxMs === minMs || (maxMs === 0 && meanMs <= minMs)
}

function sumOf(time: Time, other: Time): Time {
    return {
        ms: time.ms + other.ms,
        isExact: time.isExact && other.isExact,
        isEstimate: time.isEstimate || other.isEstimate,
    }
}

function actionTextOf({ action, end }: PlannedEvent) {
    switch (action.kind) {
        case 'arm':
            return `arm: ${action.command}`
        default:
            return end.kind === 'duration' ? 'interval' : 'marker'
    }
}

function endTextOf({ end }: PlannedEvent) {
    if (end.kind !== 'duration') {
        return ''
    }

    return 'ms' in end.length
        ? `for ${lengthTextOf(end.length.ms)}`
        : `for {${end.length.column}} s`
}

function lengthTextOf(ms: number) {
    const totalSeconds = Math.round(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    if (minutes === 0) {
        return `${seconds}\u00a0s`
    }

    return seconds === 0 ? `${minutes}m` : `${minutes}m${seconds}s`
}

function gapTextOf({ minMs, meanMs, maxMs }: Block['gap']) {
    if (minMs === 0 && meanMs === 0 && maxMs === 0) {
        return 'no gaps'
    }

    const range =
        maxMs > 0 ? `${minMs / 1000}–${maxMs / 1000} s` : `≥ ${minMs / 1000} s`
    const average = meanMs > minMs ? `, ${meanMs / 1000} s on average` : ''

    return `gaps ${range}${average}`
}

function spanOf({ start, end }: ItemTimes, isInstant = false) {
    return isInstant ? clockOf(start) : `${clockOf(start)} – ${clockOf(end)}`
}

function isInstant({ action, end }: PlannedEvent) {
    return end.kind === 'instant' && action.kind !== 'cue'
}

function clockOf({ ms, isExact, isEstimate }: Time) {
    const totalSeconds = Math.round(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = String(totalSeconds % 60).padStart(2, '0')
    const clock =
        hours > 0
            ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
            : `${minutes}:${seconds}`

    const prefix = isExact ? (isEstimate ? '~' : '') : '≥'

    return `${prefix}${clock}`
}

const zero: Time = { ms: 0, isExact: true }
const unknown: Time = { ms: 0, isExact: false }
const noColumns: ValueOf = () => unknown
