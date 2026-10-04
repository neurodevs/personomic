import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import React, { useState } from 'react'

import AddBiosensorButton from './components/AddBiosensorButton'
import StreamMonitor, {
    StreamOptions,
    WebSocketComponent,
} from './components/StreamMonitor'
import { Downsampling } from './components/StreamPlot'

export interface AppProps {
    downsampling?: Downsampling
}

const App: React.FC<AppProps> = (props: AppProps) => {
    const { downsampling } = props

    const [deviceNames, setDeviceNames] = useState<string[]>(['Muse S Gen 2'])
    const [uuids, setUuids] = useState<Record<string, string>>({})
    const [isConnecting, setIsConnecting] = useState(false)
    const [connectError, setConnectError] = useState<string>()

    const addableNames = DEVICE_NAMES.filter(
        (name) => !deviceNames.includes(name)
    )

    const addDevice = (name: string) =>
        setDeviceNames((previous) => [...previous, name])

    const removeDevice = (name: string) =>
        setDeviceNames((previous) =>
            previous.filter((shownName) => shownName !== name)
        )

    const setUuid = (name: string, uuid: string) =>
        setUuids((previous) => ({ ...previous, [name]: uuid }))

    const connectDevices = () => {
        const socket = new WebSocketComponent(
            `ws://localhost:${orchestratorPort}`
        )
        let hasReplied = false

        setIsConnecting(true)
        setConnectError(undefined)

        socket.onopen = () =>
            socket.send(
                JSON.stringify({
                    command: 'start',
                    devices: deviceNames.map((name) => ({
                        deviceName: name,
                        uuid: uuids[name]?.trim() || undefined,
                    })),
                })
            )

        socket.onmessage = (event) => {
            hasReplied = true
            setConnectError(JSON.parse(event.data).error)
            setIsConnecting(false)
            socket.close()
        }

        socket.onclose = () => {
            if (!hasReplied) {
                setConnectError(orchestratorUnreachableMessage)
                setIsConnecting(false)
            }
        }
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
                isConnecting={isConnecting}
                uuids={uuids}
                onUuidChange={setUuid}
                onRemoveDevice={removeDevice}
            />
            {addableNames.length > 0 && (
                <AddBiosensorButton names={addableNames} onAdd={addDevice} />
            )}
            <div className="connect-devices">
                <button
                    type="button"
                    className="connect-devices__button"
                    disabled={isConnecting || deviceNames.length === 0}
                    onClick={connectDevices}
                >
                    {isConnecting ? 'Connecting…' : 'Connect'}
                </button>
                {connectError && (
                    <span className="connect-devices__error" role="alert">
                        {connectError}
                    </span>
                )}
            </div>
        </main>
    )
}

export default App

const orchestratorPort = 8763

const orchestratorUnreachableMessage =
    'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.'

const streamOptions: Record<string, StreamOptions> = {
    PPG: { detectPeaks: { channels: ['AMBIENT', 'INFRARED'] } },
}

// Test doubles

export let StreamMonitorComponent = StreamMonitor

export function setStreamMonitorComponent(component: typeof StreamMonitor) {
    StreamMonitorComponent = component
}
