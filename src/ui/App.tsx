import React from 'react'

import StreamMonitor from './components/StreamMonitor'

const App: React.FC = () => {
    return (
        <div>
            <span>Hello Personomic!</span>
            <StreamMonitor
                streams={[
                    { name: 'EEG', wssPort: 8765 },
                    { name: 'PPG', wssPort: 8766 },
                ]}
            />
        </div>
    )
}

export default App
