import React, { useId } from 'react'

export interface BiosensorsSectionProps {
    isEmpty: boolean
    emptyMessage?: string
    onEmptyClick?: () => void
    children?: React.ReactNode
}

const BiosensorsSection: React.FC<BiosensorsSectionProps> = (
    props: BiosensorsSectionProps
) => {
    const {
        isEmpty,
        emptyMessage = noneAddedMessage,
        onEmptyClick,
        children,
    } = props

    const headingId = useId()

    return (
        <section className="biosensors" aria-labelledby={headingId}>
            <h3 id={headingId} className="biosensors__heading">
                Biosensors
            </h3>
            {isEmpty &&
                (onEmptyClick ? (
                    <button
                        type="button"
                        className="biosensors__empty biosensors__empty--action"
                        onClick={onEmptyClick}
                    >
                        {emptyMessage}
                    </button>
                ) : (
                    <p className="biosensors__empty">{emptyMessage}</p>
                ))}
            {children}
        </section>
    )
}

export default BiosensorsSection

const noneAddedMessage = 'None added yet.'
