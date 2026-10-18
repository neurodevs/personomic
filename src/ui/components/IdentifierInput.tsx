import React, { useState } from 'react'

const IdentifierInput: React.FC<IdentifierInputProps> = ({
    deviceLabel,
    deviceName = deviceLabel,
    identifier,
    remembered = [],
    scanned = [],
    onChange,
    onForget,
}) => {
    const [isOpen, setIsOpen] = useState(false)

    const isLocked = onChange === undefined

    const offered = offeredFrom(scanned, remembered, deviceName)

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
            {isOpen && !isLocked && offered.length > 0 && (
                <ul
                    className="stream-monitor__device-identifier-menu"
                    role="listbox"
                    aria-label={`Previous ${deviceLabel} ${identifier.label} values`}
                >
                    {offered.map(({ value, tag, isRemembered }) => (
                        <li
                            key={`${tag}/${value}`}
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
                            <span className="stream-monitor__device-identifier-source">
                                {tag}
                            </span>
                            {onForget && isRemembered && (
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

function offeredFrom(
    scanned: readonly ScannedIdentifier[],
    remembered: readonly string[],
    deviceName: string
): OfferedIdentifier[] {
    const offered: OfferedIdentifier[] = []

    for (const { value, source } of scanned) {
        if (!offered.some((other) => other.value === value)) {
            offered.push({
                value,
                tag: `Scanned · ${source}`,
                isRemembered: false,
            })
        }
    }

    for (const value of remembered) {
        offered.push({
            value,
            tag: `Memory · ${deviceName}`,
            isRemembered: true,
        })
    }

    return offered
}

function keepInputFocused(event: React.MouseEvent) {
    event.preventDefault()
}

interface IdentifierInputProps {
    deviceLabel: string
    deviceName?: string
    identifier: DeviceIdentifier
    remembered?: readonly string[]
    scanned?: readonly ScannedIdentifier[]
    onChange?: (value: string) => void
    onForget?: (value: string) => void
}

interface OfferedIdentifier {
    value: string
    tag: string
    isRemembered: boolean
}

export interface ScannedIdentifier {
    value: string
    source: string
}

export interface DeviceIdentifier {
    label: string
    value: string
}
