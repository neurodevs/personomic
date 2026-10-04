import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import React, { useState } from 'react'

import AddBiosensorButton from './components/AddBiosensorButton'
import StreamMonitor, { StreamOptions } from './components/StreamMonitor'
import { Downsampling } from './components/StreamPlot'

export interface AppProps {
    downsampling?: Downsampling
}

const App: React.FC<AppProps> = (props: AppProps) => {
    const { downsampling } = props

    const [deviceNames, setDeviceNames] = useState<string[]>(['Muse S Gen 2'])

    const addableNames = DEVICE_NAMES.filter(
        (name) => !deviceNames.includes(name)
    )

    const addDevice = (name: string) =>
        setDeviceNames((previous) => [...previous, name])

    const removeDevice = (name: string) =>
        setDeviceNames((previous) =>
            previous.filter((shownName) => shownName !== name)
        )

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
                onRemoveDevice={removeDevice}
            />
            {addableNames.length > 0 && (
                <AddBiosensorButton names={addableNames} onAdd={addDevice} />
            )}
        </main>
    )
}

export default App

const streamOptions: Record<string, StreamOptions> = {
    PPG: { detectPeaks: { channels: ['AMBIENT', 'INFRARED'] } },
}

// Test doubles

export let StreamMonitorComponent = StreamMonitor

export function setStreamMonitorComponent(component: typeof StreamMonitor) {
    StreamMonitorComponent = component
}
