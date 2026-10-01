import { DEVICE_NAMES } from '@neurodevs/node-biosensors/build/types.js'
import React, { useState } from 'react'

import AddBiosensorButton from './components/AddBiosensorButton'
import StreamMonitor, { BiosignalDevice } from './components/StreamMonitor'
import { Downsampling } from './components/StreamPlot'

export interface AppProps {
    downsampling?: Downsampling
}

const App: React.FC<AppProps> = (props: AppProps) => {
    const { downsampling } = props

    const [devices, setDevices] = useState<BiosignalDevice[]>([museDevice])

    const shownNames = devices.map((device) => device.name)
    const addableNames = DEVICE_NAMES.filter(
        (name) => !shownNames.includes(name)
    )

    const addDevice = (name: string) =>
        setDevices((previous) => [...previous, { name, streams: [] }])

    return (
        <main className="app">
            <header className="app__header">
                <span className="app__wordmark">Personomic</span>
                <span className="app__tagline">Live biosignal monitor</span>
            </header>
            <StreamMonitorComponent
                downsampling={downsampling}
                deviceStatusPort={8764}
                devices={devices}
            />
            {addableNames.length > 0 && (
                <AddBiosensorButton names={addableNames} onAdd={addDevice} />
            )}
        </main>
    )
}

export default App

const museDevice: BiosignalDevice = {
    name: 'Muse S Gen 2',
    streams: [
        {
            name: 'EEG',
            wssPort: 8765,
            channelNames: ['TP10', 'AF8', 'TP9', 'AF7', 'AUX'],
        },
        {
            name: 'PPG',
            wssPort: 8766,
            channelNames: ['AMBIENT', 'INFRARED', 'RED'],
            detectPeaks: {
                sampleRate: 64,
                channels: ['AMBIENT', 'INFRARED'],
            },
        },
    ],
}

// Test doubles

export let StreamMonitorComponent = StreamMonitor

export function setStreamMonitorComponent(component: typeof StreamMonitor) {
    StreamMonitorComponent = component
}
