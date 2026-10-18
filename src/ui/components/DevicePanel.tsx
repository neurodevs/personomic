import React, { useEffect, useRef, useState } from 'react'

import type { BiosignalDevice, DeviceStatus } from './StreamMonitor'
import IdentifierInput, { DeviceIdentifier } from './IdentifierInput'
import XdfDescription from './XdfDescription'

const DevicePanel: React.FC<DevicePanelProps> = ({
    device,
    status,
    hasRunOut = false,
    onRemove,
    identifier,
    rememberedIdentifiers,
    onForgetIdentifier,
    onIdentifierChange,
    nickname = '',
    onNicknameChange,
    isDescribed = false,
    children,
}) => {
    const hasStreams = device.streams.length > 0

    const isLocked = onIdentifierChange === undefined

    const isIdentifierShown =
        identifier !== undefined &&
        (isLocked ? identifier.value.trim() !== '' : status === 'disconnected')

    const isNicknameShown =
        onNicknameChange === undefined
            ? nickname.trim() !== ''
            : status === 'disconnected'

    const [arePlotsHidden, setArePlotsHidden] = useState(false)
    const wereHiddenByRunningOut = useRef(false)

    useEffect(() => {
        if (hasRunOut) {
            setArePlotsHidden(true)
            wereHiddenByRunningOut.current = true
        } else if (wereHiddenByRunningOut.current) {
            setArePlotsHidden(false)
            wereHiddenByRunningOut.current = false
        }
    }, [hasRunOut])

    const togglePlotsUnlessClickedOnContents = (event: React.MouseEvent) => {
        const clicked = event.target as Element

        if (!clicked.closest(`input, button, .${deviceStreamsClassName}`)) {
            wereHiddenByRunningOut.current = false
            setArePlotsHidden((wereHidden) => !wereHidden)
        }
    }

    return (
        <section
            className={`stream-monitor__device stream-monitor__device--${status}`}
            data-testid={`device-${device.key}`}
            onClick={togglePlotsUnlessClickedOnContents}
        >
            <header className="stream-monitor__device-header">
                <DeviceStatusIndicator status={status} />
                <span className="stream-monitor__device-name">
                    {device.label}
                </span>
                {isNicknameShown && (
                    <NicknameInput
                        deviceLabel={device.label}
                        nickname={nickname}
                        onChange={
                            onNicknameChange &&
                            ((value) => onNicknameChange(device.key, value))
                        }
                    />
                )}
                {identifier && isIdentifierShown && (
                    <IdentifierInput
                        deviceLabel={device.label}
                        identifier={identifier}
                        remembered={rememberedIdentifiers}
                        onChange={
                            onIdentifierChange &&
                            ((value) => onIdentifierChange(device.key, value))
                        }
                        onForget={
                            onForgetIdentifier &&
                            ((value) => onForgetIdentifier(device.name, value))
                        }
                    />
                )}
                {hasStreams && (
                    <span className="stream-monitor__device-meta">
                        {device.streams.length} streams
                    </span>
                )}
                {onRemove && (
                    <button
                        type="button"
                        className="stream-monitor__device-remove"
                        aria-label={`Remove ${device.label}`}
                        title={`Remove ${device.label}`}
                        onClick={() => onRemove(device.key)}
                    >
                        ×
                    </button>
                )}
            </header>
            {hasStreams && !arePlotsHidden && (
                <div className={deviceStreamsClassName}>
                    {isDescribed && (
                        <XdfDescription streams={device.describedStreams} />
                    )}
                    {children}
                </div>
            )}
        </section>
    )
}

export default DevicePanel

const deviceStreamsClassName = 'stream-monitor__device-streams'

export interface DevicePanelProps {
    device: BiosignalDevice
    status: DeviceStatus
    hasRunOut?: boolean
    onRemove?: (name: string) => void
    identifier?: DeviceIdentifier
    rememberedIdentifiers?: readonly string[]
    onForgetIdentifier?: (name: string, identifier: string) => void
    onIdentifierChange?: (name: string, value: string) => void
    nickname?: string
    onNicknameChange?: (name: string, value: string) => void
    isDescribed?: boolean
    children?: React.ReactNode
}

const NicknameInput: React.FC<NicknameInputProps> = ({
    deviceLabel,
    nickname,
    onChange,
}) => (
    <input
        type="text"
        className="stream-monitor__device-nickname"
        aria-label={`${deviceLabel} nickname`}
        placeholder="Nickname (optional)"
        value={nickname}
        readOnly={onChange === undefined}
        onChange={(event) => onChange?.(event.target.value)}
    />
)

interface NicknameInputProps {
    deviceLabel: string
    nickname: string
    onChange?: (value: string) => void
}

const DeviceStatusIndicator: React.FC<{ status: DeviceStatus }> = ({
    status,
}) => (
    <span
        className={`stream-monitor__device-status stream-monitor__device-status--${status}`}
        aria-label={status}
        title={status}
    />
)
