import React from 'react'

import StreamMonitor from './components/StreamMonitor'

const App: React.FC = () => {
    return (
        <main className="app">
            <header className="app__header">
                <span className="app__wordmark">Personomic</span>
                <span className="app__tagline">Live biosignal monitor</span>
            </header>
            <StreamMonitor
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
