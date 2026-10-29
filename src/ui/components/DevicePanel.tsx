import React, { useEffect, useRef, useState } from 'react'

import { anyMuseName } from '../hooks/useBiosensorChoices'
import type { BiosignalDevice, DeviceStatus } from './StreamMonitor'
import IdentifierInput, {
    DeviceIdentifier,
    ScannedIdentifier,
} from './IdentifierInput'
import { DescElement } from '../../functions/readXdfRecording'
import XdfDescription from './XdfDescription'

const DevicePanel: React.FC<DevicePanelProps> = ({
    device,
    status,
    isStatusShown = true,
    hasRunOut = false,
    onRemove,
    identifier,
    rememberedIdentifiers,
    scannedIdentifiers,
    isScanning = false,
    onForgetIdentifier,
    onIdentifierChange,
    nickname = '',
    onNicknameChange,
    disabledStreams = [],
    onDisabledStreamsChange,
    isDescribed = false,
    xdfHeader,
    children,
}) => {
    const hasStreams = device.streams.length > 0

    const streamToggles = streamTogglesOf(device.name)
    const isSettingsOffered =
        onDisabledStreamsChange !== undefined && streamToggles.length > 0

    const [areSettingsOpen, setAreSettingsOpen] = useState(false)

    const isLocked = onIdentifierChange === undefined

    const isIdentifierShown =
        identifier !== undefined &&
        (isLocked
            ? (identifier.value || identifier.reported || '').trim() !== ''
            : status === 'disconnected')

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

        if (
            !clicked.closest(
                `input, button, .${deviceStreamsClassName}, .${deviceSettingsClassName}`
            )
        ) {
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
                {isStatusShown && <DeviceStatusIndicator status={status} />}
                <span
                    className="stream-monitor__device-name"
                    title={device.label}
                >
                    {device.label}
                </span>
                {status === 'reconnecting' && (
                    <span className="stream-monitor__device-alert">
                        Signal lost. Reconnecting…
                    </span>
                )}
                {status === 'resuming' && (
                    <span className="stream-monitor__device-alert">
                        Reconnected. Starting streaming…
                    </span>
                )}
                {isNicknameShown && (
                    <NicknameInput
                        deviceLabel={device.label}
                        nickname={nickname}
                        isRecommended={identifier?.isRequired ?? false}
                        onChange={
                            onNicknameChange &&
                            ((value) => onNicknameChange(device.key, value))
                        }
                    />
                )}
                {isNicknameShown && !(identifier && isIdentifierShown) && (
                    <span
                        className="stream-monitor__device-identifier-spacer"
                        aria-hidden="true"
                    />
                )}
                {identifier && isIdentifierShown && (
                    <IdentifierInput
                        deviceLabel={device.label}
                        deviceName={device.name}
                        identifier={identifier}
                        remembered={rememberedIdentifiers}
                        scanned={scannedIdentifiers}
                        isScanning={isScanning}
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
                {isSettingsOffered && (
                    <button
                        type="button"
                        className="stream-monitor__device-settings-button"
                        aria-label={`${device.label} settings`}
                        aria-expanded={areSettingsOpen}
                        title="Settings"
                        onClick={() =>
                            setAreSettingsOpen((wasOpen) => !wasOpen)
                        }
                    >
                        <SettingsIcon />
                    </button>
                )}
                {onRemove && (
                    <button
                        type="button"
                        className="stream-monitor__device-remove"
                        aria-label={`Remove ${device.label}`}
                        title={`Remove ${device.label}`}
                        onClick={() => onRemove(device.key)}
                    >
                        <RemoveIcon />
                    </button>
                )}
            </header>
            {isSettingsOffered && areSettingsOpen && (
                <StreamSettings
                    deviceLabel={device.label}
                    toggles={streamToggles}
                    disabledStreams={disabledStreams}
                    onChange={(streams) =>
                        onDisabledStreamsChange?.(device.key, streams)
                    }
                />
            )}
            {hasStreams && (isDescribed || !arePlotsHidden) && (
                <div className={deviceStreamsClassName}>
                    {isDescribed && (
                        <XdfDescription
                            header={xdfHeader}
                            streams={device.describedStreams}
                        />
                    )}
                    {!arePlotsHidden && children}
                </div>
            )}
        </section>
    )
}

export default DevicePanel

const deviceStreamsClassName = 'stream-monitor__device-streams'
const deviceSettingsClassName = 'stream-monitor__device-settings'

const museStreamToggles = togglesOf('EEG', 'PPG', 'Gyroscope', 'Accelerometer')

const streamTogglesByDevice: Record<string, StreamToggle[]> = {
    'Cognionics Quick-20r': togglesOf('EEG', 'Accelerometer'),
    'Govee Thermohygrometer H5074': togglesOf(
        'Temperature',
        'Humidity',
        'Battery'
    ),
    'Muse S Athena': [
        ...togglesOf('EEG', 'PPG'),
        coupledToggleOf('Accelerometer', 'Gyroscope'),
    ],
    'Muse S Gen 2': museStreamToggles,
    'Muse S Gen 1': museStreamToggles,
    'Muse 2': museStreamToggles,
    'Muse 1 Gen 2': museStreamToggles,
    'OpenBCI Cyton': togglesOf('ExG', 'Accelerometer'),
}

function streamTogglesOf(deviceName: string) {
    return deviceName === anyMuseName
        ? museStreamToggles
        : (streamTogglesByDevice[deviceName] ?? [])
}

function coupledToggleOf(...streams: string[]): StreamToggle {
    return { label: streams.join(' + '), streams }
}

function togglesOf(...streams: string[]): StreamToggle[] {
    return streams.map((stream) => ({ label: stream, streams: [stream] }))
}

interface StreamToggle {
    label: string
    streams: string[]
}

export interface DevicePanelProps {
    device: BiosignalDevice
    status: DeviceStatus
    isStatusShown?: boolean
    hasRunOut?: boolean
    onRemove?: (name: string) => void
    identifier?: DeviceIdentifier
    rememberedIdentifiers?: readonly string[]
    scannedIdentifiers?: readonly ScannedIdentifier[]
    isScanning?: boolean
    onForgetIdentifier?: (name: string, identifier: string) => void
    onIdentifierChange?: (name: string, value: string) => void
    nickname?: string
    onNicknameChange?: (name: string, value: string) => void
    disabledStreams?: readonly string[]
    onDisabledStreamsChange?: (name: string, streams: string[]) => void
    isDescribed?: boolean
    xdfHeader?: DescElement[]
    children?: React.ReactNode
}

const StreamSettings: React.FC<StreamSettingsProps> = ({
    deviceLabel,
    toggles,
    disabledStreams,
    onChange,
}) => {
    const isOff = (toggle: StreamToggle) =>
        toggle.streams.some((stream) => disabledStreams.includes(stream))

    const numOn = toggles.filter((toggle) => !isOff(toggle)).length

    const turn = (changed: StreamToggle, isOn: boolean) =>
        onChange(
            toggles.flatMap((toggle) =>
                (toggle === changed ? !isOn : isOff(toggle))
                    ? toggle.streams
                    : []
            )
        )

    return (
        <fieldset className={deviceSettingsClassName}>
            <legend>Streams</legend>
            {toggles.map((toggle) => (
                <label
                    key={toggle.label}
                    className="stream-monitor__device-stream-toggle"
                >
                    <input
                        type="checkbox"
                        aria-label={`${deviceLabel} ${toggle.label}`}
                        checked={!isOff(toggle)}
                        disabled={!isOff(toggle) && numOn === 1}
                        onChange={(event) => turn(toggle, event.target.checked)}
                    />
                    {toggle.label}
                </label>
            ))}
        </fieldset>
    )
}

interface StreamSettingsProps {
    deviceLabel: string
    toggles: StreamToggle[]
    disabledStreams: readonly string[]
    onChange: (streams: string[]) => void
}

const SettingsIcon: React.FC = () => (
    <HeaderIcon size={14}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </HeaderIcon>
)

const RemoveIcon: React.FC = () => (
    <HeaderIcon size={15}>
        <path d="M6 6l12 12M18 6L6 18" />
    </HeaderIcon>
)

const HeaderIcon: React.FC<{ size: number; children: React.ReactNode }> = ({
    size,
    children,
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {children}
    </svg>
)

const NicknameInput: React.FC<NicknameInputProps> = ({
    deviceLabel,
    nickname,
    isRecommended,
    onChange,
}) => (
    <input
        type="text"
        className="stream-monitor__device-nickname"
        aria-label={`${deviceLabel} nickname`}
        title="Device nickname"
        placeholder={
            isRecommended ? 'Nickname (recommended)' : 'Nickname (optional)'
        }
        value={nickname}
        readOnly={onChange === undefined}
        onChange={(event) => onChange?.(event.target.value)}
    />
)

interface NicknameInputProps {
    deviceLabel: string
    nickname: string
    isRecommended: boolean
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
