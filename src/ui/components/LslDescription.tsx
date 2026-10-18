import React, { useState } from 'react'

import { DescElement } from '../../functions/readXdfRecording'

const LslDescription: React.FC<LslDescriptionProps> = ({ streams }) => {
    const [isExpanded, setIsExpanded] = useState(false)

    const described = streams.filter(({ desc = [] }) => desc.length > 0)

    if (described.length === 0) {
        return null
    }

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
            {isExpanded &&
                described.map(({ name, desc = [] }) => (
                    <div key={name} className="lsl-description__stream">
                        <h3 className="lsl-description__stream-name">{name}</h3>
                        <DescElements elements={desc} />
                    </div>
                ))}
        </section>
    )
}

export default LslDescription

const DescElements: React.FC<{ elements: DescElement[] }> = ({ elements }) => (
    <dl className="lsl-description__entries">
        {elements.map(({ name, value, children }, index) => (
            <React.Fragment key={index}>
                <dt className="lsl-description__field">{name}</dt>
                <dd className="lsl-description__value">
                    {children ? <DescElements elements={children} /> : value}
                </dd>
            </React.Fragment>
        ))}
    </dl>
)

interface LslDescriptionProps {
    streams: readonly DescribedStream[]
}

export interface DescribedStream {
    name: string
    desc?: DescElement[]
}
