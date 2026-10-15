import React, { useEffect } from 'react'

import { StreamPlotProps } from '../../ui/components/StreamPlot'

export let passedStreamPlotProps: StreamPlotProps[] = []
export let numStreamPlotMounts = 0

export function resetStreamPlotProps() {
    passedStreamPlotProps = []
    numStreamPlotMounts = 0
}

const FakeStreamPlot: React.FC<StreamPlotProps> = (props: StreamPlotProps) => {
    passedStreamPlotProps.push(props)
    const { name } = props

    useEffect(() => {
        numStreamPlotMounts++
    }, [])

    return <div data-testid={`stream-plot-${name}`} />
}

export default FakeStreamPlot
