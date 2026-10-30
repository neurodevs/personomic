import { useEffect, useState } from 'react'

import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'

import familyOf from '../../functions/familyOf'
import sendToOrchestrator from '../../functions/sendToOrchestrator'
import { ScannedIdentifier } from '../components/IdentifierInput'
import { deviceKeysFor } from '../components/StreamMonitor'

export const anyMuseName = 'Muse (auto-detect, slower)'

export const biosensorNames = [...DEVICE_NAMES, anyMuseName]

const requestedNames: Record<string, string> = {
    [anyMuseName]: 'Muse',
}

export const identifierLabels: Record<string, string> = {
    'Cognionics Quick-20r': 'Serial number',
    'Govee Thermohygrometer H5074': 'UUID',
    [anyMuseName]: 'UUID',
    'Muse S Athena': 'UUID',
    'Muse S Gen 2': 'UUID',
    'Muse S Gen 1': 'UUID',
    'Muse 2': 'UUID',
    'Muse 1 Gen 2': 'UUID',
    'OpenBCI Cyton': 'Serial number',
    'Zephyr BioHarness 3': 'Address',
}

const rememberedIdentifiersStorageKey = 'personomic.rememberedIdentifiers'

export default function useBiosensorChoices(options: BiosensorChoicesOptions) {
    const { devices, changeDevices, isLocked } = options

    const [rememberedIdentifiers, setRememberedIdentifiers] = useState(
        readRememberedIdentifiers
    )
    const [scanned, setScanned] = useState<ScannedIdentifiers>({})

    const deviceNames = devices.map(({ name }) => name)
    const deviceKeys = deviceKeysFor(deviceNames)

    const addableNames = biosensorNames.filter(
        (name) => name in identifierLabels || !deviceNames.includes(name)
    )

    const addDevice = (name: string) =>
        changeDevices((previous) => [
            ...previous,
            { name, identifier: '', nickname: '', disabledStreams: [] },
        ])

    const removeDevice = (key: string) =>
        changeDevices((previous) =>
            previous.filter((_, index) => index !== deviceKeys.indexOf(key))
        )

    const setIdentifierValue = (key: string, value: string) =>
        changeDevices((previous) =>
            previous.map((device, index) =>
                index === deviceKeys.indexOf(key)
                    ? { ...device, identifier: value }
                    : device
            )
        )

    const setNickname = (key: string, nickname: string) =>
        changeDevices((previous) =>
            previous.map((device, index) =>
                index === deviceKeys.indexOf(key)
                    ? { ...device, nickname }
                    : device
            )
        )

    const setDisabledStreams = (key: string, disabledStreams: string[]) =>
        changeDevices((previous) =>
            previous.map((device, index) =>
                index === deviceKeys.indexOf(key)
                    ? { ...device, disabledStreams }
                    : device
            )
        )

    const disabledStreams = Object.fromEntries(
        devices.map(({ disabledStreams }, index) => [
            deviceKeys[index],
            disabledStreams,
        ])
    )

    const nicknames = Object.fromEntries(
        devices.map(({ nickname }, index) => [deviceKeys[index], nickname])
    )

    const identifiers = Object.fromEntries(
        devices
            .map(({ name, identifier }, index) => [
                deviceKeys[index],
                {
                    label: identifierLabels[name],
                    value: identifier,
                    isRequired: isFamilyRepeatedIn(deviceNames, name),
                },
            ])
            .filter((_, index) => deviceNames[index] in identifierLabels)
    )

    const namesMissingIdentifier = [
        ...new Set(
            devices
                .filter(
                    ({ name, identifier }) =>
                        name in identifierLabels && identifier.trim() === ''
                )
                .map(({ name }) => name)
        ),
    ]
    const namesToScan = [
        ...new Set(namesMissingIdentifier.map(requestedNameOf)),
    ]
    const namesToScanKey = namesToScan.join('\n')
    const scanningDeviceNames = isLocked ? [] : namesMissingIdentifier

    useEffect(() => {
        if (isLocked || namesToScan.length === 0) {
            return undefined
        }

        return startScanningForIdentifiers(namesToScan, setScanned)
    }, [isLocked, namesToScanKey])

    const scannedIdentifiers = Object.fromEntries(
        scanningDeviceNames
            .map((name) => [name, scanned[requestedNameOf(name)]] as const)
            .filter(([, ofName]) => ofName !== undefined)
    )

    const deviceRequests = devices.map(
        ({ name, nickname, disabledStreams }, index) => ({
            deviceName: name,
            identifier:
                identifiers[deviceKeys[index]]?.value.trim() || undefined,
            nickname: nickname.trim() || undefined,
            disableStreams: disableStreamsOf(disabledStreams),
        })
    )

    const saveRememberedIdentifiers = (remembered: RememberedIdentifiers) => {
        setRememberedIdentifiers(remembered)
        localStorage.setItem(
            rememberedIdentifiersStorageKey,
            JSON.stringify(remembered)
        )
    }

    const rememberIdentifiersOf = (requests: DeviceRequest[]) =>
        saveRememberedIdentifiers(
            withIdentifiersOf(requests, rememberedIdentifiers)
        )

    const forgetIdentifier = (name: string, identifier: string) =>
        saveRememberedIdentifiers(
            withoutIdentifier(name, identifier, rememberedIdentifiers)
        )

    return {
        deviceNames,
        deviceKeys,
        addableNames,
        addDevice,
        removeDevice,
        setIdentifierValue,
        setNickname,
        nicknames,
        setDisabledStreams,
        disabledStreams,
        identifiers,
        scanningDeviceNames,
        scannedIdentifiers,
        deviceRequests,
        rememberedIdentifiers,
        rememberIdentifiersOf,
        forgetIdentifier,
    }
}

function isFamilyRepeatedIn(deviceNames: string[], name: string) {
    const family = familyOf(name)

    return deviceNames.filter((other) => familyOf(other) === family).length > 1
}

export function disableStreamsOf(disabledStreams: readonly string[]) {
    return disabledStreams.length > 0 ? [...disabledStreams] : undefined
}

export function requestedFrom(request: DeviceRequest): DeviceRequest {
    const { deviceName } = request
    return { ...request, deviceName: requestedNameOf(deviceName) }
}

function requestedNameOf(name: string) {
    return requestedNames[name] ?? name
}

export function selectedNameOf(deviceName: string) {
    const selectedNames = Object.keys(requestedNames)

    return (
        selectedNames.find((name) => requestedNames[name] === deviceName) ??
        deviceName
    )
}

export function selectedFrom(requests: DeviceRequest[]): SelectedDevice[] {
    return requests.map(
        ({
            deviceName,
            identifier = '',
            nickname = '',
            disableStreams = [],
        }) => ({
            name: deviceName,
            identifier,
            nickname,
            disabledStreams: disableStreams,
        })
    )
}

function readRememberedIdentifiers(): RememberedIdentifiers {
    try {
        return JSON.parse(
            localStorage.getItem(rememberedIdentifiersStorageKey) ?? '{}'
        )
    } catch {
        return {}
    }
}

function withIdentifiersOf(
    requests: DeviceRequest[],
    remembered: RememberedIdentifiers
) {
    const next = { ...remembered }

    for (const { deviceName, identifier } of requests) {
        if (identifier) {
            const others = (next[deviceName] ?? []).filter(
                (other) => other !== identifier
            )
            next[deviceName] = [identifier, ...others]
        }
    }

    return next
}

function withoutIdentifier(
    name: string,
    identifier: string,
    remembered: RememberedIdentifiers
) {
    const { [name]: ofDevice = [], ...ofOtherDevices } = remembered
    const kept = ofDevice.filter((other) => other !== identifier)

    return kept.length > 0
        ? { ...ofOtherDevices, [name]: kept }
        : ofOtherDevices
}

const scanIntervalMs = 3000

export function scanThroughOrchestrator(
    deviceNames: string[],
    onScanned: (scanned: ScannedIdentifiers) => void
) {
    let isStopped = false
    let cancelWait = () => {}

    const scanAgainSoon = () => {
        if (!isStopped) {
            cancelWait = scanAgainAfter(scan, scanIntervalMs)
        }
    }

    const scan = () =>
        sendToOrchestrator<{ scanned?: ScannedIdentifiers }>(
            { command: 'scan', deviceNames },
            {
                onReply: ({ scanned = {} }) => {
                    if (!isStopped) {
                        onScanned(scanned)
                    }
                    scanAgainSoon()
                },
                onUnreachable: () => {
                    if (!isStopped) {
                        onScanned({})
                    }
                    scanAgainSoon()
                },
            }
        )

    scan()

    return () => {
        isStopped = true
        cancelWait()
    }
}

export interface BiosensorChoicesOptions {
    devices: SelectedDevice[]
    changeDevices: (
        change: (previous: SelectedDevice[]) => SelectedDevice[]
    ) => void
    isLocked: boolean
}

export interface SelectedDevice {
    name: string
    identifier: string
    nickname: string
    disabledStreams: string[]
}

export interface DeviceRequest {
    deviceName: string
    identifier?: string
    nickname?: string
    disableStreams?: string[]
}

type RememberedIdentifiers = Record<string, string[]>

type ScannedIdentifiers = Record<string, ScannedIdentifier[]>

type IdentifierScanner = (
    deviceNames: string[],
    onScanned: (scanned: ScannedIdentifiers) => void
) => () => void

// Test doubles

export let startScanningForIdentifiers: IdentifierScanner =
    scanThroughOrchestrator

export function setIdentifierScanner(scanner: IdentifierScanner) {
    startScanningForIdentifiers = scanner
}

export let scanAgainAfter = (callback: () => void, ms: number) => {
    const id = setTimeout(callback, ms)
    return () => clearTimeout(id)
}

export function setScanAgainAfter(nextScanAgainAfter: typeof scanAgainAfter) {
    scanAgainAfter = nextScanAgainAfter
}
