import React, { useState } from 'react'

import displayNameOf from '../../functions/displayNameOf'

const IdentifierInput: React.FC<IdentifierInputProps> = ({
    deviceLabel,
    deviceName = deviceLabel,
    identifier,
    remembered = [],
    scanned = [],
    isScanning = false,
    onChange,
    onForget,
}) => {
    const [isOpen, setIsOpen] = useState(false)
    const [copiedValue, setCopiedValue] = useState<string>()

    const isLocked = onChange === undefined
    const shownLabel = `${identifier.label} ${identifier.isRequired ? '(required)' : '(optional)'}`

    const offered = offeredFrom(scanned, remembered, deviceName)

    const change = (value: string) =>
        onChange?.(formattedFor(identifier, value))

    const choose = (value: string) => {
        change(value)
        setIsOpen(false)
    }

    const isBlank = identifier.value.trim() === ''
    const shownValue =
        isLocked && isBlank ? (identifier.reported ?? '') : identifier.value
    const placeholder =
        !isLocked && isBlank && identifier.reported
            ? identifier.reported
            : shownLabel

    const copy = async () => {
        await copyText(shownValue)
        setCopiedValue(shownValue)
    }

    const isCopied = copiedValue === shownValue

    return (
        <span className="stream-monitor__device-identifier-field">
            <input
                type="text"
                className="stream-monitor__device-identifier"
                aria-label={`${deviceLabel} ${shownLabel}`}
                placeholder={placeholder}
                title={tooltipFor(identifier)}
                value={shownValue}
                readOnly={isLocked}
                onChange={(event) => change(event.target.value)}
                onFocus={() => setIsOpen(true)}
                onClick={() => setIsOpen(true)}
                onBlur={() => setIsOpen(false)}
            />
            {shownValue.trim() !== '' && (
                <button
                    type="button"
                    className="stream-monitor__device-identifier-copy"
                    aria-label={`Copy ${deviceLabel} ${identifier.label}`}
                    title={isCopied ? 'Copied' : 'Copy'}
                    onClick={() => void copy()}
                    onMouseLeave={() => setCopiedValue(undefined)}
                >
                    {isCopied ? '✓' : '⧉'}
                </button>
            )}
            {isOpen && !isLocked && (offered.length > 0 || isScanning) && (
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
                            onMouseDown={keepInputFocused}
                            onClick={() => choose(value)}
                        >
                            <button
                                type="button"
                                role="option"
                                aria-selected={
                                    formattedFor(identifier, value) ===
                                    identifier.value
                                }
                                className="stream-monitor__device-identifier-option"
                            >
                                {formattedFor(identifier, value)}
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
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onForget(value)
                                    }}
                                >
                                    ×
                                </button>
                            )}
                        </li>
                    ))}
                    {isScanning && (
                        <li
                            role="none"
                            className="stream-monitor__device-identifier-scanning"
                        >
                            Scanning…
                        </li>
                    )}
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
            tag: `Memory · ${displayNameOf(deviceName)}`,
            isRemembered: true,
        })
    }

    return offered
}

function formattedFor(identifier: DeviceIdentifier, value: string) {
    return identifier.label === 'Address' ? formattedAddress(value) : value
}

function formattedAddress(value: string) {
    const digits = value
        .toUpperCase()
        .replace(/[^0-9A-F]/g, '')
        .slice(0, 12)

    return digits.match(/.{1,2}/g)?.join(':') ?? ''
}

function tooltipFor(identifier: DeviceIdentifier) {
    switch (identifier.label) {
        case 'UUID':
            return 'Device Bluetooth UUID'
        case 'Serial number':
            return 'Device USB serial number'
        case 'Address':
            return 'Device Bluetooth address'
        default:
            throw new Error(`Unknown identifier label: ${identifier.label}`)
    }
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
    isScanning?: boolean
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

// Test doubles

export let copyText: TextCopier = (text) => navigator.clipboard.writeText(text)

export function setCopyText(nextCopyText: TextCopier) {
    copyText = nextCopyText
}

type TextCopier = (text: string) => Promise<void>

export interface DeviceIdentifier {
    label: string
    value: string
    reported?: string
    isRequired?: boolean
}
