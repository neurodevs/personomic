import React, { useState } from 'react'

import { DescElement } from '../../functions/readXdfRecording'

const XdfDescription: React.FC<XdfDescriptionProps> = ({
    header = [],
    streams,
}) => {
    const [isExpanded, setIsExpanded] = useState(false)

    const described = streams
        .map(({ name, desc = [] }) => ({
            name,
            elements: withSharedFieldsHoisted(desc),
        }))
        .filter(({ elements }) => elements.length > 0)

    if (header.length === 0 && described.length === 0) {
        return null
    }

    const sharedByStreams =
        described.length > 1
            ? sharedFieldsOf(described.map(({ elements }) => elements))
            : []

    const ownByStream = described
        .map(({ name, elements }) => ({
            name,
            elements: withoutFields(elements, sharedByStreams),
        }))
        .filter(({ elements }) => elements.length > 0)

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
                <DescElements
                    elements={sharedByStreams.map((field) => ({
                        ...field,
                        sharedBy: 'streams',
                    }))}
                />
            )}
            {isExpanded &&
                ownByStream.map(({ name, elements }) => (
                    <div key={name} className="xdf-description__stream">
                        <h3 className="xdf-description__stream-name">{name}</h3>
                        <DescElements elements={elements} />
                    </div>
                ))}
        </section>
    )
}

export default XdfDescription

const DescElements: React.FC<{ elements: ShownElement[] }> = ({ elements }) => (
    <dl className="xdf-description__entries">
        {elements.map(({ name, value, children, sharedBy }, index) => (
            <React.Fragment key={index}>
                <dt className="xdf-description__field">
                    {name}
                    {sharedBy && (
                        <span className="xdf-description__scope">
                            {' '}
                            (all {sharedBy})
                        </span>
                    )}
                </dt>
                <dd className="xdf-description__value">
                    {children ? (
                        <DescElements elements={children} />
                    ) : (
                        <DescValue name={name} value={value} />
                    )}
                </dd>
            </React.Fragment>
        ))}
    </dl>
)

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

function withSharedFieldsHoisted(elements: DescElement[]): ShownElement[] {
    return inDisplayOrder(
        elements.flatMap((element) =>
            element.children
                ? hoistedFrom(element, element.children)
                : [element]
        )
    )
}

function inDisplayOrder(elements: ShownElement[]) {
    return elements.toSorted(
        (first, second) => displayRankOf(first) - displayRankOf(second)
    )
}

function displayRankOf(element: ShownElement) {
    const rank = fieldsShownFirst.indexOf(element.name)
    return rank === -1 ? fieldsShownFirst.length : rank
}

const fieldsShownFirst = ['label', 'type', 'unit']

function hoistedFrom(element: DescElement, descChildren: DescElement[]) {
    const children = withSharedFieldsHoisted(descChildren)

    const sharedByName = new Map(
        repeatedGroupsIn(children).map(([name, members]) => [
            name,
            sharedFieldsOf(members.map((member) => member.children ?? [])),
        ])
    )

    const ownChildren = children.map((child) => {
        const shared = sharedByName.get(child.name)

        return shared && child.children
            ? { ...child, children: withoutFields(child.children, shared) }
            : child
    })

    return [
        ...[...sharedByName.values()]
            .flat()
            .map((field) => ({ ...field, sharedBy: element.name })),
        { ...element, children: ownChildren },
    ]
}

function repeatedGroupsIn(elements: ShownElement[]) {
    const membersByName = new Map<string, ShownElement[]>()

    for (const element of elements) {
        membersByName.set(element.name, [
            ...(membersByName.get(element.name) ?? []),
            element,
        ])
    }

    return [...membersByName].filter(
        ([, members]) =>
            members.length > 1 && members.every((member) => member.children)
    )
}

function sharedFieldsOf(members: ShownElement[][]) {
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

function withoutFields(elements: ShownElement[], fields: ShownElement[]) {
    return elements.filter(
        (element) =>
            !isOwnField(element) ||
            !fields.some((field) => field.name === element.name)
    )
}

function isOwnField(element: ShownElement) {
    return !element.children && !element.sharedBy
}

interface ShownElement extends DescElement {
    children?: ShownElement[]
    sharedBy?: string
}

interface XdfDescriptionProps {
    header?: DescElement[]
    streams: readonly DescribedStream[]
}

export interface DescribedStream {
    name: string
    desc?: DescElement[]
}
