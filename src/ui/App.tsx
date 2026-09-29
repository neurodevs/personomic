import React from 'react'

import StreamMonitor from './components/StreamMonitor'
import { Downsampling } from './components/StreamPlot'

export interface AppProps {
    downsampling?: Downsampling
}

const App: React.FC<AppProps> = (props: AppProps) => {
    const { downsampling } = props

    return (
        <main className="app">
            <header className="app__header">
                <span className="app__wordmark">Personomic</span>
                <span className="app__tagline">Live biosignal monitor</span>
            </header>
            <StreamMonitorComponent
                downsampling={downsampling}
                streams={[
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
                ]}
            />
        </main>
    )
}

export default App

// Test doubles

export let StreamMonitorComponent = StreamMonitor

export function setStreamMonitorComponent(component: typeof StreamMonitor) {
    StreamMonitorComponent = component
}
