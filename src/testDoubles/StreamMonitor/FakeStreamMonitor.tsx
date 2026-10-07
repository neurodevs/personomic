import React, { useEffect } from 'react'

import { StreamMonitorProps } from '../../ui/components/StreamMonitor'

export let lastStreamMonitorProps: StreamMonitorProps | undefined
export let numStreamMonitorMounts = 0

const FakeStreamMonitor: React.FC<StreamMonitorProps> = (
    props: StreamMonitorProps
) => {
    lastStreamMonitorProps = props

    useEffect(() => {
        numStreamMonitorMounts++
    }, [])

    return <div data-testid="fake-stream-monitor" />
}

export default FakeStreamMonitor
