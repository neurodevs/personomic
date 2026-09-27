import React from 'react'
import { View } from 'react-native'

import StreamPlot from './StreamPlot'

export interface StreamMonitorProps {
    streams: BiosignalStream[]
}

const StreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    const { streams } = props

    streams.forEach((stream) => {
        const url = `wss://localhost:${stream.wssPort}`
        new WebSocketComponent(url)
    })

    return (
        <View testID="stream-monitor">
            {streams.map((stream) => (
                <StreamPlotComponent key={stream.name} {...stream} />
            ))}
        </View>
    )
}

export default StreamMonitor

export interface BiosignalStream {
    name: string
    wssPort: number
}

// Test doubles

export let WebSocketComponent = WebSocket

export function setWebSocketComponent(component: typeof WebSocket) {
    WebSocketComponent = component
}

export let StreamPlotComponent = StreamPlot

export function setStreamPlotComponent(component: typeof StreamPlot) {
    StreamPlotComponent = component
}
