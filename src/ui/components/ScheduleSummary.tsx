import React, { createContext, useContext, useId, useState } from 'react'

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
    const [showsMarkers, setShowsMarkers] = useState(false)
    const [showsTags, setShowsTags] = useState(false)

    const { phaseRows, endRow } = scheduleOf(phases)
    const levels = levelsOf(phaseRows)
    const allKeys = levels.flat()
    const isAllOpen =
        allKeys.length > 0 && allKeys.every((key) => openKeys.has(key))

    const nextLevelToExpand = levels.findIndex(
        (level) => !level.every((key) => openKeys.has(key))
    )
    const nextLevelToCollapse = levels.findLastIndex((level) =>
        level.some((key) => isShownOpen(key, openKeys))
    )

    const expandLevel = () =>
        setOpenKeys(
            new Set([
                ...openKeys,
                ...levels.slice(0, nextLevelToExpand + 1).flat(),
            ])
        )

    const collapseLevel = () => {
        const closing = new Set(levels.slice(nextLevelToCollapse).flat())
        setOpenKeys(new Set([...openKeys].filter((key) => !closing.has(key))))
    }

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
        <section
            className={showsTags ? 'schedule' : 'schedule schedule--tagless'}
            aria-labelledby={headingId}
        >
            <h4 id={headingId} className="phases__subheading">
                Schedule
            </h4>
            <Shown.Provider value={{ markers: showsMarkers, tags: showsTags }}>
                <div className="schedule__card">
                    {phases.length > 0 && (
                        <div className="schedule__controls">
                            <button
                                type="button"
                                className="schedule__expand-all"
                                aria-pressed={showsTags}
                                onClick={() => setShowsTags(!showsTags)}
                            >
                                {showsTags ? 'Hide tags' : 'Show tags'}
                            </button>
                            <button
                                type="button"
                                className="schedule__expand-all"
                                aria-pressed={showsMarkers}
                                onClick={() => setShowsMarkers(!showsMarkers)}
                            >
                                {showsMarkers ? 'Hide markers' : 'Show markers'}
                            </button>
                            {allKeys.length > 0 && (
                                <>
                                    <button
                                        type="button"
                                        className="schedule__expand-all"
                                        aria-label="Collapse one level"
                                        disabled={nextLevelToCollapse === -1}
                                        onClick={collapseLevel}
                                    >
                                        −
                                    </button>
                                    <button
                                        type="button"
                                        className="schedule__expand-all"
                                        onClick={() =>
                                            setOpenKeys(
                                                new Set(
                                                    isAllOpen ? [] : allKeys
                                                )
                                            )
                                        }
                                    >
                                        {isAllOpen
                                            ? 'Collapse all'
                                            : 'Expand all'}
                                    </button>
                                    <button
                                        type="button"
                                        className="schedule__expand-all"
                                        aria-label="Expand one level"
                                        disabled={nextLevelToExpand === -1}
                                        onClick={expandLevel}
                                    >
                                        +
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    <ol className="schedule__list">
                        {showsMarkers && (
                            <li>
                                <ScheduleRowItem row={startRow} />
                            </li>
                        )}
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
                                            {children.map(
                                                (child, childIndex) =>
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
            </Shown.Provider>
        </section>
    )
}

export default ScheduleSummary

const Shown = createContext({ markers: false, tags: false })

const startRow: ScheduleRow = {
    time: '0:00',
    what: 'start',
    detail: '',
    depth: 0,
    markers: 'session-begin',
}

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

function levelsOf(phaseRows: ReturnType<typeof scheduleOf>['phaseRows']) {
    const withChildren = phaseRows
        .map(({ children }, index) => ({ children, index }))
        .filter(({ children }) => children.length > 0)

    return [
        withChildren.map(({ index }) => phaseKeyOf(index)),
        withChildren.flatMap(({ children, index }) =>
            children.flatMap((child, childIndex) =>
                'contents' in child ? [blockKeyOf(index, childIndex)] : []
            )
        ),
    ].filter((level) => level.length > 0)
}

function isShownOpen(key: string, openKeys: Set<string>) {
    const parts = key.split('/')
    return parts.every((_, depth) =>
        openKeys.has(parts.slice(0, depth + 1).join('/'))
    )
}

function phaseKeyOf(phaseIndex: number) {
    return `${phaseIndex}`
}

function blockKeyOf(phaseIndex: number, itemIndex: number) {
    return `${phaseIndex}/${itemIndex}`
}

const ScheduleRowItem: React.FC<ScheduleRowItemProps> = ({ row, toggle }) => {
    const { time, range, what, kind, number, cueText, detail, depth, markers } =
        row
    const label = <span className="schedule__name">{what}</span>
    const shows = useContext(Shown)

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
            <span className="schedule__time" title={range}>
                {time}
            </span>
            <span className="schedule__what">
                {shows.tags && kind && (
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
            {shows.markers && markers && (
                <span className="schedule__markers">{markers}</span>
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
    range?: string
    what: string
    kind?: 'phase' | 'block' | 'event'
    number?: number
    cueText?: string
    detail: string
    depth: number
    markers?: string
}

interface BlockGroup {
    row: ScheduleRow
    contents: ScheduleRow[]
}

interface Time {
    minMs: number
    ms: number
    maxMs: number
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
        const code = `p${index + 1}`
        const length = lengthOfPhase(phase)
        const phaseEnd = sumOf(phaseStart, length)
        const row: ScheduleRow = {
            ...timedBy({ start: phaseStart, end: phaseEnd }),
            what: phase.name || 'unnamed phase',
            kind: 'phase',
            number: index + 1,
            detail: '',
            depth: 0,
            markers: beginAndEndOf(`${code}-${phase.name || 'phase'}`),
        }

        phaseStart = phaseEnd

        return { row, children: childRowsOf(phase, code) }
    })

    const endRow = {
        time: clockOf(phaseStart),
        range: rangeOf(phaseStart),
        what: 'end',
        detail: '',
        depth: 0,
        markers: 'session-end',
    }

    return { phaseRows, endRow }
}

function childRowsOf(
    phase: Phase,
    phaseCode: string
): (ScheduleRow | BlockGroup)[] {
    const isShuffled = hasShuffledBlocks(phase)
    const timesOf = itemTimesOf(phase.items, noColumns, isShuffled)

    let blockNumber = 0
    let eventNumber = 0

    const rows = phase.items.map((item, index) =>
        'block' in item
            ? blockGroupOf(
                  item.block,
                  isShuffled ? untimed : timedBy(timesOf(index)),
                  ++blockNumber,
                  `${phaseCode}b${blockNumber}`
              )
            : {
                  ...eventRowOf(item.event, ++eventNumber, `${phaseCode}-`),
                  ...timedBy(timesOf(index), isInstant(item.event)),
                  depth: 1,
              }
    )

    return rows.map((row, index) => (index === 0 ? markedAsRelative(row) : row))
}

function markedAsRelative(
    row: ScheduleRow | BlockGroup
): ScheduleRow | BlockGroup {
    const withPlus = (time: string) => time.replace(/^([~≥]*)(?=\d)/, '$1+')

    return 'contents' in row
        ? { ...row, row: { ...row.row, time: withPlus(row.row.time) } }
        : { ...row, time: withPlus(row.time) }
}

function hasShuffledBlocks({ items, blockOrder }: Phase) {
    const numBlocks = items.filter((item) => 'block' in item).length
    return blockOrder !== 'fixed' && numBlocks > 1
}

function blockGroupOf(
    block: Block,
    timing: { time: string; range?: string },
    number: number,
    code: string
): BlockGroup {
    const { name, setup, trial, teardown, conditions, trialOrder, gap } = block
    const numTrials = conditionRowsOf(conditions).length * block.repetitions
    const trialCode = `${code}t${numTrials === 1 ? '1' : `{1–${numTrials}}`}`

    const beforeTrials: ScheduleRow[] =
        setup.length > 0
            ? [
                  {
                      time: 'before trials:',
                      what: 'before trials',
                      detail: '',
                      depth: 2,
                  },
                  ...eventRowsOf(setup, noColumns, 3, `${code}-`),
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
                  ...eventRowsOf(teardown, noColumns, 3, `${code}-`),
              ]
            : []

    return {
        row: {
            ...timing,
            what: name || 'unnamed block',
            kind: 'block',
            number,
            detail: `${numTrials} ${numTrials === 1 ? 'trial' : 'trials'}, ${
                trialOrder === 'shuffled' ? 'shuffled' : 'in order'
            }`,
            depth: 1,
            markers: beginAndEndOf(`${code}-${name || 'block'}`),
        },
        contents: [
            ...beforeTrials,
            {
                time: 'each trial:',
                what: 'each trial',
                detail: gapTextOf(gap),
                depth: 2,
                markers: beginAndEndOf(trialCode, valuesOf(conditions)),
            },
            ...eventRowsOf(
                trial,
                averageValueOf(conditions),
                3,
                `${trialCode}-`
            ),
            ...afterTrials,
        ],
    }
}

function eventRowsOf(
    events: PlannedEvent[],
    valueOf: ValueOf,
    depth: number,
    markerPrefix: string
): ScheduleRow[] {
    const timesOf = eventTimesOf(events, valueOf)

    return events.map((event, index) => ({
        ...eventRowOf(event, index + 1, markerPrefix),
        ...timedBy(timesOf(index), isInstant(event)),
        depth,
    }))
}

function eventRowOf(event: PlannedEvent, number: number, markerPrefix: string) {
    const { action } = event
    const markerName = `${markerPrefix}${event.name || 'event'}`
    const row = {
        what: event.name || 'unnamed event',
        kind: 'event' as const,
        number,
        markers: isInstant(event) ? markerName : beginAndEndOf(markerName),
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
        return exactly(phase.durationMs)
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
    const gaps = repeated(Math.max(0, numTrials - 1), lengthOfGap(gap))

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
            minMs: Math.max(latest.minMs, end.minMs),
            ms: Math.max(latest.ms, end.ms),
            maxMs: Math.max(latest.maxMs, end.maxMs),
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
                  start: { ...start, maxMs: Infinity },
                  end: { ...end, maxMs: Infinity },
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
        const spokenMs = spokenMsOf(action.text)

        return sumOf(start, {
            minMs: spokenMs,
            ms: spokenMs,
            maxMs: end.kind === 'experimenter' ? Infinity : spokenMs,
            isEstimate: true,
        })
    }

    return end.kind === 'instant' ? start : sumOf(start, unknown)
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
    return 'ms' in amount ? exactly(amount.ms) : valueOf(amount.column)
}

function averageValueOf(conditions: Conditions): ValueOf {
    return (column) => {
        const index = conditions.columns.indexOf(column)
        const values = conditionRowsOf(conditions).map((row) =>
            secondsIn(row[index])
        )

        return {
            minMs: Math.min(...values.map(({ minMs }) => minMs)),
            ms: values.reduce((total, { ms }) => total + ms, 0) / values.length,
            maxMs: Math.max(...values.map(({ maxMs }) => maxMs)),
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
        ? exactly(seconds * 1000)
        : unknown
}

function lengthOfGap({ minMs, meanMs, maxMs }: Block['gap']): Time {
    const hasNoMax = maxMs === 0 && meanMs > minMs
    const longestMs = hasNoMax ? Infinity : Math.max(minMs, maxMs)

    return {
        minMs,
        ms: meanMs > minMs ? meanMs : (minMs + Math.max(minMs, maxMs)) / 2,
        maxMs: longestMs,
    }
}

function repeated(count: number, { minMs, ms, maxMs }: Time): Time {
    return {
        minMs: count * minMs,
        ms: count * ms,
        maxMs: count === 0 ? 0 : count * maxMs,
    }
}

function sumOf(time: Time, other: Time): Time {
    return {
        minMs: time.minMs + other.minMs,
        ms: time.ms + other.ms,
        maxMs: time.maxMs + other.maxMs,
        isEstimate: time.isEstimate || other.isEstimate,
    }
}

function actionTextOf({ action, end }: PlannedEvent) {
    switch (action.kind) {
        case 'arm':
            return `arm: ${action.command}`
        case 'audio':
            return `play ${action.file || 'audio'}`
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

function timedBy({ start, end }: ItemTimes, isInstant = false) {
    return isInstant
        ? { time: clockOf(start), range: rangeOf(start) }
        : { time: `${clockOf(start)} – ${clockOf(end)}`, range: rangeOf(end) }
}

function rangeOf({ minMs, ms, maxMs }: Time) {
    if (minMs === maxMs) {
        return undefined
    }

    const longest = maxMs === Infinity ? 'open-ended' : clockOf(exactly(maxMs))

    return `shortest ${clockOf(exactly(minMs))} · average ${clockOf(
        exactly(ms)
    )} · longest ${longest}`
}

function valuesOf({ columns }: Conditions) {
    return columns
        .filter((column) => column.trim())
        .map((column) => `-{${column}}`)
        .join('')
}

function beginAndEndOf(name: string, beginValues = '') {
    return `${name}-begin${beginValues} → ${name}-end`
}

function isInstant({ action, end }: PlannedEvent) {
    return end.kind === 'instant' && action.kind !== 'cue'
}

function clockOf({ minMs, ms, maxMs, isEstimate }: Time) {
    const totalSeconds = Math.round(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = String(totalSeconds % 60).padStart(2, '0')
    const clock =
        hours > 0
            ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
            : `${minutes}:${seconds}`

    const isOpenEnded = maxMs === Infinity
    const isAbout = isEstimate || minMs !== (isOpenEnded ? ms : maxMs)
    const prefix = `${isOpenEnded ? '≥' : ''}${isAbout ? '~' : ''}`

    return `${prefix}${clock}`
}

function exactly(ms: number): Time {
    return { minMs: ms, ms, maxMs: ms }
}

const zero = exactly(0)
const unknown: Time = { minMs: 0, ms: 0, maxMs: Infinity }
const untimed = { time: '', range: undefined }
const noColumns: ValueOf = () => unknown
