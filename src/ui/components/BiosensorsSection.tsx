import React, { useId } from 'react'

export interface BiosensorsSectionProps {
    isEmpty: boolean
    emptyMessage?: string
    children?: React.ReactNode
}

const BiosensorsSection: React.FC<BiosensorsSectionProps> = (
    props: BiosensorsSectionProps
) => {
    const { isEmpty, emptyMessage = noneAddedMessage, children } = props

    const headingId = useId()

    return (
        <section className="biosensors" aria-labelledby={headingId}>
            <h3 id={headingId} className="biosensors__heading">
                Biosensors
            </h3>
            {isEmpty && <p className="biosensors__empty">{emptyMessage}</p>}
            {children}
        </section>
    )
}

export default BiosensorsSection

const noneAddedMessage = 'None added yet.'
