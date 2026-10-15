import React, { useState } from 'react'

const IdentifierInput: React.FC<IdentifierInputProps> = ({
    deviceLabel,
    identifier,
    remembered = [],
    onChange,
    onForget,
}) => {
    const [isOpen, setIsOpen] = useState(false)

    const isLocked = onChange === undefined

    const choose = (value: string) => {
        onChange?.(value)
        setIsOpen(false)
    }

    return (
        <span className="stream-monitor__device-identifier-field">
            <input
                type="text"
                className="stream-monitor__device-identifier"
                aria-label={`${deviceLabel} ${identifier.label} (optional)`}
                placeholder={`${identifier.label} (optional)`}
                value={identifier.value}
                readOnly={isLocked}
                onChange={(event) => onChange?.(event.target.value)}
                onFocus={() => setIsOpen(true)}
                onClick={() => setIsOpen(true)}
                onBlur={() => setIsOpen(false)}
            />
            {isOpen && !isLocked && remembered.length > 0 && (
                <ul
                    className="stream-monitor__device-identifier-menu"
                    role="listbox"
                    aria-label={`Previous ${deviceLabel} ${identifier.label} values`}
                >
                    {remembered.map((value) => (
                        <li
                            key={value}
                            role="none"
                            className="stream-monitor__device-identifier-row"
                        >
                            <button
                                type="button"
                                role="option"
                                aria-selected={value === identifier.value}
                                className="stream-monitor__device-identifier-option"
                                onMouseDown={keepInputFocused}
                                onClick={() => choose(value)}
                            >
                                {value}
                            </button>
                            {onForget && (
                                <button
                                    type="button"
                                    className="stream-monitor__device-identifier-forget"
                                    aria-label={`Forget ${value}`}
                                    title={`Forget ${value}`}
                                    onMouseDown={keepInputFocused}
                                    onClick={() => onForget(value)}
                                >
                                    ×
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </span>
    )
}

export default IdentifierInput

function keepInputFocused(event: React.MouseEvent) {
    event.preventDefault()
}

interface IdentifierInputProps {
    deviceLabel: string
    identifier: DeviceIdentifier
    remembered?: readonly string[]
    onChange?: (value: string) => void
    onForget?: (value: string) => void
}

export interface DeviceIdentifier {
    label: string
    value: string
}
