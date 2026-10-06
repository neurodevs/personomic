import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import React, { useState } from 'react'

import AddBiosensorButton from './components/AddBiosensorButton'
import StreamMonitor, {
    StreamOptions,
    WebSocketComponent,
} from './components/StreamMonitor'
import { Downsampling } from './components/StreamPlot'

const orchestratorPort = 8763

const identifierLabels: Record<string, string> = {
    'Cognionics Quick-20r': 'Serial number',
    'Govee Thermohygrometer H5074': 'UUID',
    'Muse S Athena': 'UUID',
    'Muse S Gen 2': 'UUID',
    'Muse S Gen 1': 'UUID',
    'Muse 2': 'UUID',
    'Muse 1 Gen 2': 'UUID',
    'OpenBCI Cyton': 'Serial number',
}

const orchestratorUnreachableMessage =
    'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.'

const streamOptions: Record<string, StreamOptions> = {
    PPG: { detectPeaks: { channels: ['AMBIENT', 'INFRARED'] } },
}

const sessionButtonLabels: Record<SessionState, string> = {
    unlocked: 'Connect',
    connecting: 'Connecting…',
    locked: 'Stop',
    stopping: 'Stopping…',
}

export interface AppProps {
    downsampling?: Downsampling
}

const App: React.FC<AppProps> = (props: AppProps) => {
    const { downsampling } = props

    const [deviceNames, setDeviceNames] = useState<string[]>([])
    const [identifierValues, setIdentifierValues] = useState<
        Record<string, string>
    >({})
    const [session, setSession] = useState<SessionState>('unlocked')
    const [sessionError, setSessionError] = useState<string>()

    const isLocked = session !== 'unlocked'

    const addableNames = DEVICE_NAMES.filter(
        (name) => !deviceNames.includes(name)
    )

    const addDevice = (name: string) =>
        setDeviceNames((previous) => [...previous, name])

    const removeDevice = (name: string) =>
        setDeviceNames((previous) =>
            previous.filter((shownName) => shownName !== name)
        )

    const setIdentifierValue = (name: string, value: string) =>
        setIdentifierValues((previous) => ({ ...previous, [name]: value }))

    const identifiers = Object.fromEntries(
        deviceNames
            .filter((name) => name in identifierLabels)
            .map((name) => [
                name,
                {
                    label: identifierLabels[name],
                    value: identifierValues[name] ?? '',
                },
            ])
    )

    const connectDevices = () => {
        setSession('connecting')
        setSessionError(undefined)

        sendToOrchestrator(
            {
                command: 'start',
                devices: deviceNames.map((name) => ({
                    deviceName: name,
                    identifier: identifiers[name]?.value.trim() || undefined,
                })),
            },
            {
                onReply: ({ error }) => {
                    setSessionError(error)
                    setSession('locked')
                },
                onUnreachable: () => {
                    setSessionError(orchestratorUnreachableMessage)
                    setSession('unlocked')
                },
            }
        )
    }

    const stopSession = () => {
        setSession('stopping')
        setSessionError(undefined)

        sendToOrchestrator(
            { command: 'stop' },
            {
                onReply: ({ error }) => {
                    setSessionError(error)
                    setSession(error ? 'locked' : 'unlocked')
                },
                onUnreachable: () => {
                    setSessionError(orchestratorUnreachableMessage)
                    setSession('unlocked')
                },
            }
        )
    }

    return (
        <main className="app">
            <header className="app__header">
                <span className="app__wordmark">Personomic</span>
                <span className="app__tagline">Live biosignal monitor</span>
            </header>
            <StreamMonitorComponent
                downsampling={downsampling}
                deviceStatusPort={8764}
                deviceNames={deviceNames}
                streamOptions={streamOptions}
                isConnecting={session === 'connecting'}
                identifiers={identifiers}
                onIdentifierChange={isLocked ? undefined : setIdentifierValue}
                onRemoveDevice={isLocked ? undefined : removeDevice}
            />
            {!isLocked && addableNames.length > 0 && (
                <AddBiosensorButton names={addableNames} onAdd={addDevice} />
            )}
            <div className="connect-devices">
                <button
                    type="button"
                    className="connect-devices__button"
                    disabled={
                        session === 'connecting' ||
                        session === 'stopping' ||
                        deviceNames.length === 0
                    }
                    onClick={isLocked ? stopSession : connectDevices}
                >
                    {sessionButtonLabels[session]}
                </button>
                {sessionError && (
                    <span className="connect-devices__error" role="alert">
                        {sessionError}
                    </span>
                )}
            </div>
        </main>
    )
}

export default App

type SessionState = 'unlocked' | 'connecting' | 'locked' | 'stopping'

function sendToOrchestrator(
    message: object,
    handlers: OrchestratorReplyHandlers
) {
    const { onReply, onUnreachable } = handlers

    const socket = new WebSocketComponent(`ws://localhost:${orchestratorPort}`)
    let hasReplied = false

    socket.onopen = () => socket.send(JSON.stringify(message))

    socket.onmessage = (event) => {
        hasReplied = true
        onReply(JSON.parse(event.data))
        socket.close()
    }

    socket.onclose = () => {
        if (!hasReplied) {
            onUnreachable()
        }
    }
}

interface OrchestratorReplyHandlers {
    onReply: (reply: { error?: string }) => void
    onUnreachable: () => void
}

// Test doubles

export let StreamMonitorComponent = StreamMonitor

export function setStreamMonitorComponent(component: typeof StreamMonitor) {
    StreamMonitorComponent = component
}
