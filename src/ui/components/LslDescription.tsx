import React, { useState } from 'react'

import { DescElement } from '../../functions/readXdfRecording'

const LslDescription: React.FC<LslDescriptionProps> = ({ streams }) => {
    const [isExpanded, setIsExpanded] = useState(false)

    const described = streams
        .map(({ name, desc = [] }) => ({
            name,
            elements: withSharedFieldsHoisted(desc),
        }))
        .filter(({ elements }) => elements.length > 0)

    if (described.length === 0) {
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
        <section className="lsl-description">
            <button
                type="button"
                className="lsl-description__toggle"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
            >
                LSL description
            </button>
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
                    <div key={name} className="lsl-description__stream">
                        <h3 className="lsl-description__stream-name">{name}</h3>
                        <DescElements elements={elements} />
                    </div>
                ))}
        </section>
    )
}

export default LslDescription

const DescElements: React.FC<{ elements: ShownElement[] }> = ({ elements }) => (
    <dl className="lsl-description__entries">
        {elements.map(({ name, value, children, sharedBy }, index) => (
            <React.Fragment key={index}>
                <dt className="lsl-description__field">
                    {name}
                    {sharedBy && (
                        <span className="lsl-description__scope">
                            {' '}
                            (all {sharedBy})
                        </span>
                    )}
                </dt>
                <dd className="lsl-description__value">
                    {children ? <DescElements elements={children} /> : value}
                </dd>
            </React.Fragment>
        ))}
    </dl>
)

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

interface LslDescriptionProps {
    streams: readonly DescribedStream[]
}

export interface DescribedStream {
    name: string
    desc?: DescElement[]
}
