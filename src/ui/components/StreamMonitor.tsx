import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import StreamPlot from './StreamPlot'

export interface StreamMonitorProps {
    streams: BiosignalStream[]
    windowSeconds?: number
}

const StreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    const { streams, windowSeconds = 10 } = props

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
                    [stream.wssPort]: appendToWindow(
                        previous[stream.wssPort],
                        { samples, timestamps },
                        windowSeconds
                    ),
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
                    windowSeconds={windowSeconds}
                />
            ))}
        </View>
    )
}

export default StreamMonitor

function appendToWindow(
    previous: StreamData | undefined,
    data: StreamData,
    windowSeconds: number
): StreamData {
    const channelCount = data.samples.length / data.timestamps.length

    const samples = [...(previous?.samples ?? []), ...data.samples]
    const timestamps = [...(previous?.timestamps ?? []), ...data.timestamps]

    const cutoff = timestamps[timestamps.length - 1] - windowSeconds
    const firstKept = timestamps.findIndex((timestamp) => timestamp >= cutoff)

    return {
        samples: samples.slice(firstKept * channelCount),
        timestamps: timestamps.slice(firstKept),
    }
}

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
