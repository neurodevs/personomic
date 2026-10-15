import React, { useState } from 'react'

export const windowPickerClassName = 'stream-plot__window'
const offeredWindowSeconds = [10, 30, 60, 120, 300, Infinity]

export interface WindowPickerProps {
    seconds: number
    onChange?: (seconds: number) => void
}

const WindowPicker: React.FC<WindowPickerProps> = ({ seconds, onChange }) => {
    const [isOpen, setIsOpen] = useState(false)
    const [custom, setCustom] = useState('')

    const label = Number.isFinite(seconds)
        ? `${windowLabelFor(seconds)} window`
        : 'All data'

    if (!onChange) {
        return <>{label}</>
    }

    const choose = (chosen: number) => {
        onChange(chosen)
        setIsOpen(false)
        setCustom('')
    }

    const chooseCustom = (event: React.FormEvent) => {
        event.preventDefault()

        const chosen = windowSecondsFrom(custom)

        if (chosen !== undefined) {
            choose(chosen)
        }
    }

    const closeWhenFocusLeaves = (event: React.FocusEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsOpen(false)
        }
    }

    const closeOnEscape = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setIsOpen(false)
        }
    }

    return (
        <span
            className={windowPickerClassName}
            onBlur={closeWhenFocusLeaves}
            onKeyDown={closeOnEscape}
        >
            <button
                type="button"
                className="stream-plot__window-button"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                title="Change time window"
                onClick={() => setIsOpen((wasOpen) => !wasOpen)}
            >
                {label}
            </button>
            {isOpen && (
                <ul className="stream-plot__window-menu" role="menu">
                    {offeredWindowSeconds.map((offered) => (
                        <li key={offered} role="none">
                            <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={offered === seconds}
                                className="stream-plot__window-option"
                                onMouseDown={keepFocusInPicker}
                                onClick={() => choose(offered)}
                            >
                                {windowLabelFor(offered)}
                            </button>
                        </li>
                    ))}
                    <li role="none">
                        <form onSubmit={chooseCustom}>
                            <input
                                type="text"
                                className="stream-plot__window-custom"
                                aria-label={customWindowLabel}
                                title={customWindowLabel}
                                placeholder="Custom"
                                value={custom}
                                onChange={(event) =>
                                    setCustom(event.target.value)
                                }
                            />
                        </form>
                    </li>
                </ul>
            )}
        </span>
    )
}

export default WindowPicker

const customWindowLabel = 'Custom window, such as 90, 45s or 3m'

function keepFocusInPicker(event: React.MouseEvent) {
    event.preventDefault()
}

export function windowLabelFor(seconds: number) {
    if (!Number.isFinite(seconds)) {
        return 'All'
    }

    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60

    if (minutes === 0) {
        return `${seconds}s`
    }

    return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`
}

function windowSecondsFrom(text: string) {
    const match = /^(\d*\.?\d+)\s*(s|m)?$/i.exec(text.trim())

    if (!match) {
        return undefined
    }

    const [, amount, unit = 's'] = match
    const seconds = Math.round(
        Number(amount) * (unit.toLowerCase() === 'm' ? 60 : 1)
    )

    return seconds >= 1 ? seconds : undefined
}
