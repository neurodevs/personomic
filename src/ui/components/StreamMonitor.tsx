import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import StreamPlot from './StreamPlot'

export interface StreamMonitorProps {
    streams: BiosignalStream[]
}

const StreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    const { streams } = props

    const [dataByPort, setDataByPort] = useState<Record<number, StreamData>>({})

    const wssPorts = streams.map((stream) => stream.wssPort).join(',')

    useEffect(() => {
        const sockets = streams.map((stream) => {
            const socket = new WebSocketComponent(
                `ws://localhost:${stream.wssPort}`
            )

            socket.onmessage = (event) => {
                const { samples, timestamps } = JSON.parse(event.data)

                setDataByPort((previous) => ({
                    ...previous,
                    [stream.wssPort]: { samples, timestamps },
                }))
            }

            return socket
        })

        return () => sockets.forEach((socket) => socket.close())
    }, [wssPorts])

    return (
        <View testID="stream-monitor">
            {streams.map((stream) => (
                <StreamPlotComponent
                    key={stream.name}
                    {...stream}
                    {...dataByPort[stream.wssPort]}
                />
            ))}
        </View>
    )
}

export default StreamMonitor

export interface StreamData {
    samples: number[]
    timestamps: number[]
}

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
