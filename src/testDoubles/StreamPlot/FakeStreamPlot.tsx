import React from 'react'

import { StreamPlotProps } from '../../ui/components/StreamPlot'

export let passedStreamPlotProps: StreamPlotProps[] = []

export function resetStreamPlotProps() {
    passedStreamPlotProps = []
}

const FakeStreamPlot: React.FC<StreamPlotProps> = (props: StreamPlotProps) => {
    passedStreamPlotProps.push(props)
    const { name } = props

    return <div data-testid={`stream-plot-${name}`} />
}

export default FakeStreamPlot
