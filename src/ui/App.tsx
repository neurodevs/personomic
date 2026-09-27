import React from 'react'
import { Text, View } from 'react-native'

import StreamMonitor from './components/StreamMonitor'

const App: React.FC = () => {
    return (
        <View>
            <Text>Hello Personomic!</Text>
            <StreamMonitor
                streams={[
                    { name: 'EEG', wssPort: 8080 },
                    { name: 'PPG', wssPort: 8081 },
                ]}
            />
        </View>
    )
}

export default App
