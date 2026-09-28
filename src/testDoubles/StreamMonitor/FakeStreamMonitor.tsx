import React from 'react'

import { StreamMonitorProps } from '../../ui/components/StreamMonitor'

export let lastStreamMonitorProps: StreamMonitorProps | undefined

const FakeStreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    lastStreamMonitorProps = props

    return <div data-testid="fake-stream-monitor" />
}

export default FakeStreamMonitor
