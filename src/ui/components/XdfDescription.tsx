import React, { useState } from 'react'

import { DescElement } from '../../functions/readXdfRecording'

const XdfDescription: React.FC<XdfDescriptionProps> = ({
    header = [],
    devices,
}) => {
    const [isExpanded, setIsExpanded] = useState(false)

    const describedDevices = devices.map(({ label, streams }) => ({
        label,
        streams: streams
            .map(({ name, desc = [] }) => ({
                name,
                elements: inDisplayOrder(desc),
            }))
            .filter(({ elements }) => elements.length > 0),
    }))

    const described = describedDevices.flatMap(({ streams }) => streams)

    if (header.length === 0 && described.length === 0) {
        return null
    }

    const sharedByStreams =
        described.length > 1
            ? sharedFieldsOf(described.map(({ elements }) => elements))
            : []

    const ownByDevice = describedDevices
        .map(({ label, streams }) => ({
            label,
            streams: streams
                .map(({ name, elements }) => ({
                    name,
                    elements: withoutFields(elements, sharedByStreams),
                }))
                .filter(({ elements }) => elements.length > 0),
        }))
        .filter(({ streams }) => streams.length > 0)

    return (
        <section className="xdf-description">
            <button
                type="button"
                className="xdf-description__toggle"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
            >
                XDF description
            </button>
            {isExpanded && header.length > 0 && (
                <div className="xdf-description__stream">
                    <h3 className="xdf-description__stream-name">
                        File header
                    </h3>
                    <DescElements elements={withJsonLast(header)} />
                </div>
            )}
            {isExpanded && sharedByStreams.length > 0 && (
                <div className="xdf-description__stream">
                    <h3 className="xdf-description__stream-name">
                        All streams
                    </h3>
                    <DescElements elements={sharedByStreams} />
                </div>
            )}
            {isExpanded &&
                ownByDevice.map(({ label, streams }) => (
                    <div
                        key={label}
                        role="group"
                        aria-label={label}
                        className="xdf-description__device"
                    >
                        <h3 className="xdf-description__device-name">
                            {label}
                        </h3>
                        {streams.map(({ name, elements }) => (
                            <div key={name} className="xdf-description__stream">
                                <h4 className="xdf-description__stream-name">
                                    {name}
                                </h4>
                                <DescElements elements={elements} />
                            </div>
                        ))}
                    </div>
                ))}
        </section>
    )
}

export default XdfDescription

const DescElements: React.FC<{ elements: DescElement[] }> = ({ elements }) => (
    <dl className="xdf-description__entries">
        {elements.map(({ name, value, children }, index) => (
            <React.Fragment key={index}>
                <dt className="xdf-description__field">{name}</dt>
                <dd className="xdf-description__value">
                    {children && isTableOf(children) ? (
                        <DescTable rows={children} />
                    ) : children ? (
                        <DescElements elements={children} />
                    ) : (
                        <DescValue name={name} value={value} />
                    )}
                </dd>
            </React.Fragment>
        ))}
    </dl>
)

function isTableOf(elements: DescElement[]) {
    return elements.every(
        ({ name, children }) =>
            name === elements[0].name &&
            children?.every((child) => !child.children)
    )
}

const DescTable: React.FC<{ rows: DescElement[] }> = ({ rows }) => {
    const columns = columnsOf(rows)
    const sameColumns = columns.filter((column) => isSameInAll(rows, column))

    return (
        <table className="xdf-description__table">
            <thead>
                <tr>
                    {columns.map((column) => (
                        <th key={column} className="xdf-description__field">
                            {column}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map(({ children = [] }, index) => (
                    <tr key={index}>
                        {columns.map((column) => (
                            <td
                                key={column}
                                className={
                                    sameColumns.includes(column)
                                        ? 'xdf-description__cell--same'
                                        : undefined
                                }
                            >
                                {valueIn(children, column)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

function isSameInAll(rows: DescElement[], column: string) {
    const [first, ...others] = rows.map(({ children = [] }) =>
        valueIn(children, column)
    )

    return (
        others.length > 0 &&
        first !== undefined &&
        others.every((other) => other === first)
    )
}

function valueIn(fields: DescElement[], column: string) {
    return fields.find(({ name }) => name === column)?.value
}

function columnsOf(rows: DescElement[]) {
    const names = new Set(
        rows.flatMap(({ children = [] }) => children.map(({ name }) => name))
    )

    return [...names].toSorted(
        (first, second) => displayRankOf(first) - displayRankOf(second)
    )
}

const DescValue: React.FC<{ name: string; value?: string }> = ({
    name,
    value = '',
}) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const json = prettyJsonOf(value)

    if (json === undefined) {
        return value
    }

    return (
        <>
            <button
                type="button"
                className="xdf-description__value-toggle"
                aria-label={`${name} JSON`}
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
            >
                JSON
            </button>
            {isExpanded && (
                <span className="xdf-description__json">{json}</span>
            )}
        </>
    )
}

function prettyJsonOf(value: string) {
    try {
        const parsed: unknown = JSON.parse(value)
        return typeof parsed === 'object' && parsed !== null
            ? JSON.stringify(parsed, null, 2)
            : undefined
    } catch {
        return undefined
    }
}

function withJsonLast(elements: DescElement[]) {
    return elements.toSorted(
        (first, second) => Number(isJson(first)) - Number(isJson(second))
    )
}

function isJson(element: DescElement) {
    return prettyJsonOf(element.value ?? '') !== undefined
}

function inDisplayOrder(elements: DescElement[]): DescElement[] {
    return elements
        .map((element) =>
            element.children
                ? { ...element, children: inDisplayOrder(element.children) }
                : element
        )
        .toSorted(
            (first, second) =>
                displayRankOf(first.name) - displayRankOf(second.name)
        )
}

function displayRankOf(name: string) {
    const rank = fieldsShownFirst.indexOf(name)
    return rank === -1 ? fieldsShownFirst.length : rank
}

const fieldsShownFirst = ['label', 'type', 'unit']

function sharedFieldsOf(members: DescElement[][]) {
    const [first = [], ...others] = members

    return first.filter(
        (field) =>
            isOwnField(field) &&
            others.every((other) =>
                other.some(
                    (candidate) =>
                        isOwnField(candidate) &&
                        candidate.name === field.name &&
                        candidate.value === field.value
                )
            )
    )
}

function withoutFields(elements: DescElement[], fields: DescElement[]) {
    return elements.filter(
        (element) =>
            !isOwnField(element) ||
            !fields.some((field) => field.name === element.name)
    )
}

function isOwnField(element: DescElement) {
    return !element.children
}

interface XdfDescriptionProps {
    header?: DescElement[]
    devices: readonly DescribedDevice[]
}

interface DescribedDevice {
    label: string
    streams: readonly DescribedStream[]
}

export interface DescribedStream {
    name: string
    desc?: DescElement[]
}
