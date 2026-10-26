import React from 'react'

export interface PlannedEventsProps {
    scope: EventScope
    events: PlannedEvent[]
    columns?: string[]
    onChange: (events: PlannedEvent[]) => void
}

const PlannedEvents: React.FC<PlannedEventsProps> = (
    props: PlannedEventsProps
) => {
    const { scope, events, columns = [], onChange } = props

    const { noun } = scopeNames[scope]
    const label = `${capitalized(noun)}s`

    const changeAt = (index: number, change: Partial<PlannedEvent>) => {
        const previousName = events[index].name
        const renamed = change.name ?? previousName

        onChange(
            events.map((event, other) =>
                other === index
                    ? { ...event, ...change }
                    : startingAfterRenamed(event, previousName, renamed)
            )
        )
    }

    const removeAt = (index: number) => {
        const { name } = events[index]

        onChange(
            events
                .filter((_, other) => other !== index)
                .map((event) => startingWithParentInsteadOf(event, name))
        )
    }

    return (
        <section className="planned-events" aria-label={label}>
            {events.length > 0 && (
                <ol className="planned-events__list">
                    {events.map((event, index) => (
                        <PlannedEventRow
                            key={index}
                            number={index + 1}
                            label={`${capitalized(noun)} ${index + 1}`}
                            scope={scope}
                            event={event}
                            otherNames={events
                                .filter((_, other) => other !== index)
                                .map(({ name }) => name)
                                .filter(Boolean)}
                            columns={columns}
                            onChange={(change) => changeAt(index, change)}
                            onRemove={() => removeAt(index)}
                        />
                    ))}
                </ol>
            )}
            <button
                type="button"
                className="add-biosensor__button"
                aria-label={`Add ${noun}`}
                onClick={() => onChange([...events, newEvent()])}
            >
                + Event
            </button>
        </section>
    )
}

export default PlannedEvents

export interface PlannedEvent {
    name: string
    action: EventAction
    start: EventStart
    end: EventEnd
}

export type EventAction =
    | { kind: 'marker' }
    | { kind: 'cue'; text: string }
    | { kind: 'arm'; command: string }

export interface EventStart {
    delay: Amount
    from: 'parentStart' | { event: string; edge: 'start' | 'end' }
}

export type EventEnd =
    | { kind: 'instant' }
    | { kind: 'duration'; length: Amount }
    | { kind: 'actionFinishes' }
    | { kind: 'experimenter' }

export type Amount = { ms: number } | { column: string }

export type EventScope = 'phase' | 'block' | 'trial' | 'afterTrials'

const scopeNames: Record<EventScope, { noun: string; start: string }> = {
    phase: { noun: 'phase event', start: 'phase start' },
    block: { noun: 'block event', start: 'block start' },
    trial: { noun: 'trial event', start: 'trial start' },
    afterTrials: { noun: 'after-trials event', start: 'trials end' },
}

export const PlannedEventRow: React.FC<PlannedEventRowProps> = ({
    number,
    label,
    scope,
    event,
    otherNames,
    columns,
    onChange,
    onRemove,
}) => {
    const { name, action, start, end } = event

    return (
        <li className="planned-events__row" aria-label={label}>
            <span className="planned-events__number" aria-hidden="true">
                <span className="kind-tag">event #{number}</span>
            </span>
            <div className="planned-events__details">
                <div className="planned-events__what">
                    <input
                        type="text"
                        className="event-markers__name"
                        aria-label={`${label} name`}
                        placeholder="event-name"
                        value={name}
                        onChange={(change) =>
                            onChange({ name: kebabCaseOf(change.target.value) })
                        }
                    />
                    <select
                        aria-label={`${label} action`}
                        value={action.kind}
                        onChange={(change) =>
                            onChange({
                                action: actionOfKind(
                                    change.target.value as EventAction['kind']
                                ),
                            })
                        }
                    >
                        <option value="marker">Marker only</option>
                        <option value="cue">Cue</option>
                        <option value="arm">Robotic arm</option>
                    </select>
                    {action.kind === 'cue' && (
                        <input
                            type="text"
                            className="planned-events__text"
                            aria-label={`${label} cue`}
                            placeholder="What to do, e.g. Tilt head left"
                            value={action.text}
                            onChange={(change) =>
                                onChange({
                                    action: {
                                        kind: 'cue',
                                        text: change.target.value,
                                    },
                                })
                            }
                        />
                    )}
                    {action.kind === 'arm' && (
                        <input
                            type="text"
                            className="planned-events__text"
                            aria-label={`${label} arm command`}
                            placeholder="Command, e.g. stroke {site}"
                            value={action.command}
                            onChange={(change) =>
                                onChange({
                                    action: {
                                        kind: 'arm',
                                        command: change.target.value,
                                    },
                                })
                            }
                        />
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
                <div className="planned-events__when">
                    <span className="planned-events__timing">
                        starts
                        <AmountInput
                            label={`${label} delay`}
                            amount={start.delay}
                            columns={columns}
                            onChange={(delay) =>
                                onChange({ start: { ...start, delay } })
                            }
                        />
                        after
                        <select
                            aria-label={`${label} starts after`}
                            value={anchorValueOf(start.from)}
                            onChange={(change) =>
                                onChange({
                                    start: {
                                        ...start,
                                        from: anchorFrom(change.target.value),
                                    },
                                })
                            }
                        >
                            <option value="parentStart">
                                {scopeNames[scope].start}
                            </option>
                            {otherNames.flatMap((other) => [
                                <option
                                    key={`start:${other}`}
                                    value={`start:${other}`}
                                >
                                    {other} starts
                                </option>,
                                <option
                                    key={`end:${other}`}
                                    value={`end:${other}`}
                                >
                                    {other} ends
                                </option>,
                            ])}
                        </select>
                    </span>
                    <span className="planned-events__timing">
                        ends
                        <select
                            aria-label={`${label} ends`}
                            value={end.kind}
                            onChange={(change) =>
                                onChange({
                                    end: endOfKind(
                                        change.target.value as EventEnd['kind']
                                    ),
                                })
                            }
                        >
                            <option value="instant">at once</option>
                            <option value="duration">after</option>
                            <option value="actionFinishes">
                                when action finishes
                            </option>
                            <option value="experimenter">
                                when experimenter confirms
                            </option>
                        </select>
                        {end.kind === 'duration' && (
                            <AmountInput
                                label={`${label} duration`}
                                amount={end.length}
                                columns={columns}
                                onChange={(length) =>
                                    onChange({
                                        end: { kind: 'duration', length },
                                    })
                                }
                            />
                        )}
                    </span>
                </div>
            </div>
        </li>
    )
}

export interface PlannedEventRowProps {
    number: number
    label: string
    scope: EventScope
    event: PlannedEvent
    otherNames: string[]
    columns: string[]
    onChange: (change: Partial<PlannedEvent>) => void
    onRemove: () => void
}

const AmountInput: React.FC<AmountInputProps> = ({
    label,
    amount,
    columns,
    onChange,
}) => (
    <span className="planned-events__amount">
        {'ms' in amount && (
            <>
                <input
                    type="number"
                    min={0}
                    aria-label={`${label} (seconds)`}
                    placeholder="0"
                    value={amount.ms === 0 ? '' : amount.ms / 1000}
                    onChange={(change) =>
                        onChange({ ms: msFromSeconds(change.target.value) })
                    }
                />
                {columns.length === 0 && 's'}
            </>
        )}
        {columns.length > 0 && (
            <select
                aria-label={`${label} column`}
                value={'column' in amount ? amount.column : ''}
                onChange={(change) =>
                    onChange(
                        change.target.value
                            ? { column: change.target.value }
                            : { ms: 0 }
                    )
                }
            >
                <option value="">s</option>
                {columns.map((column) => (
                    <option key={column} value={column}>
                        {`{${column}}`}
                    </option>
                ))}
            </select>
        )}
    </span>
)

interface AmountInputProps {
    label: string
    amount: Amount
    columns: string[]
    onChange: (amount: Amount) => void
}

export function newEvent(): PlannedEvent {
    return {
        name: '',
        action: { kind: 'marker' },
        start: { delay: { ms: 0 }, from: 'parentStart' },
        end: { kind: 'instant' },
    }
}

function actionOfKind(kind: EventAction['kind']): EventAction {
    switch (kind) {
        case 'cue':
            return { kind, text: '' }
        case 'arm':
            return { kind, command: '' }
        default:
            return { kind: 'marker' }
    }
}

function endOfKind(kind: EventEnd['kind']): EventEnd {
    return kind === 'duration' ? { kind, length: { ms: 0 } } : { kind }
}

function anchorValueOf(from: EventStart['from']) {
    return from === 'parentStart' ? from : `${from.edge}:${from.event}`
}

function anchorFrom(value: string): EventStart['from'] {
    if (value === 'parentStart') {
        return value
    }

    const [edge, event] = value.split(/:(.*)/) as ['start' | 'end', string]
    return { event, edge }
}

export function startingAfterRenamed(
    event: PlannedEvent,
    previousName: string,
    renamed: string
): PlannedEvent {
    const { from } = event.start

    return from !== 'parentStart' && from.event === previousName
        ? {
              ...event,
              start: { ...event.start, from: { ...from, event: renamed } },
          }
        : event
}

export function startingWithParentInsteadOf(
    event: PlannedEvent,
    removedName: string
): PlannedEvent {
    const { from } = event.start

    return from !== 'parentStart' && from.event === removedName
        ? { ...event, start: { ...event.start, from: 'parentStart' } }
        : event
}

function capitalized(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1)
}

export function kebabCaseOf(typed: string) {
    return typed.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-')
}

export function msFromSeconds(typed: string) {
    return Math.max(0, Number(typed) || 0) * 1000
}

export function plannedEventsFrom(value: unknown): PlannedEvent[] {
    return objectsIn(value)
        .filter((event) => typeof event.name === 'string')
        .map((event) => ({
            name: event.name as string,
            action: actionFrom(objectsIn([event.action])[0]),
            start: startFrom(objectsIn([event.start])[0]),
            end: endFrom(objectsIn([event.end])[0]),
        }))
}

function actionFrom(action?: Record<string, unknown>): EventAction {
    switch (action?.kind) {
        case 'cue':
            return { kind: 'cue', text: String(action.text ?? '') }
        case 'arm':
            return { kind: 'arm', command: String(action.command ?? '') }
        default:
            return { kind: 'marker' }
    }
}

function startFrom(start?: Record<string, unknown>): EventStart {
    const from = objectsIn([start?.from])[0]
    const isAfterEvent =
        typeof from?.event === 'string' &&
        (from.edge === 'start' || from.edge === 'end')

    return {
        delay: amountFrom(start?.delay),
        from: isAfterEvent
            ? {
                  event: from.event as string,
                  edge: from.edge as 'start' | 'end',
              }
            : 'parentStart',
    }
}

function endFrom(end?: Record<string, unknown>): EventEnd {
    switch (end?.kind) {
        case 'duration':
            return { kind: 'duration', length: amountFrom(end.length) }
        case 'actionFinishes':
        case 'experimenter':
            return { kind: end.kind }
        case 'researcher':
            return { kind: 'experimenter' }
        default:
            return { kind: 'instant' }
    }
}

function amountFrom(value: unknown): Amount {
    const amount = objectsIn([value])[0]

    if (typeof amount?.column === 'string') {
        return { column: amount.column }
    }

    return {
        ms: typeof amount?.ms === 'number' && amount.ms > 0 ? amount.ms : 0,
    }
}

export function objectsIn(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value.filter(
              (item): item is Record<string, unknown> =>
                  typeof item === 'object' &&
                  item !== null &&
                  !Array.isArray(item)
          )
        : []
}
