import React from 'react'
import { View } from 'react-native'

import { StreamPlotProps } from '../../ui/components/StreamPlot'

export let passedStreamPlotProps: StreamPlotProps[] = []

export function resetStreamPlotProps() {
    passedStreamPlotProps = []
}

const FakeStreamPlot: React.FC<StreamPlotProps> = (props: StreamPlotProps) => {
    passedStreamPlotProps.push(props)
    const { name } = props

    return <View testID={`stream-plot-${name}`} />
}

export default FakeStreamPlot
