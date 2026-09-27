import React from 'react'
import { View } from 'react-native'

import { StreamMonitorProps } from '../../ui/components/StreamMonitor'

export let lastStreamMonitorProps: StreamMonitorProps | undefined

const FakeStreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    lastStreamMonitorProps = props

    return <View testID="fake-stream-monitor" />
}

export default FakeStreamMonitor
